"""
OrahAI — AI service
Provides a single /chat endpoint that streams tokens from OpenAI or Anthropic.
Called by apps/api/src/services/ai.ts
"""

import os
import json
import httpx
from typing import AsyncIterator, Literal
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

load_dotenv()

app = FastAPI(title="OrahAI AI Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

OPENAI_API_KEY    = os.getenv("OPENAI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
INTERNAL_KEY      = os.getenv("AI_SERVICE_INTERNAL_KEY", "")
DEFAULT_MODEL     = os.getenv("AI_MODEL", "gpt-4o-mini")


class Message(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]
    system_prompt: str = ""
    model: str | None = None
    project_id: str | None = None


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/chat")
async def chat(
    req: ChatRequest,
    x_internal_key: str = Header(default=""),
):
    if INTERNAL_KEY and x_internal_key != INTERNAL_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")

    model = req.model or DEFAULT_MODEL

    if model.startswith("claude"):
        return EventSourceResponse(_stream_anthropic(req, model))
    else:
        return EventSourceResponse(_stream_openai(req, model))


async def _stream_openai(req: ChatRequest, model: str) -> AsyncIterator[dict]:
    if not OPENAI_API_KEY:
        yield {"data": json.dumps({"type": "error", "error": "OPENAI_API_KEY not set"})}
        return

    messages = []
    if req.system_prompt:
        messages.append({"role": "system", "content": req.system_prompt})
    messages.extend(m.model_dump() for m in req.messages)

    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "max_tokens": 4096,
        "temperature": 0.7,
    }

    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            "https://api.openai.com/v1/chat/completions",
            json=payload,
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
        ) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                yield {"data": json.dumps({"type": "error", "error": body.decode()})}
                return

            async for line in resp.aiter_lines():
                line = line.strip()
                if not line or not line.startswith("data: "):
                    continue
                data_str = line[6:]
                if data_str == "[DONE]":
                    yield {"data": json.dumps({"type": "done"})}
                    return
                try:
                    chunk = json.loads(data_str)
                    delta = chunk["choices"][0]["delta"].get("content", "")
                    if delta:
                        yield {"data": json.dumps({"type": "delta", "content": delta})}
                except (KeyError, json.JSONDecodeError):
                    continue


async def _stream_anthropic(req: ChatRequest, model: str) -> AsyncIterator[dict]:
    if not ANTHROPIC_API_KEY:
        yield {"data": json.dumps({"type": "error", "error": "ANTHROPIC_API_KEY not set"})}
        return

    payload = {
        "model": model,
        "max_tokens": 4096,
        "stream": True,
        "messages": [m.model_dump() for m in req.messages],
    }
    if req.system_prompt:
        payload["system"] = req.system_prompt

    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            "https://api.anthropic.com/v1/messages",
            json=payload,
            headers={
                "x-api-key": ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
            },
        ) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                yield {"data": json.dumps({"type": "error", "error": body.decode()})}
                return

            async for line in resp.aiter_lines():
                line = line.strip()
                if not line.startswith("data: "):
                    continue
                try:
                    event = json.loads(line[6:])
                    if event.get("type") == "content_block_delta":
                        delta = event.get("delta", {}).get("text", "")
                        if delta:
                            yield {"data": json.dumps({"type": "delta", "content": delta})}
                    elif event.get("type") == "message_stop":
                        yield {"data": json.dumps({"type": "done"})}
                        return
                except (KeyError, json.JSONDecodeError):
                    continue

import { config } from "../config";
import { logger } from "../utils/logger";

interface StreamChatOptions {
  messages: { role: "user" | "assistant"; content: string }[];
  systemPrompt: string;
  onDelta: (delta: string) => void;
  onDone: () => void;
}

export class AIService {
  private baseUrl: string;
  private internalKey: string;

  constructor() {
    this.baseUrl = config.aiServiceUrl ?? "http://localhost:8000";
    this.internalKey = config.aiServiceInternalKey ?? "";
  }

  async streamChat(opts: StreamChatOptions): Promise<void> {
    const { messages, systemPrompt, onDelta, onDone } = opts;

    const res = await fetch(`${this.baseUrl}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-key": this.internalKey,
      },
      body: JSON.stringify({ messages, system_prompt: systemPrompt }),
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`AI service error ${res.status}: ${text}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        try {
          const evt = JSON.parse(trimmed.slice(6)) as { type: string; content?: string };
          if (evt.type === "delta" && evt.content) onDelta(evt.content);
          else if (evt.type === "done") { onDone(); return; }
          else if (evt.type === "error") throw new Error(trimmed);
        } catch (e) {
          logger.warn("Malformed SSE event:", e);
        }
      }
    }
    onDone();
  }
}

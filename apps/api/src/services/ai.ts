import { config } from "../config";
import { logger } from "../utils/logger";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface StreamChatOptions {
  messages: ChatMessage[];
  model?: string;
  systemPrompt?: string;
  onDelta: (delta: string) => void;
  onDone: (usage: { totalTokens: number }) => void;
}

interface AgentTaskOptions {
  taskId: string;
  task: string;
  projectId: string;
  userId: string;
  conversationId: string;
}

export class AIService {
  /**
   * Stream a chat completion from the configured AI provider.
   * Supports OpenAI-compatible APIs.
   */
  async streamChat(options: StreamChatOptions): Promise<void> {
    const { messages, model, systemPrompt, onDelta, onDone } = options;
    const resolvedModel = model ?? config.ai.model;

    const systemMessages: ChatMessage[] = systemPrompt
      ? [{ role: "system", content: systemPrompt }]
      : [];

    const payload = {
      model: resolvedModel,
      messages: [...systemMessages, ...messages],
      stream: true,
      max_tokens: 4096,
      temperature: 0.7,
    };

    const isAnthropic = resolvedModel.startsWith("claude");
    const apiKey = isAnthropic ? config.ai.anthropicKey : config.ai.openaiKey;

    if (!apiKey) {
      throw new Error(`AI API key not configured for model: ${resolvedModel}`);
    }

    const endpoint = isAnthropic
      ? "https://api.anthropic.com/v1/messages"
      : "https://api.openai.com/v1/chat/completions";

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(isAnthropic
        ? {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "messages-2023-12-15",
          }
        : { Authorization: `Bearer ${apiKey}` }),
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => "unknown");
      throw new Error(`AI API error ${response.status}: ${errText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let totalTokens = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;

        const dataStr = trimmed.startsWith("data: ")
          ? trimmed.slice(6)
          : trimmed;

        try {
          const chunk = JSON.parse(dataStr) as {
            choices?: { delta?: { content?: string } }[];
            usage?: { total_tokens?: number };
          };

          const delta = chunk.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            onDelta(delta);
          }

          if (chunk.usage?.total_tokens) {
            totalTokens = chunk.usage.total_tokens;
          }
        } catch {
          // Skip malformed chunks
        }
      }
    }

    onDone({ totalTokens });
  }

  /**
   * Run an agentic task by delegating to the Python AI service.
   * The AI service handles the full plan → edit → run → fix loop.
   */
  async runAgentTask(options: AgentTaskOptions): Promise<void> {
    const url = `${config.aiServiceUrl}/agent/run`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Key": config.ai.serviceApiKey,
        },
        body: JSON.stringify(options),
      });

      if (!response.ok) {
        const err = await response.text().catch(() => "unknown");
        throw new Error(`AI service error ${response.status}: ${err}`);
      }
    } catch (err) {
      logger.error("Failed to dispatch agent task:", err);
      throw err;
    }
  }
}

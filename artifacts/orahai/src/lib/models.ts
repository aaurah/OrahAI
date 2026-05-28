export type ModelProvider = "openai" | "anthropic" | "ollama" | "ollama-remote" | "groq";

export interface ModelDef {
  id: string;
  name: string;
  provider: ModelProvider;
  badge?: string;
  vision?: boolean;
  size?: string;
  description?: string;
}

export interface ModelGroup {
  label: string;
  provider: ModelProvider;
  models: ModelDef[];
  note?: string;
}

export const MODEL_GROUPS: ModelGroup[] = [
  {
    label: "OpenAI",
    provider: "openai",
    models: [
      { id: "openai:gpt-4.1",         name: "GPT-4.1",       provider: "openai" },
      { id: "openai:gpt-4o",          name: "GPT-4o",         provider: "openai", vision: true },
      { id: "openai:gpt-4o-mini",     name: "GPT-4o Mini",    provider: "openai", badge: "Fast" },
      { id: "openai:o3-mini",         name: "o3-mini",         provider: "openai", badge: "Reason" },
      { id: "openai:gpt-4.1-mini",    name: "GPT-4.1 Mini",   provider: "openai", badge: "Fast" },
    ],
  },
  {
    label: "Anthropic — Claude",
    provider: "anthropic",
    note: "Requires ANTHROPIC_API_KEY in project or environment secrets",
    models: [
      { id: "anthropic:claude-opus-4-5",   name: "Claude Opus 4.5",    provider: "anthropic", badge: "Powerful", vision: true },
      { id: "anthropic:claude-sonnet-4-5", name: "Claude Sonnet 4.5",  provider: "anthropic", badge: "Best", vision: true },
      { id: "anthropic:claude-haiku-3-5",  name: "Claude Haiku 3.5",   provider: "anthropic", badge: "Fast" },
    ],
  },
  {
    label: "Groq — Free Cloud",
    provider: "groq",
    note: "Free API key at console.groq.com — requires GROQ_API_KEY secret",
    models: [
      { id: "groq:llama-3.3-70b-versatile",        name: "Llama 3.3 70B",        provider: "groq", badge: "Default", description: "Top-quality Llama on Groq's LPU — free tier" },
      { id: "groq:llama-3.1-8b-instant",            name: "Llama 3.1 8B Instant", provider: "groq", badge: "Fast",   description: "Blazing fast, great for quick tasks" },
      { id: "groq:deepseek-r1-distill-qwen-32b",    name: "DeepSeek R1 32B",      provider: "groq", badge: "Reason", description: "Strong reasoning model — free on Groq" },
      { id: "groq:qwen-qwq-32b",                    name: "Qwen QwQ 32B",         provider: "groq", badge: "Reason", description: "Alibaba reasoning model" },
      { id: "groq:mixtral-8x7b-32768",              name: "Mixtral 8×7B",         provider: "groq", badge: "MoE",    description: "Mixture-of-experts, 32k context" },
      { id: "groq:gemma2-9b-it",                    name: "Gemma 2 9B",           provider: "groq", description: "Google Gemma 2 — fast and capable" },
    ],
  },
  {
    label: "Ollama — Local / Self-Hosted",
    provider: "ollama",
    note: "Set OLLAMA_BASE_URL secret (default: http://localhost:11434)",
    models: [
      { id: "ollama:llama3.2:1b",        name: "Llama 3.2 1B",       provider: "ollama", badge: "Tiny",  size: "~0.8 GB",  description: "Fastest, minimal quality" },
      { id: "ollama:llama3.2:3b",        name: "Llama 3.2 3B",       provider: "ollama", badge: "Small", size: "~1.9 GB",  description: "Good balance of speed and quality" },
      { id: "ollama:llama3.2",           name: "Llama 3.2",          provider: "ollama",               size: "~1.9 GB",  description: "Meta Llama 3.2 (3B default)" },
      { id: "ollama:llama3.1:8b",        name: "Llama 3.1 8B",       provider: "ollama",               size: "~4.7 GB",  description: "Strong reasoning, larger memory needed" },
      { id: "ollama:llama3.1:70b",       name: "Llama 3.1 70B",      provider: "ollama", badge: "Big",   size: "~40 GB",   description: "Top quality, requires powerful server" },
      { id: "ollama:codellama:7b",       name: "CodeLlama 7B",       provider: "ollama", badge: "Code",  size: "~3.8 GB",  description: "Optimized for code generation" },
      { id: "ollama:codellama:13b",      name: "CodeLlama 13B",      provider: "ollama", badge: "Code",  size: "~7.4 GB",  description: "Larger code-focused model" },
      { id: "ollama:llava:7b",           name: "LLaVA 7B",           provider: "ollama", vision: true,  size: "~4.7 GB",  description: "Vision + text understanding" },
      { id: "ollama:llava:13b",          name: "LLaVA 13B",          provider: "ollama", vision: true,  size: "~8.0 GB",  description: "Larger multimodal model" },
      { id: "ollama:mistral:7b",         name: "Mistral 7B",         provider: "ollama",               size: "~4.1 GB",  description: "Fast, efficient European model" },
      { id: "ollama:mixtral:8x7b",       name: "Mixtral 8×7B",       provider: "ollama", badge: "MoE",  size: "~26 GB",   description: "Mixture of experts, high quality" },
      { id: "ollama:phi3:mini",          name: "Phi-3 Mini",         provider: "ollama", badge: "Small", size: "~2.3 GB",  description: "Microsoft small but capable model" },
      { id: "ollama:phi3:medium",        name: "Phi-3 Medium",       provider: "ollama",               size: "~7.9 GB",  description: "Microsoft medium model" },
      { id: "ollama:phi4",              name: "Phi-4",               provider: "ollama",               size: "~8.5 GB",  description: "Microsoft Phi-4 reasoning model" },
      { id: "ollama:gemma3:4b",          name: "Gemma 3 4B",         provider: "ollama",               size: "~3.3 GB",  description: "Google Gemma 3 small" },
      { id: "ollama:gemma3:12b",         name: "Gemma 3 12B",        provider: "ollama",               size: "~8.1 GB",  description: "Google Gemma 3 medium" },
      { id: "ollama:deepseek-coder-v2",  name: "DeepSeek Coder V2",  provider: "ollama", badge: "Code",  size: "~8.9 GB",  description: "Top-tier code model" },
      { id: "ollama:qwen2.5-coder:7b",   name: "Qwen 2.5 Coder 7B", provider: "ollama", badge: "Code",  size: "~4.7 GB",  description: "Alibaba code-focused model" },
      { id: "ollama:qwen2.5-coder:14b",  name: "Qwen 2.5 Coder 14B",provider: "ollama", badge: "Code",  size: "~9.0 GB",  description: "Larger Qwen coder" },
      { id: "ollama:nomic-embed-text",   name: "Nomic Embed Text",   provider: "ollama", badge: "Embed", size: "~274 MB",  description: "Text embedding model" },
    ],
  },
];

export const ALL_MODELS = MODEL_GROUPS.flatMap(g => g.models);

export function getModelDef(id: string): ModelDef | undefined {
  return ALL_MODELS.find(m => m.id === id);
}

export function getModelShortName(id: string): string {
  return getModelDef(id)?.name ?? id.split(":").pop() ?? id;
}

export function makeOllamaModelDef(name: string): ModelDef {
  return { id: `ollama:${name}`, name, provider: "ollama" };
}

export function makeOllamaRemoteModelDef(name: string): ModelDef {
  return { id: `ollama-remote:${name}`, name, provider: "ollama-remote" };
}

export const DEFAULT_MODEL = "groq:llama-3.3-70b-versatile";

export const OLLAMA_MODEL_LIBRARY: Array<{
  id: string;
  name: string;
  size: string;
  description: string;
  tags?: string[];
  vision?: boolean;
  badge?: string;
}> = [
  { id: "llama3.2:1b",        name: "Llama 3.2 1B",        size: "~0.8 GB",  description: "Smallest Llama — blazing fast",               badge: "Tiny",  tags: ["general", "fast"] },
  { id: "llama3.2:3b",        name: "Llama 3.2 3B",        size: "~1.9 GB",  description: "Best size/quality ratio for most tasks",       badge: "Popular", tags: ["general"] },
  { id: "llama3.1:8b",        name: "Llama 3.1 8B",        size: "~4.7 GB",  description: "Strong reasoning for everyday tasks",           tags: ["general"] },
  { id: "llama3.1:70b",       name: "Llama 3.1 70B",       size: "~40 GB",   description: "Flagship Llama — GPT-4 class quality",          badge: "Big",   tags: ["general", "powerful"] },
  { id: "phi4",               name: "Phi-4",               size: "~8.5 GB",  description: "Microsoft's reasoning-focused model",           tags: ["general", "reason"] },
  { id: "phi3:mini",          name: "Phi-3 Mini",          size: "~2.3 GB",  description: "Compact Microsoft model with great perf",       badge: "Small", tags: ["fast"] },
  { id: "mistral:7b",         name: "Mistral 7B",          size: "~4.1 GB",  description: "Fast, efficient European open model",           tags: ["general"] },
  { id: "mixtral:8x7b",       name: "Mixtral 8×7B",        size: "~26 GB",   description: "Mixture-of-experts, high quality responses",   badge: "MoE",   tags: ["powerful"] },
  { id: "gemma3:4b",          name: "Gemma 3 4B",          size: "~3.3 GB",  description: "Google's efficient small model",                tags: ["general"] },
  { id: "gemma3:12b",         name: "Gemma 3 12B",         size: "~8.1 GB",  description: "Google's capable mid-size model",               tags: ["general", "powerful"] },
  { id: "codellama:7b",       name: "CodeLlama 7B",        size: "~3.8 GB",  description: "Meta's code-specialized Llama model",           badge: "Code",  tags: ["code"] },
  { id: "codellama:13b",      name: "CodeLlama 13B",       size: "~7.4 GB",  description: "Larger code-focused model",                     badge: "Code",  tags: ["code"] },
  { id: "deepseek-coder-v2",  name: "DeepSeek Coder V2",   size: "~8.9 GB",  description: "State-of-the-art code generation",             badge: "Code",  tags: ["code", "powerful"] },
  { id: "qwen2.5-coder:7b",   name: "Qwen 2.5 Coder 7B",  size: "~4.7 GB",  description: "Alibaba's code-focused model",                  badge: "Code",  tags: ["code"] },
  { id: "qwen2.5-coder:14b",  name: "Qwen 2.5 Coder 14B", size: "~9.0 GB",  description: "Larger Qwen code model",                        badge: "Code",  tags: ["code", "powerful"] },
  { id: "llava:7b",           name: "LLaVA 7B",            size: "~4.7 GB",  description: "Vision + text — understands images",           vision: true,   tags: ["vision"] },
  { id: "llava:13b",          name: "LLaVA 13B",           size: "~8.0 GB",  description: "Larger multimodal vision model",               vision: true,   tags: ["vision", "powerful"] },
  { id: "nomic-embed-text",   name: "Nomic Embed Text",    size: "~274 MB",  description: "Fast text embedding model",                     badge: "Embed", tags: ["embed"] },
];

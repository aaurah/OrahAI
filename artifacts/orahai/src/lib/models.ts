export type ModelProvider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "xai"
  | "perplexity"
  | "deepseek"
  | "ollama"
  | "ollama-remote"
  | "groq"
  | "auto";

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
    label: "Auto",
    provider: "auto",
    note: "Prefers local Ollama — falls back to cloud only when a key is set",
    models: [
      {
        id: "auto:auto",
        name: "Auto (Smart Routing)",
        provider: "auto",
        badge: "Free",
        description: "Defaults to local Ollama (free). When API keys are present: code → DeepSeek, search → Sonar, reasoning → R1/Qwen",
      },
    ],
  },
  {
    label: "OpenAI — GPT",
    provider: "openai",
    note: "Uses Replit AI proxy automatically, or set OPENAI_API_KEY for your own account",
    models: [
      { id: "openai:gpt-4.1",         name: "GPT-4.1",         provider: "openai", badge: "Latest",  vision: true,  description: "OpenAI flagship — best overall quality" },
      { id: "openai:gpt-4o",          name: "GPT-4o",           provider: "openai",                   vision: true,  description: "Fast multimodal model" },
      { id: "openai:gpt-4o-mini",     name: "GPT-4o Mini",      provider: "openai", badge: "Fast",                  description: "Affordable, fast GPT-4 class" },
      { id: "openai:o3-mini",         name: "o3-mini",           provider: "openai", badge: "Reason",               description: "OpenAI reasoning model" },
      { id: "openai:gpt-4.1-mini",    name: "GPT-4.1 Mini",     provider: "openai", badge: "Fast",                  description: "Compact GPT-4.1" },
    ],
  },
  {
    label: "Anthropic — Claude",
    provider: "anthropic",
    note: "Requires ANTHROPIC_API_KEY in secrets (console.anthropic.com)",
    models: [
      { id: "anthropic:claude-opus-4-5",            name: "Claude Opus 4.5",    provider: "anthropic", badge: "Powerful", vision: true, description: "Best Claude — long context, complex tasks" },
      { id: "anthropic:claude-opus-4-8",            name: "Claude Opus 4.8",    provider: "anthropic", badge: "Latest",   vision: true, description: "Latest Claude Opus" },
      { id: "anthropic:claude-sonnet-4-5",          name: "Claude Sonnet 4.5",  provider: "anthropic", badge: "Best",     vision: true, description: "Top quality/speed balance" },
      { id: "anthropic:claude-sonnet-4-6",          name: "Claude Sonnet 4.6",  provider: "anthropic", badge: "New",      vision: true, description: "Latest Claude Sonnet" },
      { id: "anthropic:claude-haiku-4-5-20251001",  name: "Claude Haiku 4.5",   provider: "anthropic", badge: "Fast",                  description: "Fast, affordable Claude" },
    ],
  },
  {
    label: "Google — Gemini",
    provider: "gemini",
    note: "Requires GOOGLE_API_KEY in secrets (aistudio.google.com/apikey — free tier available)",
    models: [
      { id: "gemini:gemini-2.5-pro-preview-06-05",   name: "Gemini 2.5 Pro",    provider: "gemini", badge: "Best",  vision: true, description: "Google's most capable — superb coding & reasoning" },
      { id: "gemini:gemini-2.5-flash-preview-05-20", name: "Gemini 2.5 Flash",  provider: "gemini", badge: "Fast",  vision: true, description: "Fast, efficient, great daily driver" },
      { id: "gemini:gemini-2.0-flash",               name: "Gemini 2.0 Flash",  provider: "gemini", badge: "Speed", vision: true, description: "Lightning-fast Gemini 2.0" },
      { id: "gemini:gemini-1.5-pro",                 name: "Gemini 1.5 Pro",    provider: "gemini",                vision: true, description: "1M token context window" },
    ],
  },
  {
    label: "xAI — Grok",
    provider: "xai",
    note: "Requires XAI_API_KEY in secrets (console.x.ai)",
    models: [
      { id: "xai:grok-3",      name: "Grok 3",       provider: "xai", badge: "Best", description: "xAI flagship — strong reasoning, broad knowledge" },
      { id: "xai:grok-3-mini", name: "Grok 3 Mini",  provider: "xai", badge: "Fast", description: "Efficient Grok — great price/performance" },
      { id: "xai:grok-2",      name: "Grok 2",       provider: "xai",               description: "Previous Grok generation" },
    ],
  },
  {
    label: "Perplexity — Sonar",
    provider: "perplexity",
    note: "Requires PERPLEXITY_API_KEY in secrets (perplexity.ai/api) — models search the live web",
    models: [
      { id: "perplexity:sonar-pro",           name: "Sonar Pro",           provider: "perplexity", badge: "Online", description: "Best Perplexity model — web search + deep reasoning" },
      { id: "perplexity:sonar",               name: "Sonar",               provider: "perplexity", badge: "Online", description: "Fast online model with live web search" },
      { id: "perplexity:sonar-reasoning-pro", name: "Sonar Reasoning Pro", provider: "perplexity", badge: "Reason", description: "Chain-of-thought reasoning + live web access" },
      { id: "perplexity:sonar-reasoning",     name: "Sonar Reasoning",     provider: "perplexity", badge: "Reason", description: "Fast reasoning with web search" },
    ],
  },
  {
    label: "DeepSeek",
    provider: "deepseek",
    note: "Requires DEEPSEEK_API_KEY in secrets (platform.deepseek.com) — very affordable rates",
    models: [
      { id: "deepseek:deepseek-chat",     name: "DeepSeek V3",   provider: "deepseek", badge: "Code",   description: "DeepSeek V3 — top-tier coding, MoE architecture" },
      { id: "deepseek:deepseek-reasoner", name: "DeepSeek R1",   provider: "deepseek", badge: "Reason", description: "Chain-of-thought reasoning, math & complex logic" },
    ],
  },
  {
    label: "Groq — Free Cloud",
    provider: "groq",
    note: "Free API key at console.groq.com — requires GROQ_API_KEY secret",
    models: [
      { id: "groq:llama-3.3-70b-versatile",                         name: "Llama 3.3 70B",          provider: "groq", badge: "Default", description: "Top-quality Llama on Groq's LPU — free tier" },
      { id: "groq:llama-3.1-8b-instant",                            name: "Llama 3.1 8B Instant",   provider: "groq", badge: "Fast",    description: "Blazing fast, great for quick tasks" },
      { id: "groq:meta-llama/llama-4-scout-17b-16e-instruct",       name: "Llama 4 Scout 17B",      provider: "groq", badge: "New",     description: "Meta Llama 4 Scout — multimodal" },
      { id: "groq:meta-llama/llama-4-maverick-17b-128e-instruct",   name: "Llama 4 Maverick 17B",   provider: "groq", badge: "New",     description: "Meta Llama 4 Maverick — large context" },
      { id: "groq:qwen/qwen3-32b",                                  name: "Qwen 3 32B",             provider: "groq", badge: "Reason",  description: "Alibaba Qwen 3 — strong reasoning" },
      { id: "groq:compound-beta",                                    name: "Groq Compound",          provider: "groq", badge: "Best",    description: "Groq's compound model — best quality" },
      { id: "groq:compound-beta-mini",                              name: "Groq Compound Mini",     provider: "groq", badge: "Fast",    description: "Groq's compound mini — fast & smart" },
    ],
  },
  {
    label: "Ollama — Free, Local",
    provider: "ollama",
    note: "Runs on your server — free, no API key needed",
    models: [
      { id: "ollama:llama3.2:1b",        name: "Llama 3.2 1B",        provider: "ollama", badge: "Tiny",  size: "~0.8 GB",  description: "Fastest, minimal quality" },
      { id: "ollama:llama3.2:3b",        name: "Llama 3.2 3B",        provider: "ollama", badge: "Small", size: "~1.9 GB",  description: "Good balance of speed and quality" },
      { id: "ollama:llama3.1:8b",        name: "Llama 3.1 8B",        provider: "ollama",               size: "~4.7 GB",  description: "Strong reasoning, everyday tasks" },
      { id: "ollama:llama3.1:70b",       name: "Llama 3.1 70B",       provider: "ollama", badge: "Big",   size: "~40 GB",   description: "Top quality, requires powerful server" },
      { id: "ollama:codellama:7b",       name: "CodeLlama 7B",        provider: "ollama", badge: "Code",  size: "~3.8 GB",  description: "Optimized for code generation" },
      { id: "ollama:codellama:13b",      name: "CodeLlama 13B",       provider: "ollama", badge: "Code",  size: "~7.4 GB",  description: "Larger code-focused model" },
      { id: "ollama:llava:7b",           name: "LLaVA 7B",            provider: "ollama", vision: true,  size: "~4.7 GB",  description: "Vision + text understanding" },
      { id: "ollama:llava:13b",          name: "LLaVA 13B",           provider: "ollama", vision: true,  size: "~8.0 GB",  description: "Larger multimodal model" },
      { id: "ollama:mistral:7b",         name: "Mistral 7B",          provider: "ollama",               size: "~4.1 GB",  description: "Fast, efficient European model" },
      { id: "ollama:mixtral:8x7b",       name: "Mixtral 8×7B",        provider: "ollama", badge: "MoE",  size: "~26 GB",   description: "Mixture of experts, high quality" },
      { id: "ollama:phi4",               name: "Phi-4",               provider: "ollama",               size: "~8.5 GB",  description: "Microsoft Phi-4 reasoning model" },
      { id: "ollama:phi3:mini",          name: "Phi-3 Mini",          provider: "ollama", badge: "Small", size: "~2.3 GB",  description: "Microsoft small model" },
      { id: "ollama:gemma3:4b",          name: "Gemma 3 4B",          provider: "ollama",               size: "~3.3 GB",  description: "Google Gemma 3 small" },
      { id: "ollama:gemma3:12b",         name: "Gemma 3 12B",         provider: "ollama",               size: "~8.1 GB",  description: "Google Gemma 3 medium" },
      { id: "ollama:deepseek-coder-v2",  name: "DeepSeek Coder V2",   provider: "ollama", badge: "Code",  size: "~8.9 GB",  description: "Top-tier code model" },
      { id: "ollama:qwen2.5-coder:7b",   name: "Qwen 2.5 Coder 7B",  provider: "ollama", badge: "Code",  size: "~4.7 GB",  description: "Alibaba code model" },
      { id: "ollama:qwen2.5-coder:14b",  name: "Qwen 2.5 Coder 14B", provider: "ollama", badge: "Code",  size: "~9.0 GB",  description: "Larger Qwen coder" },
      { id: "ollama:nomic-embed-text",   name: "Nomic Embed Text",    provider: "ollama", badge: "Embed", size: "~274 MB",  description: "Text embedding model" },
    ],
  },
];

export const ALL_MODELS = MODEL_GROUPS.flatMap(g => g.models);

export function getModelDef(id: string): ModelDef | undefined {
  return ALL_MODELS.find(m => m.id === id);
}

export function getModelShortName(id: string): string {
  if (id === "auto:auto") return "Auto";
  return getModelDef(id)?.name ?? id.split(":").pop() ?? id;
}

export function makeOllamaModelDef(name: string): ModelDef {
  return { id: `ollama:${name}`, name, provider: "ollama" };
}

export function makeOllamaRemoteModelDef(name: string): ModelDef {
  return { id: `ollama-remote:${name}`, name, provider: "ollama-remote" };
}

export const DEFAULT_MODEL = "auto:auto";

export const OLLAMA_MODEL_LIBRARY: Array<{
  id: string;
  name: string;
  size: string;
  description: string;
  tags?: string[];
  vision?: boolean;
  badge?: string;
}> = [
  { id: "llama3.2:1b",        name: "Llama 3.2 1B",        size: "~0.8 GB",  description: "Smallest Llama — blazing fast",               badge: "Tiny",    tags: ["general", "fast"] },
  { id: "llama3.2:3b",        name: "Llama 3.2 3B",        size: "~1.9 GB",  description: "Best size/quality ratio for most tasks",       badge: "Popular", tags: ["general"] },
  { id: "llama3.1:8b",        name: "Llama 3.1 8B",        size: "~4.7 GB",  description: "Strong reasoning for everyday tasks",           tags: ["general"] },
  { id: "llama3.1:70b",       name: "Llama 3.1 70B",       size: "~40 GB",   description: "Flagship Llama — GPT-4 class quality",          badge: "Big",     tags: ["general", "powerful"] },
  { id: "phi4",               name: "Phi-4",               size: "~8.5 GB",  description: "Microsoft's reasoning-focused model",           tags: ["general", "reason"] },
  { id: "phi3:mini",          name: "Phi-3 Mini",          size: "~2.3 GB",  description: "Compact Microsoft model with great perf",       badge: "Small",   tags: ["fast"] },
  { id: "mistral:7b",         name: "Mistral 7B",          size: "~4.1 GB",  description: "Fast, efficient European open model",           tags: ["general"] },
  { id: "mixtral:8x7b",       name: "Mixtral 8×7B",        size: "~26 GB",   description: "Mixture-of-experts, high quality responses",    badge: "MoE",     tags: ["powerful"] },
  { id: "gemma3:4b",          name: "Gemma 3 4B",          size: "~3.3 GB",  description: "Google's efficient small model",                tags: ["general"] },
  { id: "gemma3:12b",         name: "Gemma 3 12B",         size: "~8.1 GB",  description: "Google's capable mid-size model",               tags: ["general", "powerful"] },
  { id: "codellama:7b",       name: "CodeLlama 7B",        size: "~3.8 GB",  description: "Meta's code-specialized Llama model",           badge: "Code",    tags: ["code"] },
  { id: "codellama:13b",      name: "CodeLlama 13B",       size: "~7.4 GB",  description: "Larger code-focused model",                     badge: "Code",    tags: ["code"] },
  { id: "deepseek-coder-v2",  name: "DeepSeek Coder V2",   size: "~8.9 GB",  description: "State-of-the-art code generation",              badge: "Code",    tags: ["code", "powerful"] },
  { id: "qwen2.5-coder:7b",   name: "Qwen 2.5 Coder 7B",  size: "~4.7 GB",  description: "Alibaba's code-focused model",                  badge: "Code",    tags: ["code"] },
  { id: "qwen2.5-coder:14b",  name: "Qwen 2.5 Coder 14B", size: "~9.0 GB",  description: "Larger Qwen code model",                        badge: "Code",    tags: ["code", "powerful"] },
  { id: "llava:7b",           name: "LLaVA 7B",            size: "~4.7 GB",  description: "Vision + text — understands images",            vision: true,     tags: ["vision"] },
  { id: "llava:13b",          name: "LLaVA 13B",           size: "~8.0 GB",  description: "Larger multimodal vision model",                vision: true,     tags: ["vision", "powerful"] },
  { id: "nomic-embed-text",   name: "Nomic Embed Text",    size: "~274 MB",  description: "Fast text embedding model",                     badge: "Embed",   tags: ["embed"] },
];

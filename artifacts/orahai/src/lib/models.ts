export type ModelProvider = "openai" | "anthropic" | "ollama";

export interface ModelDef {
  id: string;
  name: string;
  provider: ModelProvider;
  badge?: string;
  vision?: boolean;
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
      { id: "openai:gpt-4.1",     name: "GPT-4.1",     provider: "openai", badge: "Default" },
      { id: "openai:gpt-4o",      name: "GPT-4o",      provider: "openai", vision: true },
      { id: "openai:gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", badge: "Fast" },
      { id: "openai:o3-mini",     name: "o3-mini",     provider: "openai", badge: "Reason" },
    ],
  },
  {
    label: "Anthropic — Claude",
    provider: "anthropic",
    note: "Needs ANTHROPIC_API_KEY secret",
    models: [
      { id: "anthropic:claude-opus-4-7",   name: "Claude Opus 4",   provider: "anthropic", badge: "Powerful", vision: true },
      { id: "anthropic:claude-sonnet-4-6", name: "Claude Sonnet 4", provider: "anthropic", vision: true },
      { id: "anthropic:claude-haiku-4-5",  name: "Claude Haiku 4",  provider: "anthropic", badge: "Fast" },
    ],
  },
  {
    label: "Ollama — Local",
    provider: "ollama",
    note: "Needs OLLAMA_BASE_URL secret",
    models: [
      { id: "ollama:llama3.2",          name: "Llama 3.2",         provider: "ollama" },
      { id: "ollama:llama3.1",          name: "Llama 3.1",         provider: "ollama" },
      { id: "ollama:llama3.1:70b",      name: "Llama 3.1 70B",     provider: "ollama", badge: "Big" },
      { id: "ollama:codellama",         name: "CodeLlama",         provider: "ollama", badge: "Code" },
      { id: "ollama:llava",             name: "LLaVA",             provider: "ollama", vision: true },
      { id: "ollama:mistral",           name: "Mistral 7B",        provider: "ollama" },
      { id: "ollama:phi3",              name: "Phi-3",             provider: "ollama", badge: "Small" },
      { id: "ollama:deepseek-coder-v2", name: "DeepSeek Coder",    provider: "ollama", badge: "Code" },
      { id: "ollama:qwen2.5-coder",     name: "Qwen 2.5 Coder",   provider: "ollama", badge: "Code" },
      { id: "ollama:gemma3",            name: "Gemma 3",           provider: "ollama" },
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

export const DEFAULT_MODEL = "openai:gpt-4.1";

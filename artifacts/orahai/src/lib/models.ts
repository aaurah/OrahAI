export type ModelProvider = "anthropic";

export interface ModelDef {
  id: string;
  name: string;
  provider: ModelProvider;
  badge?: string;
  vision?: boolean;
  description?: string;
}

export interface ModelGroup {
  label: string;
  provider: ModelProvider;
  models: ModelDef[];
}

export const MODEL_GROUPS: ModelGroup[] = [
  {
    label: "Claude",
    provider: "anthropic",
    models: [
      { id: "anthropic:claude-opus-4-5",           name: "Claude Opus 4.5",   provider: "anthropic", badge: "Powerful", vision: true, description: "Best Claude — long context, complex tasks" },
      { id: "anthropic:claude-sonnet-4-5",         name: "Claude Sonnet 4.5", provider: "anthropic", badge: "Best",     vision: true, description: "Top quality/speed balance" },
      { id: "anthropic:claude-sonnet-4-6",         name: "Claude Sonnet 4.6", provider: "anthropic", badge: "New",      vision: true, description: "Latest Claude Sonnet" },
      { id: "anthropic:claude-haiku-4-5-20251001", name: "Claude Haiku 4.5",  provider: "anthropic", badge: "Fast",                  description: "Fast, affordable Claude" },
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

export const DEFAULT_MODEL = "anthropic:claude-sonnet-4-5";

import { useState, useEffect } from "react";
import { Bot, CheckCircle2, XCircle, ExternalLink, Key, Zap, Github } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { api } from "@/lib/api";
import { MODEL_GROUPS } from "@/lib/models";

interface ProviderStatus {
  available: boolean;
  models?: string[];
}

interface ProvidersResponse {
  providers: {
    anthropic: ProviderStatus;
    github: ProviderStatus;
  };
}

function ProviderCard({
  available,
  title,
  icon,
  configuredMsg,
  missingMsg,
  setupInstructions,
}: {
  available: boolean | null;
  title: string;
  icon: React.ReactNode;
  configuredMsg: string;
  missingMsg: string;
  setupInstructions: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-5 mb-4 transition-colors ${
      available === true
        ? "border-green-500/20 bg-green-500/5"
        : available === false
          ? "border-amber-500/20 bg-amber-500/5"
          : "border-border bg-card"
    }`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${available ? "bg-green-500/10 text-green-400" : "bg-amber-500/10 text-amber-400"}`}>
          {icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{title}</span>
            {available === true && (
              <div className="flex items-center gap-1 text-green-400 text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Configured
              </div>
            )}
            {available === false && (
              <div className="flex items-center gap-1 text-amber-400 text-xs font-medium">
                <XCircle className="w-3.5 h-3.5" /> Not configured
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {available ? configuredMsg : missingMsg}
          </p>
        </div>
      </div>

      {!available && (
        <div className="rounded-lg bg-muted/40 border border-border/40 p-3 text-xs space-y-2 mt-2">
          <p className="font-medium flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-primary" /> How to configure
          </p>
          {setupInstructions}
        </div>
      )}
    </div>
  );
}

export default function AiModelsPage() {
  const [providers, setProviders] = useState<ProvidersResponse["providers"] | null>(null);

  useEffect(() => {
    api.get<ProvidersResponse>("/api/ai/providers")
      .then(res => setProviders(res.providers))
      .catch(() => setProviders({ anthropic: { available: false }, github: { available: false } }));
  }, []);

  const anthropicAvailable = providers?.anthropic?.available ?? null;
  const githubAvailable    = providers?.github?.available    ?? null;

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-10">

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="w-6 h-6 text-primary" />
              AI Models
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure AI providers to power the chat assistant.
            </p>
          </div>
          <button onClick={() => window.history.back()}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back
          </button>
        </div>

        {/* Anthropic */}
        <ProviderCard
          available={anthropicAvailable}
          title="Anthropic Claude"
          icon={<Zap className="w-4 h-4" />}
          configuredMsg="ANTHROPIC_API_KEY is set — all Claude models are available."
          missingMsg="Add ANTHROPIC_API_KEY to Replit Secrets to enable Claude models."
          setupInstructions={
            <ol className="space-y-1 text-muted-foreground list-decimal list-inside">
              <li>Go to <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">console.anthropic.com <ExternalLink className="w-2.5 h-2.5" /></a> and create an API key.</li>
              <li>In Replit, open the <strong className="text-foreground">Secrets</strong> tab and add <code className="bg-background rounded px-1 py-0.5 font-mono">ANTHROPIC_API_KEY</code>.</li>
              <li>Restart the API server.</li>
            </ol>
          }
        />

        {/* GitHub Copilot */}
        <ProviderCard
          available={githubAvailable}
          title="GitHub Copilot"
          icon={<Github className="w-4 h-4" />}
          configuredMsg="GITHUB_COPILOT_TOKEN is set — GPT-4o, o1, o3-mini and more are available."
          missingMsg="Add GITHUB_COPILOT_TOKEN to enable GitHub Copilot models (GPT-4o, o3-mini, o1…)."
          setupInstructions={
            <ol className="space-y-1 text-muted-foreground list-decimal list-inside">
              <li>Go to <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">github.com/settings/tokens <ExternalLink className="w-2.5 h-2.5" /></a> and create a <strong className="text-foreground">classic PAT</strong> with <code className="bg-background rounded px-1 py-0.5 font-mono">copilot</code> scope.</li>
              <li>In Replit, open the <strong className="text-foreground">Secrets</strong> tab and add <code className="bg-background rounded px-1 py-0.5 font-mono">GITHUB_COPILOT_TOKEN</code>.</li>
              <li>Restart the API server.</li>
            </ol>
          }
        />

        {/* Models by group */}
        {MODEL_GROUPS.map(group => (
          <section key={group.provider} className="mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {group.label} Models
            </h2>
            <div className="rounded-xl border bg-card overflow-hidden divide-y divide-border">
              {group.models.map(model => (
                <div key={model.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{model.name}</span>
                      {model.badge && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                          {model.badge}
                        </span>
                      )}
                      {model.vision && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 font-medium">
                          Vision
                        </span>
                      )}
                    </div>
                    {model.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{model.description}</p>
                    )}
                  </div>
                  <code className="text-[10px] font-mono text-muted-foreground bg-muted rounded px-1.5 py-0.5 shrink-0">
                    {model.id}
                  </code>
                </div>
              ))}
            </div>
          </section>
        ))}

      </main>
    </div>
  );
}

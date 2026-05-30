import { useState, useEffect } from "react";
import { Bot, CheckCircle2, XCircle, ExternalLink, Key, Zap } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { api } from "@/lib/api";
import { MODEL_GROUPS } from "@/lib/models";

interface ProviderStatus {
  available: boolean;
  models?: string[];
}

export default function AiModelsPage() {
  const [anthropicAvailable, setAnthropicAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    api.get<{ providers: { anthropic: ProviderStatus } }>("/api/ai/providers")
      .then(res => setAnthropicAvailable(res.providers?.anthropic?.available ?? false))
      .catch(() => setAnthropicAvailable(false));
  }, []);

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
              OrahAI uses Anthropic Claude for all AI features.
            </p>
          </div>
          <button onClick={() => window.history.back()}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back
          </button>
        </div>

        {/* Provider status card */}
        <div className={`rounded-xl border p-5 mb-6 transition-colors ${
          anthropicAvailable === true
            ? "border-green-500/20 bg-green-500/5"
            : anthropicAvailable === false
              ? "border-amber-500/20 bg-amber-500/5"
              : "border-border bg-card"
        }`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`p-2 rounded-lg ${anthropicAvailable ? "bg-green-500/10 text-green-400" : "bg-amber-500/10 text-amber-400"}`}>
              <Zap className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">Anthropic Claude</span>
                {anthropicAvailable === true && (
                  <div className="flex items-center gap-1 text-green-400 text-xs font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Configured
                  </div>
                )}
                {anthropicAvailable === false && (
                  <div className="flex items-center gap-1 text-amber-400 text-xs font-medium">
                    <XCircle className="w-3.5 h-3.5" /> API key missing
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {anthropicAvailable ? "ANTHROPIC_API_KEY is set — all Claude models are available." : "Add ANTHROPIC_API_KEY to Replit Secrets to enable AI."}
              </p>
            </div>
          </div>

          {!anthropicAvailable && (
            <div className="rounded-lg bg-muted/40 border border-border/40 p-3 text-xs space-y-2 mt-2">
              <p className="font-medium flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-primary" /> How to add your API key
              </p>
              <ol className="space-y-1 text-muted-foreground list-decimal list-inside">
                <li>Go to <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">console.anthropic.com <ExternalLink className="w-2.5 h-2.5" /></a> and create an API key.</li>
                <li>In Replit, open the <strong className="text-foreground">Secrets</strong> tab (lock icon in the left sidebar).</li>
                <li>Add a secret with key <code className="bg-background rounded px-1 py-0.5 font-mono">ANTHROPIC_API_KEY</code> and paste your key as the value.</li>
                <li>Restart the API server workflow.</li>
              </ol>
            </div>
          )}
        </div>

        {/* Available models */}
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Available Models</h2>
          <div className="rounded-xl border bg-card overflow-hidden divide-y divide-border">
            {MODEL_GROUPS.flatMap(g => g.models).map(model => (
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

      </main>
    </div>
  );
}

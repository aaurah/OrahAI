import { useState, useEffect } from "react";
import { X, Package, Terminal, Loader2, CheckCircle2, ChevronDown, ChevronUp, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import type { ApiResponse } from "@/types";

interface SetupInfo {
  framework: string;
  language: string;
  installCmd: string | null;
  devCmd: string | null;
  runCmd: string | null;
  buildCmd: string | null;
  scripts: Record<string, string>;
  envVarsNeeded: string[];
  packageManager: string | null;
  hasLockFile: boolean;
  entryPoints: string[];
}

interface SetupBannerProps {
  projectId: string;
  onDismiss: () => void;
  onAiSetup: (prompt: string) => void;
}

type Phase = "detecting" | "ready" | "error";

const FRAMEWORK_EMOJI: Record<string, string> = {
  "Next.js": "▲", "Vite": "⚡", "React": "⚛", "Vue.js": "🟢",
  "Svelte": "🔥", "Express.js": "🚂", "Fastify": "🚀", "Astro": "🚀",
  "Angular": "🔴", "Python": "🐍", "Rust / Cargo": "🦀", "Go": "🐹",
  "Node.js": "🟩", "TypeScript": "🔷",
};

export function SetupBanner({ projectId, onDismiss, onAiSetup }: SetupBannerProps) {
  const [phase, setPhase] = useState<Phase>("detecting");
  const [setup, setSetup] = useState<SetupInfo | null>(null);
  const [showScripts, setShowScripts] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        await new Promise(r => setTimeout(r, 600));
        if (cancelled) return;
        const res = await api.get<ApiResponse<SetupInfo>>(`/api/projects/${projectId}/setup`);
        if (cancelled) return;
        setSetup(res.data);
        setPhase("ready");
      } catch {
        if (!cancelled) setPhase("error");
      }
    };
    run();
    return () => { cancelled = true; };
  }, [projectId]);

  const handleAiSetup = () => {
    if (!setup) return;
    const scriptList = Object.entries(setup.scripts).map(([k, v]) => `  • ${k}: ${v}`).join("\n");
    const prompt =
      `I just imported this project. Please analyze all the files and help me get it running:\n\n` +
      `Detected: ${setup.framework}${setup.installCmd ? `\nInstall: ${setup.installCmd}` : ""}` +
      `${setup.devCmd ? `\nRun: ${setup.devCmd}` : ""}` +
      (scriptList ? `\nScripts:\n${scriptList}` : "") +
      (setup.envVarsNeeded.length ? `\nNeeds env vars: ${setup.envVarsNeeded.join(", ")}` : "") +
      `\n\nPlease:\n1. Tell me what this project does\n2. List exact commands to install and run it\n3. Note any environment variables or config needed\n4. If it's a web app, explain how to see it in Preview`;
    onAiSetup(prompt);
  };

  const scriptCount = setup ? Object.keys(setup.scripts).length : 0;

  return (
    <div className="mx-3 mt-2 mb-1 rounded-lg border border-primary/30 bg-primary/5 overflow-hidden shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        {phase === "detecting" ? (
          <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
        ) : phase === "ready" ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        ) : (
          <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="text-xs font-semibold text-foreground flex-1">
          {phase === "detecting" ? "Analyzing project…" :
           phase === "ready" ? `${FRAMEWORK_EMOJI[setup?.framework ?? ""] ?? "📦"} ${setup?.framework} project detected` :
           "Project imported"}
        </span>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-foreground p-0.5 rounded">
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Body */}
      {phase === "ready" && setup && (
        <div className="px-3 pb-2 space-y-2 border-t border-primary/10">
          <div className="pt-2 space-y-1">
            {setup.installCmd && (
              <div className="flex items-center gap-1.5 text-[11px]">
                <Package className="w-3 h-3 text-muted-foreground shrink-0" />
                <code className="text-muted-foreground font-mono">{setup.installCmd}</code>
              </div>
            )}
            {(setup.devCmd || setup.runCmd) && (
              <div className="flex items-center gap-1.5 text-[11px]">
                <Terminal className="w-3 h-3 text-muted-foreground shrink-0" />
                <code className="text-muted-foreground font-mono">{setup.devCmd ?? setup.runCmd}</code>
              </div>
            )}
            {setup.envVarsNeeded.length > 0 && (
              <p className="text-[11px] text-amber-400">
                Needs {setup.envVarsNeeded.length} env var{setup.envVarsNeeded.length > 1 ? "s" : ""}: {setup.envVarsNeeded.slice(0, 3).join(", ")}{setup.envVarsNeeded.length > 3 ? "…" : ""}
              </p>
            )}
          </div>

          {scriptCount > 0 && (
            <button
              onClick={() => setShowScripts(v => !v)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {showScripts ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {scriptCount} script{scriptCount > 1 ? "s" : ""} available
            </button>
          )}

          {showScripts && (
            <div className="bg-black/20 rounded px-2 py-1.5 space-y-0.5 max-h-28 overflow-y-auto">
              {Object.entries(setup.scripts).map(([k, v]) => (
                <div key={k} className="flex gap-2 text-[10px] font-mono">
                  <span className="text-primary shrink-0">{setup.packageManager ?? "npm"} run {k}</span>
                  <span className="text-muted-foreground truncate">{v}</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleAiSetup}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Wand2 className="w-3 h-3" />
            Let AI analyze &amp; set up this project
          </button>
        </div>
      )}

      {phase === "error" && (
        <div className="px-3 pb-2 border-t border-primary/10">
          <button
            onClick={handleAiSetup}
            className="mt-2 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Wand2 className="w-3 h-3" />
            Let AI analyze &amp; set up this project
          </button>
        </div>
      )}
    </div>
  );
}

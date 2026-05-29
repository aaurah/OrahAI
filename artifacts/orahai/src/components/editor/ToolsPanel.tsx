import { useState } from "react";
import { Package, KeyRound, Database, PlugZap, Settings, Bug } from "lucide-react";
import { cn } from "@/lib/utils";
import { PackagesPanel } from "./PackagesPanel";
import { SecretsPanel } from "./SecretsPanel";
import { DatabasePanel } from "./DatabasePanel";
import { McpPanel } from "./McpPanel";
import { EditorSettingsPanel } from "./EditorSettingsPanel";
import { DebugPanel } from "./DebugPanel";
import type { Project } from "@/types";

type ToolTab = "packages" | "secrets" | "database" | "mcp" | "debug" | "settings";

interface Props {
  projectId: string;
  project: Project;
  isOwner: boolean;
  onInstall: (cmd: string) => void;
  onSendToChat: (prompt: string) => void;
  onClose: () => void;
  activeFilePath?: string;
  initialTab?: ToolTab;
}

interface TabDef { id: ToolTab; label: string; icon: React.ElementType; ownerOnly?: boolean }

const TABS: TabDef[] = [
  { id: "packages",  label: "Packages", icon: Package  },
  { id: "secrets",   label: "Secrets",  icon: KeyRound, ownerOnly: true },
  { id: "database",  label: "Database", icon: Database  },
  { id: "debug",     label: "Debug",    icon: Bug       },
  { id: "mcp",       label: "MCP",      icon: PlugZap,  ownerOnly: true },
  { id: "settings",  label: "Editor",   icon: Settings  },
];

export function ToolsPanel({
  projectId, project, isOwner, onInstall, onSendToChat, onClose, activeFilePath, initialTab,
}: Props) {
  const visible = TABS.filter(t => !t.ownerOnly || isOwner);
  const [tab, setTab] = useState<ToolTab>(initialTab ?? visible[0]?.id ?? "packages");

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-3 h-9 border-b border-border flex items-center shrink-0">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tools</span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-border shrink-0 overflow-x-auto scrollbar-none">
        {visible.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 -mb-px transition-colors",
              tab === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-hidden">
        {tab === "packages" && (
          <PackagesPanel projectId={projectId} language={project.language} onInstall={onInstall} />
        )}
        {tab === "secrets" && isOwner && (
          <SecretsPanel projectId={projectId} />
        )}
        {tab === "database" && (
          <DatabasePanel projectId={projectId} />
        )}
        {tab === "debug" && (
          <DebugPanel
            projectId={projectId}
            activeFilePath={activeFilePath}
            onSendToChat={(prompt) => { onSendToChat(prompt); onClose(); }}
          />
        )}
        {tab === "mcp" && isOwner && (
          <McpPanel projectId={projectId} />
        )}
        {tab === "settings" && (
          <EditorSettingsPanel onClose={onClose} />
        )}
      </div>
    </div>
  );
}

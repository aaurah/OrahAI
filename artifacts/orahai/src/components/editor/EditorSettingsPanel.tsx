import { Settings, RotateCcw, X } from "lucide-react";
import { useEditorSettings, type EditorSettings } from "@/hooks/useEditorSettings";

interface Props {
  onClose: () => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-border/40 last:border-b-0">
      <span className="text-xs text-foreground">{label}</span>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)}
      className={`relative w-8 h-4 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted-foreground/30"}`}>
      <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
  );
}

export function EditorSettingsPanel({ onClose }: Props) {
  const { settings, update, reset } = useEditorSettings();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-border/40 shrink-0">
        <Settings className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Editor Settings</span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={reset} title="Reset to defaults" className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-0">
        <Row label="Font size">
          <div className="flex items-center gap-2">
            <button onClick={() => update("fontSize", Math.max(10, settings.fontSize - 1))}
              className="w-5 h-5 rounded border border-border flex items-center justify-center text-xs hover:bg-muted transition-colors">−</button>
            <span className="text-xs font-mono w-7 text-center">{settings.fontSize}px</span>
            <button onClick={() => update("fontSize", Math.min(24, settings.fontSize + 1))}
              className="w-5 h-5 rounded border border-border flex items-center justify-center text-xs hover:bg-muted transition-colors">+</button>
          </div>
        </Row>

        <Row label="Tab size">
          <select value={settings.tabSize} onChange={e => update("tabSize", Number(e.target.value))}
            className="text-xs h-6 px-2 rounded border border-input bg-background">
            {[2, 4, 8].map(n => <option key={n} value={n}>{n} spaces</option>)}
          </select>
        </Row>

        <Row label="Word wrap">
          <Toggle checked={settings.wordWrap === "on"} onChange={v => update("wordWrap", v ? "on" : "off")} />
        </Row>

        <Row label="Minimap">
          <Toggle checked={settings.minimap} onChange={v => update("minimap", v)} />
        </Row>

        <Row label="Line numbers">
          <select value={settings.lineNumbers} onChange={e => update("lineNumbers", e.target.value as EditorSettings["lineNumbers"])}
            className="text-xs h-6 px-2 rounded border border-input bg-background">
            <option value="on">On</option>
            <option value="off">Off</option>
            <option value="relative">Relative</option>
          </select>
        </Row>

        <Row label="Format on save">
          <Toggle checked={settings.formatOnSave} onChange={v => update("formatOnSave", v)} />
        </Row>

        <Row label="Color theme">
          <select value={settings.theme} onChange={e => update("theme", e.target.value as EditorSettings["theme"])}
            className="text-xs h-6 px-2 rounded border border-input bg-background">
            <option value="vs-dark">Dark</option>
            <option value="vs">Light</option>
            <option value="hc-black">High Contrast</option>
          </select>
        </Row>
      </div>

      <div className="px-4 py-3 border-t border-border/40 shrink-0">
        <p className="text-[10px] text-muted-foreground">Settings are saved locally in your browser.</p>
      </div>
    </div>
  );
}

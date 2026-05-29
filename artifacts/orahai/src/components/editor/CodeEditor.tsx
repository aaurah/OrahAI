import { useEffect, useRef, useState } from "react";
import { Wrench, Sparkles, Cpu, FlaskConical, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { useEditorSettings } from "@/hooks/useEditorSettings";
import type { ProjectFile } from "@/types";

type CodeAction = "fix" | "refactor" | "explain" | "test";

interface CodeEditorProps {
  projectId: string;
  file: ProjectFile;
  onSave?: (content: string) => void;
  onDirtyChange?: (path: string, dirty: boolean) => void;
  onCodeAction?: (action: CodeAction, code: string, filePath: string) => void;
}

const CODE_ACTIONS: { id: CodeAction; icon: React.ElementType; label: string; prompt: string }[] = [
  { id: "fix",      icon: Wrench,       label: "Fix",      prompt: "Fix all bugs, errors, and issues in this code:" },
  { id: "refactor", icon: Sparkles,     label: "Refactor", prompt: "Refactor this code to be cleaner, more maintainable, and follow best practices:" },
  { id: "explain",  icon: Cpu,          label: "Explain",  prompt: "Explain what this code does, step by step, in plain English:" },
  { id: "test",     icon: FlaskConical, label: "Tests",    prompt: "Write comprehensive unit tests and integration tests for this code:" },
];

export function CodeEditor({ projectId, file, onSave, onDirtyChange, onCodeAction }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<unknown>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const { settings } = useEditorSettings();

  useEffect(() => {
    let destroyed = false;

    async function initEditor() {
      if (!containerRef.current) return;
      const monaco = await import("monaco-editor");
      if (destroyed || !containerRef.current) return;

      const editor = monaco.editor.create(containerRef.current, {
        value: file.content,
        language: getMonacoLanguage(file.mimeType, file.name),
        theme: settings.theme,
        fontSize: settings.fontSize,
        fontFamily: '"JetBrains Mono", "Fira Code", Menlo, monospace',
        lineNumbers: settings.lineNumbers,
        minimap: { enabled: settings.minimap },
        scrollBeyondLastLine: false,
        wordWrap: settings.wordWrap,
        tabSize: settings.tabSize,
        renderWhitespace: "selection",
        cursorBlinking: "smooth",
        smoothScrolling: true,
        formatOnPaste: true,
        automaticLayout: true,
      });

      editorRef.current = editor;

      editor.onDidChangeModelContent(() => {
        setIsDirty(true);
        onDirtyChange?.(file.path, true);
      });

      editor.addCommand(
        // @ts-ignore
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        async () => {
          const content = editor.getValue();
          if (settings.formatOnSave) {
            await editor.getAction("editor.action.formatDocument")?.run();
          }
          saveFile(content);
        }
      );
    }

    initEditor().catch(console.error);

    return () => {
      destroyed = true;
      if (editorRef.current) {
        (editorRef.current as { dispose: () => void }).dispose();
        editorRef.current = null;
      }
    };
  }, [file.path]);

  // Update content when the file changes externally (e.g. AI writes).
  // Guard: if the user has unsaved local edits (isDirty), don't clobber their work.
  useEffect(() => {
    if (!editorRef.current) return;
    const editor = editorRef.current as { getValue: () => string; setValue: (v: string) => void };
    if (isDirty) return;
    if (editor.getValue() !== file.content) {
      editor.setValue(file.content);
      setIsDirty(false);
      onDirtyChange?.(file.path, false);
    }
  }, [file.content]);

  // Apply settings changes to live editor
  useEffect(() => {
    if (!editorRef.current) return;
    const editor = editorRef.current as {
      updateOptions: (opts: Record<string, unknown>) => void;
    };
    editor.updateOptions({
      fontSize: settings.fontSize,
      wordWrap: settings.wordWrap,
      minimap: { enabled: settings.minimap },
      tabSize: settings.tabSize,
      lineNumbers: settings.lineNumbers,
    });
  }, [settings.fontSize, settings.wordWrap, settings.minimap, settings.tabSize, settings.lineNumbers]);

  async function saveFile(content: string) {
    setIsSaving(true);
    try {
      await api.put(`/api/files/${projectId}`, { path: file.path, content, mimeType: file.mimeType });
      setIsDirty(false);
      onDirtyChange?.(file.path, false);
      onSave?.(content);
    } catch (err) {
      console.error("Failed to save file:", err);
    } finally {
      setIsSaving(false);
    }
  }

  function triggerCodeAction(action: CodeAction) {
    setActionsOpen(false);
    const ed = editorRef.current as {
      getSelection: () => unknown;
      getModel: () => { getValueInRange: (r: unknown) => string; getValue: () => string } | null;
    } | null;
    if (!ed || !onCodeAction) return;
    const selection = ed.getSelection();
    const model = ed.getModel();
    if (!model) return;
    const selectedCode = (selection as { startLineNumber: number; endLineNumber: number; startColumn: number; endColumn: number } | null)
      ? model.getValueInRange(selection as unknown as never)
      : "";
    const code = selectedCode.trim() || model.getValue();
    const actionDef = CODE_ACTIONS.find(a => a.id === action)!;
    onCodeAction(action, `${actionDef.prompt}\n\n\`\`\`\n${code}\n\`\`\`\n\nFile: ${file.path}`, file.path);
  }

  return (
    <div className="relative h-full flex flex-col">
      <div className="flex items-center justify-between px-4 h-9 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-mono text-muted-foreground text-xs">{file.path}</span>
          {isDirty && <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {/* AI Code Actions */}
          {onCodeAction && (
            <div className="relative">
              <button
                onClick={() => setActionsOpen(v => !v)}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-primary/80 hover:text-primary hover:bg-primary/10 transition-colors border border-primary/20 text-[11px] font-medium"
              >
                <Sparkles className="w-3 h-3" />
                AI Actions
                <ChevronDown className="w-3 h-3" />
              </button>
              {actionsOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg overflow-hidden min-w-[140px]">
                  {CODE_ACTIONS.map(({ id, icon: Icon, label }) => (
                    <button
                      key={id}
                      onClick={() => triggerCodeAction(id)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors text-left"
                    >
                      <Icon className="w-3.5 h-3.5 text-primary" />
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Save state */}
          {isSaving ? (
            <span className="text-amber-400">Saving…</span>
          ) : isDirty ? (
            <button
              onClick={() => {
                const editor = editorRef.current as { getValue: () => string } | null;
                if (editor) saveFile(editor.getValue());
              }}
              className="hover:text-foreground transition-colors"
            >
              Save (⌘S)
            </button>
          ) : (
            <span className="text-green-500/80">Saved</span>
          )}
        </div>
      </div>
      {/* Close actions menu on outside click */}
      {actionsOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setActionsOpen(false)} />
      )}
      <div ref={containerRef} className="flex-1" />
    </div>
  );
}

function getMonacoLanguage(mimeType: string, filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const extMap: Record<string, string> = {
    py: "python", js: "javascript", ts: "typescript", tsx: "typescriptreact",
    jsx: "javascriptreact", html: "html", css: "css", scss: "scss", json: "json",
    md: "markdown", sh: "shell", bash: "shell", yaml: "yaml", yml: "yaml",
    toml: "toml", go: "go", rs: "rust", java: "java", cpp: "cpp", c: "c",
    rb: "ruby", php: "php", sql: "sql", vue: "html", svelte: "html",
    kt: "kotlin", swift: "swift", lua: "lua", r: "r", dart: "dart",
  };
  return extMap[ext] ?? "plaintext";
}

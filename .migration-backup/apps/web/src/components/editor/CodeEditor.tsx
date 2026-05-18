"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { ProjectFile } from "@orahai/types";

interface CodeEditorProps {
  projectId: string;
  file: ProjectFile;
  onSave?: (content: string) => void;
}

export function CodeEditor({ projectId, file, onSave }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<unknown>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    let destroyed = false;

    async function initEditor() {
      if (!containerRef.current) return;

      // Dynamically import Monaco to avoid SSR issues
      const monaco = await import("monaco-editor");

      if (destroyed || !containerRef.current) return;

      const editor = monaco.editor.create(containerRef.current, {
        value: file.content,
        language: getMonacoLanguage(file.mimeType, file.name),
        theme: "vs-dark",
        fontSize: 14,
        fontFamily: '"JetBrains Mono", "Fira Code", Menlo, monospace',
        lineNumbers: "on",
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: "on",
        tabSize: 2,
        renderWhitespace: "selection",
        cursorBlinking: "smooth",
        smoothScrolling: true,
        formatOnPaste: true,
        automaticLayout: true,
      });

      editorRef.current = editor;

      // Mark dirty on changes
      editor.onDidChangeModelContent(() => {
        setIsDirty(true);
      });

      // Ctrl+S / Cmd+S to save
      editor.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => saveFile(editor.getValue())
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
  }, [file.path]); // Re-create when file changes

  // Update content when file prop changes
  useEffect(() => {
    if (editorRef.current) {
      const editor = editorRef.current as {
        getValue: () => string;
        setValue: (v: string) => void;
      };
      if (editor.getValue() !== file.content) {
        editor.setValue(file.content);
        setIsDirty(false);
      }
    }
  }, [file.content]);

  async function saveFile(content: string) {
    setIsSaving(true);
    try {
      await api.put(`/api/files/${projectId}`, {
        path: file.path,
        content,
        mimeType: file.mimeType,
      });
      setIsDirty(false);
      onSave?.(content);
    } catch (err) {
      console.error("Failed to save file:", err);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="relative h-full flex flex-col">
      {/* Tab bar */}
      <div className="flex items-center justify-between px-4 h-9 border-b border-border bg-muted/30 shrink-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-mono text-muted-foreground">{file.path}</span>
          {isDirty && (
            <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {isSaving ? (
            <span className="text-amber-400">Saving…</span>
          ) : isDirty ? (
            <button
              onClick={() => {
                const editor = editorRef.current as {
                  getValue: () => string;
                } | null;
                if (editor) saveFile(editor.getValue());
              }}
              className="hover:text-foreground transition-colors"
            >
              Save (⌘S)
            </button>
          ) : (
            <span className="text-green-500">Saved</span>
          )}
        </div>
      </div>

      {/* Monaco editor container */}
      <div ref={containerRef} className="flex-1" />
    </div>
  );
}

function getMonacoLanguage(mimeType: string, filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const extMap: Record<string, string> = {
    py: "python",
    js: "javascript",
    ts: "typescript",
    tsx: "typescriptreact",
    jsx: "javascriptreact",
    html: "html",
    css: "css",
    scss: "scss",
    json: "json",
    md: "markdown",
    sh: "shell",
    bash: "shell",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    go: "go",
    rs: "rust",
    java: "java",
    cpp: "cpp",
    c: "c",
    rb: "ruby",
    php: "php",
    sql: "sql",
    dockerfile: "dockerfile",
    xml: "xml",
    graphql: "graphql",
    prisma: "prisma",
  };
  return extMap[ext] ?? "plaintext";
}

"use client";

import { useParams } from "next/navigation";
import { useState, useCallback } from "react";
import { WorkspaceSidebar } from "@/components/editor/WorkspaceSidebar";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { Terminal } from "@/components/terminal/Terminal";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { WorkspaceTopbar } from "@/components/editor/WorkspaceTopbar";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useProject } from "@/hooks/useProject";
import type { ProjectFile } from "@orahai/types";

type PanelLayout = "editor" | "split-h" | "split-v" | "chat-only";

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const { project, isLoading: projectLoading } = useProject(id);
  const { workspace, start, stop, isStarting } = useWorkspace(id);

  const [activeFile, setActiveFile] = useState<ProjectFile | null>(null);
  const [layout, setLayout] = useState<PanelLayout>("split-h");
  const [chatOpen, setChatOpen] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(true);

  const handleFileSelect = useCallback((file: ProjectFile) => {
    setActiveFile(file);
  }, []);

  if (projectLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Loading workspace…</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
      <WorkspaceTopbar
        project={project}
        workspace={workspace}
        onStart={start}
        onStop={stop}
        isStarting={isStarting}
        layout={layout}
        onLayoutChange={setLayout}
        chatOpen={chatOpen}
        onChatToggle={() => setChatOpen((v) => !v)}
        terminalOpen={terminalOpen}
        onTerminalToggle={() => setTerminalOpen((v) => !v)}
      />

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* File sidebar */}
        <WorkspaceSidebar
          projectId={project.id}
          activeFilePath={activeFile?.path}
          onFileSelect={handleFileSelect}
        />

        {/* Editor + terminal */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Editor */}
          <div
            className={`flex-1 overflow-hidden ${
              terminalOpen ? "border-b border-border" : ""
            }`}
          >
            {activeFile ? (
              <CodeEditor
                projectId={project.id}
                file={activeFile}
                onSave={(content) =>
                  setActiveFile((f) => (f ? { ...f, content } : f))
                }
              />
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                Select a file to start editing
              </div>
            )}
          </div>

          {/* Terminal */}
          {terminalOpen && workspace && (
            <div className="h-48 flex-shrink-0">
              <Terminal workspaceId={workspace.id} />
            </div>
          )}
        </div>

        {/* AI Chat panel */}
        {chatOpen && (
          <div className="w-80 xl:w-96 border-l border-border flex-shrink-0 flex flex-col overflow-hidden">
            <ChatPanel projectId={project.id} />
          </div>
        )}
      </div>
    </div>
  );
}

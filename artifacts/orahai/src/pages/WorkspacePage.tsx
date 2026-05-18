import { useState, useCallback } from "react";
import { useParams } from "wouter";
import { Files, MessageSquare, Terminal as TerminalIcon, Github, Code2 } from "lucide-react";
import { WorkspaceSidebar } from "@/components/editor/WorkspaceSidebar";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { WorkspaceTopbar } from "@/components/editor/WorkspaceTopbar";
import { GitHubPanel } from "@/components/github/GitHubPanel";
import { useProject } from "@/hooks/useProject";
import { useRuns } from "@/hooks/useRuns";
import { api } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import type { ProjectFile, ApiResponse, Run } from "@/types";

type MobileTab = "files" | "editor" | "chat" | "github";

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const { project, isLoading, mutate: mutateProject } = useProject(id ?? null);
  const { runs, mutate: mutateRuns } = useRuns(id ?? null);
  const latestRun = runs[0] ?? null;

  const [activeFile, setActiveFile] = useState<ProjectFile | null>(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");

  const handleFileSelect = useCallback((file: ProjectFile) => {
    setActiveFile(file);
    setMobileTab("editor");
  }, []);

  const handleApplyCode = useCallback(async (code: string) => {
    if (!activeFile || !project) return;
    const updated = { ...activeFile, content: code };
    setActiveFile(updated);
    try {
      await api.put(`/api/files/${project.id}`, {
        path: activeFile.path,
        content: code,
        mimeType: activeFile.mimeType,
      });
      toast({ title: `Applied to ${activeFile.path}` });
    } catch {
      toast({ title: "Failed to save file", variant: "destructive" });
      setActiveFile(activeFile);
    }
  }, [activeFile, project]);

  const handleRun = async () => {
    if (!project || isRunning) return;
    setIsRunning(true);
    setTerminalOpen(true);
    try {
      await api.post<ApiResponse<Run>>(`/api/runs/${project.id}`);
      await mutateRuns();
    } catch (err: unknown) {
      toast({ title: (err as Error).message ?? "Failed to start run", variant: "destructive" });
    } finally {
      setIsRunning(false);
    }
  };

  if (isLoading) {
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

  const mobileTabs: { id: MobileTab; label: string; icon: React.ReactNode }[] = [
    { id: "files",  label: "Files",  icon: <Files className="w-4 h-4" /> },
    { id: "editor", label: "Editor", icon: <Code2 className="w-4 h-4" /> },
    { id: "chat",   label: "AI",     icon: <MessageSquare className="w-4 h-4" /> },
    { id: "github", label: "GitHub", icon: <Github className={cn("w-4 h-4", project.githubRepo && "text-primary")} /> },
  ];

  return (
    <div className="h-[100dvh] flex flex-col bg-background overflow-hidden">
      <WorkspaceTopbar
        project={project}
        latestRun={latestRun}
        isRunning={isRunning}
        onRun={handleRun}
        chatOpen={chatOpen}
        onChatToggle={() => setChatOpen((v) => !v)}
        terminalOpen={terminalOpen}
        onTerminalToggle={() => setTerminalOpen((v) => !v)}
        githubOpen={githubOpen}
        onGithubToggle={() => setGithubOpen((v) => !v)}
      />

      {/* ── Desktop layout (md+): side-by-side panels ────────────────── */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        <WorkspaceSidebar
          projectId={project.id}
          activeFilePath={activeFile?.path}
          onFileSelect={handleFileSelect}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className={`flex-1 overflow-hidden ${terminalOpen ? "border-b border-border" : ""}`}>
            {activeFile ? (
              <CodeEditor
                projectId={project.id}
                file={activeFile}
                onSave={(content) => setActiveFile((f) => f ? { ...f, content } : f)}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                <p className="text-sm">Select a file to start editing</p>
                <p className="text-xs opacity-60">or create a new file in the sidebar</p>
              </div>
            )}
          </div>
          {terminalOpen && (
            <div className="h-52 flex-shrink-0">
              <RunOutput run={latestRun} />
            </div>
          )}
        </div>

        {chatOpen && (
          <div className="w-80 xl:w-96 border-l border-border flex-shrink-0 flex flex-col overflow-hidden">
            <ChatPanel
              projectId={project.id}
              activeFilePath={activeFile?.path}
              activeFileContent={activeFile?.content}
              onApplyCode={handleApplyCode}
            />
          </div>
        )}

        {githubOpen && (
          <div className="w-64 border-l border-border flex-shrink-0 flex flex-col overflow-hidden bg-background">
            <GitHubPanel
              projectId={project.id}
              onSynced={() => mutateProject()}
            />
          </div>
        )}
      </div>

      {/* ── Mobile layout (< md): single panel + bottom tabs ─────────── */}
      <div className="flex md:hidden flex-1 overflow-hidden flex-col">
        {mobileTab === "files" && (
          <div className="flex-1 overflow-hidden">
            <WorkspaceSidebar
              projectId={project.id}
              activeFilePath={activeFile?.path}
              onFileSelect={handleFileSelect}
            />
          </div>
        )}

        {mobileTab === "editor" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden">
              {activeFile ? (
                <CodeEditor
                  projectId={project.id}
                  file={activeFile}
                  onSave={(content) => setActiveFile((f) => f ? { ...f, content } : f)}
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3 px-6">
                  <Code2 className="w-10 h-10 opacity-20" />
                  <p className="text-sm text-center">No file open</p>
                  <button
                    onClick={() => setMobileTab("files")}
                    className="text-xs text-primary underline underline-offset-2"
                  >
                    Browse files →
                  </button>
                </div>
              )}
            </div>
            {terminalOpen && (
              <div className="h-48 border-t border-border flex-shrink-0">
                <RunOutput run={latestRun} />
              </div>
            )}
          </div>
        )}

        {mobileTab === "chat" && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <ChatPanel
              projectId={project.id}
              activeFilePath={activeFile?.path}
              activeFileContent={activeFile?.content}
              onApplyCode={handleApplyCode}
            />
          </div>
        )}

        {mobileTab === "github" && (
          <div className="flex-1 overflow-y-auto bg-background">
            <GitHubPanel
              projectId={project.id}
              onSynced={() => mutateProject()}
            />
          </div>
        )}

        {/* Mobile bottom tab bar */}
        <div className="flex-shrink-0 border-t border-border bg-background flex items-stretch h-14 safe-b">
          {mobileTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMobileTab(tab.id)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                mobileTab === tab.id
                  ? "text-primary"
                  : "text-muted-foreground",
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function RunOutput({ run }: { run: Run | null }) {
  const statusColor =
    run?.status === "success" ? "text-green-400"
    : run?.status === "error"   ? "text-red-400"
    : run?.status === "running" ? "text-amber-400"
    : "text-muted-foreground";

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      <div className="flex items-center gap-3 px-3 h-8 border-b border-border/40 shrink-0">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
        </div>
        <span className="text-xs text-muted-foreground">Output</span>
        {run && (
          <span className={`text-xs ml-auto ${statusColor}`}>
            {run.status}{run.exitCode != null ? ` (exit ${run.exitCode})` : ""}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto p-3 font-mono text-sm text-slate-300">
        {run?.status === "running" && (
          <span className="text-amber-400 animate-pulse">Running…</span>
        )}
        {run?.output ? (
          <pre className="whitespace-pre-wrap">{run.output}</pre>
        ) : !run ? (
          <span className="text-muted-foreground/50">Press Run to execute your code</span>
        ) : null}
      </div>
    </div>
  );
}

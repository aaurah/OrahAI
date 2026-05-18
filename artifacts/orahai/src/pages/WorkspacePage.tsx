import { useState, useCallback, useEffect } from "react";
import { useParams } from "wouter";
import { Files, MessageSquare, Github, Code2, Globe, KeyRound, Rocket } from "lucide-react";
import { WorkspaceSidebar } from "@/components/editor/WorkspaceSidebar";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { WorkspaceTopbar } from "@/components/editor/WorkspaceTopbar";
import { GitHubPanel } from "@/components/github/GitHubPanel";
import { PreviewPanel } from "@/components/editor/PreviewPanel";
import { SecretsPanel } from "@/components/editor/SecretsPanel";
import { DeployPanel } from "@/components/editor/DeployPanel";
import { useProject } from "@/hooks/useProject";
import { useRuns } from "@/hooks/useRuns";
import { api } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import type { ProjectFile, ApiResponse, Run } from "@/types";

type MobileTab = "files" | "editor" | "chat" | "preview" | "github" | "secrets" | "deploy";

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const { project, isLoading, mutate: mutateProject } = useProject(id ?? null);
  const { runs, mutate: mutateRuns } = useRuns(id ?? null);
  const latestRun = runs[0] ?? null;

  const [activeFile, setActiveFile] = useState<ProjectFile | null>(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [fileRefreshKey, setFileRefreshKey] = useState(0);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [githubOpen, setGithubOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [secretsOpen, setSecretsOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");

  // Auto-open preview for HTML/web projects
  useEffect(() => {
    if (project && (project.language === "html")) {
      setPreviewOpen(true);
    }
  }, [project?.id, project?.language]);

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

  const handleFileChange = useCallback(async (path: string, action: "write" | "delete") => {
    setFileRefreshKey((k) => k + 1);
    if (action === "write" && activeFile?.path === path && project) {
      try {
        const res = await api.get<{ data: ProjectFile }>(`/api/files/${project.id}/read?path=${encodeURIComponent(path)}`);
        if (res.data) setActiveFile(res.data);
      } catch { /* ignore */ }
    }
    if (action === "delete" && activeFile?.path === path) {
      setActiveFile(null);
    }
  }, [activeFile, project]);

  // Triggered by CodeEditor Ctrl+S — refreshes live preview
  const handleEditorSave = useCallback((content: string) => {
    setActiveFile((f) => f ? { ...f, content } : f);
    setFileRefreshKey((k) => k + 1);
  }, []);

  const handleRun = async () => {
    if (!project || isRunning) return;
    setIsRunning(true);
    setTerminalOpen(true);
    setMobileTab("editor");
    if (project.language === "html") setPreviewOpen(true);
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
    { id: "files",   label: "Files",   icon: <Files className="w-4 h-4" /> },
    { id: "editor",  label: "Editor",  icon: <Code2 className="w-4 h-4" /> },
    { id: "chat",    label: "AI",      icon: <MessageSquare className="w-4 h-4" /> },
    { id: "preview", label: "Preview", icon: <Globe className="w-4 h-4" /> },
    { id: "github",  label: "GitHub",  icon: <Github className={cn("w-4 h-4", project.githubRepo && "text-primary")} /> },
    { id: "secrets", label: "Secrets", icon: <KeyRound className="w-4 h-4" /> },
    { id: "deploy",  label: "Deploy",  icon: <Rocket className="w-4 h-4" /> },
  ];

  const rightPanelOpen = chatOpen || githubOpen || secretsOpen || deployOpen;

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
        previewOpen={previewOpen}
        onPreviewToggle={() => setPreviewOpen((v) => !v)}
        secretsOpen={secretsOpen}
        onSecretsToggle={() => setSecretsOpen((v) => !v)}
        deployOpen={deployOpen}
        onDeployToggle={() => setDeployOpen((v) => !v)}
      />

      {/* ── Desktop layout (md+) ──────────────────────────────────────── */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {/* File sidebar */}
        <WorkspaceSidebar
          projectId={project.id}
          activeFilePath={activeFile?.path}
          onFileSelect={handleFileSelect}
          refreshKey={fileRefreshKey}
        />

        {/* Editor + Preview */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex-1 flex overflow-hidden">
            {/* Editor */}
            <div className={cn("flex flex-col overflow-hidden min-w-0", previewOpen ? "flex-1" : "flex-1")}>
              <div className="flex-1 overflow-hidden">
                {activeFile ? (
                  <CodeEditor
                    projectId={project.id}
                    file={activeFile}
                    onSave={handleEditorSave}
                  />
                ) : (
                  <EmptyEditor />
                )}
              </div>
            </div>

            {/* Live Preview (splits 50/50 with editor) */}
            {previewOpen && (
              <div className="flex-1 min-w-0 border-l border-border flex-shrink-0 flex flex-col overflow-hidden">
                <PreviewPanel
                  projectId={project.id}
                  githubRepo={project.githubRepo}
                  refreshKey={fileRefreshKey}
                />
              </div>
            )}
          </div>

          {terminalOpen && (
            <div className="h-52 flex-shrink-0 border-t border-border">
              <RunOutput run={latestRun} />
            </div>
          )}
        </div>

        {/* Right panels — only one shown at a time */}
        {chatOpen && (
          <div className="w-80 xl:w-96 border-l border-border flex-shrink-0 flex flex-col overflow-hidden">
            <ChatPanel
              projectId={project.id}
              activeFilePath={activeFile?.path}
              activeFileContent={activeFile?.content}
              onApplyCode={handleApplyCode}
              onFileChange={handleFileChange}
            />
          </div>
        )}
        {!chatOpen && githubOpen && (
          <div className="w-72 border-l border-border flex-shrink-0 flex flex-col overflow-hidden bg-background">
            <GitHubPanel
              projectId={project.id}
              onSynced={() => { mutateProject(); setFileRefreshKey((k) => k + 1); }}
            />
          </div>
        )}
        {!chatOpen && !githubOpen && secretsOpen && (
          <div className="w-72 border-l border-border flex-shrink-0 flex flex-col overflow-hidden bg-background">
            <SecretsPanel projectId={project.id} />
          </div>
        )}
        {!chatOpen && !githubOpen && !secretsOpen && deployOpen && (
          <div className="w-80 border-l border-border flex-shrink-0 flex flex-col overflow-hidden bg-background">
            <DeployPanel project={project} onProjectUpdate={mutateProject} />
          </div>
        )}
      </div>

      {/* ── Mobile layout (< md) ─────────────────────────────────────── */}
      <div className="flex md:hidden flex-1 overflow-hidden flex-col">
        {mobileTab === "files" && (
          <div className="flex-1 overflow-hidden">
            <WorkspaceSidebar
              projectId={project.id}
              activeFilePath={activeFile?.path}
              onFileSelect={handleFileSelect}
              refreshKey={fileRefreshKey}
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
                  onSave={handleEditorSave}
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3 px-6">
                  <Code2 className="w-10 h-10 opacity-20" />
                  <p className="text-sm text-center">No file open</p>
                  <button onClick={() => setMobileTab("files")} className="text-xs text-primary underline underline-offset-2">
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
              onFileChange={handleFileChange}
            />
          </div>
        )}

        {mobileTab === "preview" && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <PreviewPanel
              projectId={project.id}
              githubRepo={project.githubRepo}
              refreshKey={fileRefreshKey}
            />
          </div>
        )}

        {mobileTab === "github" && (
          <div className="flex-1 overflow-y-auto bg-background">
            <GitHubPanel
              projectId={project.id}
              onSynced={() => { mutateProject(); setFileRefreshKey((k) => k + 1); }}
            />
          </div>
        )}

        {mobileTab === "secrets" && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <SecretsPanel projectId={project.id} />
          </div>
        )}

        {mobileTab === "deploy" && (
          <div className="flex-1 overflow-y-auto bg-background">
            <DeployPanel project={project} onProjectUpdate={mutateProject} />
          </div>
        )}

        {/* Mobile bottom tab bar */}
        <div className="flex-shrink-0 border-t border-border bg-background flex items-stretch h-14 safe-b overflow-x-auto">
          {mobileTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMobileTab(tab.id)}
              className={cn(
                "flex-1 min-w-[48px] flex flex-col items-center justify-center gap-0.5 text-[9px] font-medium transition-colors",
                mobileTab === tab.id ? "text-primary" : "text-muted-foreground",
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

function EmptyEditor() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
      <p className="text-sm">Select a file to start editing</p>
      <p className="text-xs opacity-60">or ask AI to create one for you</p>
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

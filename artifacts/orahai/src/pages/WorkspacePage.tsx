import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useSearch, useLocation } from "wouter";
import { Files, MessageSquare, Code2, Globe, Terminal as TerminalIcon, MoreHorizontal, Github, KeyRound, Rocket } from "lucide-react";
import { WorkspaceSidebar } from "@/components/editor/WorkspaceSidebar";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { ChatPanel, type ChatPanelHandle } from "@/components/chat/ChatPanel";
import { WorkspaceTopbar } from "@/components/editor/WorkspaceTopbar";
import { GitHubPanel } from "@/components/github/GitHubPanel";
import { PreviewPanel } from "@/components/editor/PreviewPanel";
import { SecretsPanel } from "@/components/editor/SecretsPanel";
import { DeployPanel } from "@/components/editor/DeployPanel";
import { SetupBanner } from "@/components/editor/SetupBanner";
import { useProject } from "@/hooks/useProject";
import { useRuns } from "@/hooks/useRuns";
import { api } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import type { ProjectFile, ApiResponse, Run } from "@/types";

type MobileTab = "files" | "editor" | "ai" | "console" | "preview";

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearch();
  const [, navigate] = useLocation();
  const { project, isLoading, mutate: mutateProject } = useProject(id ?? null);
  const { runs, mutate: mutateRuns } = useRuns(id ?? null);
  const latestRun = runs[0] ?? null;

  const isSetupMode = new URLSearchParams(search).get("setup") === "1";
  const initialPrompt = new URLSearchParams(search).get("prompt") ?? "";

  const [activeFile, setActiveFile] = useState<ProjectFile | null>(null);
  const [fileRefreshKey, setFileRefreshKey] = useState(0);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [githubOpen, setGithubOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [secretsOpen, setSecretsOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>("ai");
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [autoDevEnabled, setAutoDevEnabled] = useState(false);
  const [growthCount, setGrowthCount] = useState(0);
  const [showSetupBanner, setShowSetupBanner] = useState(isSetupMode);
  const [aiStreaming, setAiStreaming] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<ChatPanelHandle>(null);
  const promptFiredRef = useRef(false);

  // Auto-fire the initial AI prompt when arriving from "Start building"
  useEffect(() => {
    if (!initialPrompt || promptFiredRef.current || !project) return;
    promptFiredRef.current = true;
    setChatOpen(true);
    setMobileTab("ai");
    // Clear the URL param so refresh doesn't re-fire
    navigate(`/workspace/${id}`, { replace: true });
    setTimeout(() => chatRef.current?.submit(initialPrompt), 300);
  }, [project, initialPrompt]);

  const dismissSetup = () => {
    setShowSetupBanner(false);
    if (isSetupMode) navigate(`/workspace/${id}`, { replace: true });
  };

  const handleAiSetup = (prompt: string) => {
    dismissSetup();
    setChatOpen(true);
    setMobileTab("ai");
    setTimeout(() => chatRef.current?.submit(prompt), 100);
  };

  const AUTO_DEV_PROMPT =
    "[AUTO-DEVELOP] You are in autonomous growth mode — like a tree that never stops growing. " +
    "Analyze this project's current state right now. Identify the single most impactful improvement " +
    "you can make (add a missing feature, fix a bug, improve the UI, write a missing file, refactor messy code). " +
    "Then implement it completely using <<<WRITE>>> blocks. Do not ask for permission. " +
    "Do not explain before acting. Build it, then give a one-sentence summary of what you grew.";

  useEffect(() => {
    if (!autoDevEnabled) return;
    const trigger = () => {
      setMobileTab("ai");
      setGrowthCount(c => c + 1);
      chatRef.current?.submit(AUTO_DEV_PROMPT);
    };
    trigger();
    const id = setInterval(trigger, 4 * 60 * 1000);
    return () => clearInterval(id);
  }, [autoDevEnabled]);

  useEffect(() => {
    if (project) setPreviewOpen(true);
  }, [project?.id]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
        path: activeFile.path, content: code, mimeType: activeFile.mimeType,
      });
      toast({ title: `Applied to ${activeFile.path}` });
    } catch {
      toast({ title: "Failed to save file", variant: "destructive" });
      setActiveFile(activeFile);
    }
  }, [activeFile, project]);

  const handleApplyToPath = useCallback(async (code: string, path: string) => {
    if (!project) return;
    try {
      // Load the file so we have its mimeType, then apply
      const res = await api.get<{ data: ProjectFile }>(`/api/files/${project.id}/read?path=${encodeURIComponent(path)}`);
      const file = res.data;
      if (!file) {
        toast({ title: "File not found", description: path, variant: "destructive" });
        return;
      }
      const updated = { ...file, content: code };
      setActiveFile(updated);
      setMobileTab("editor");
      await api.put(`/api/files/${project.id}`, {
        path: file.path, content: code, mimeType: file.mimeType,
      });
      toast({ title: `Applied to ${path}` });
    } catch {
      toast({ title: "Failed to apply code", description: path, variant: "destructive" });
    }
  }, [project]);

  const handleFileChange = useCallback(async (path: string, action: "write" | "delete") => {
    setFileRefreshKey((k) => k + 1);
    if (action === "write" && activeFile?.path === path && project) {
      try {
        const res = await api.get<{ data: ProjectFile }>(`/api/files/${project.id}/read?path=${encodeURIComponent(path)}`);
        if (res.data) setActiveFile(res.data);
      } catch { /* ignore */ }
    }
    if (action === "delete" && activeFile?.path === path) setActiveFile(null);
  }, [activeFile, project]);

  const handleEditorSave = useCallback((content: string) => {
    setActiveFile((f) => f ? { ...f, content } : f);
    setFileRefreshKey((k) => k + 1);
  }, []);

  const handleRun = async () => {
    if (!project || isRunning) return;
    setIsRunning(true);
    setTerminalOpen(true);
    setMobileTab("console");
    setPreviewOpen(true);
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

  const mobileTabs = [
    { id: "files"   as MobileTab, label: "Files",   icon: <Files className="w-[18px] h-[18px]" /> },
    { id: "editor"  as MobileTab, label: "Editor",  icon: <Code2 className="w-[18px] h-[18px]" /> },
    { id: "console" as MobileTab, label: "Console", icon: <TerminalIcon className="w-[18px] h-[18px]" /> },
    { id: "preview" as MobileTab, label: "Preview", icon: <Globe className="w-[18px] h-[18px]" /> },
    { id: "ai"      as MobileTab, label: "AI",      icon: <MessageSquare className="w-[18px] h-[18px]" /> },
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
        previewOpen={previewOpen}
        onPreviewToggle={() => setPreviewOpen((v) => !v)}
        secretsOpen={secretsOpen}
        onSecretsToggle={() => setSecretsOpen((v) => !v)}
        deployOpen={deployOpen}
        onDeployToggle={() => setDeployOpen((v) => !v)}
        autoDevEnabled={autoDevEnabled}
        onAutoDevToggle={() => { setAutoDevEnabled((v) => !v); setGrowthCount(0); }}
        growthCount={growthCount}
      />

      {/* ── Desktop layout ──────────────────────────────────────────── */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        <WorkspaceSidebar
          projectId={project.id}
          activeFilePath={activeFile?.path}
          onFileSelect={handleFileSelect}
          refreshKey={fileRefreshKey}
        />

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
              <div className="flex-1 overflow-hidden">
                {activeFile ? (
                  <CodeEditor projectId={project.id} file={activeFile} onSave={handleEditorSave} />
                ) : (
                  <EmptyEditor />
                )}
              </div>
            </div>

            {previewOpen && (
              <div className="flex-1 min-w-0 border-l border-border flex-shrink-0 flex flex-col overflow-hidden">
                <PreviewPanel
                  projectId={project.id}
                  language={project.language}
                  githubRepo={project.githubRepo}
                  latestRun={latestRun}
                  refreshKey={fileRefreshKey}
                />
              </div>
            )}
          </div>

          {terminalOpen && (
            <div className="h-52 flex-shrink-0 border-t border-border">
              <ConsolePanel run={latestRun} />
            </div>
          )}
        </div>

        {chatOpen && (
          <div className="w-80 xl:w-96 border-l border-border flex-shrink-0 flex flex-col overflow-hidden">
            {showSetupBanner && (
              <SetupBanner
                projectId={project.id}
                onDismiss={dismissSetup}
                onAiSetup={handleAiSetup}
              />
            )}
            <ChatPanel
              ref={chatRef}
              projectId={project.id}
              activeFilePath={activeFile?.path}
              activeFileContent={activeFile?.content}
              onApplyCode={handleApplyCode}
              onApplyToPath={handleApplyToPath}
              onFileChange={handleFileChange}
              onStreamingChange={setAiStreaming}
              autoDevEnabled={autoDevEnabled}
              growthCount={growthCount}
            />
          </div>
        )}
        {!chatOpen && githubOpen && (
          <div className="w-72 border-l border-border flex-shrink-0 flex flex-col overflow-hidden bg-background">
            <GitHubPanel projectId={project.id} onSynced={() => { mutateProject(); setFileRefreshKey((k) => k + 1); }} />
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

      {/* ── Mobile layout ────────────────────────────────────────────── */}
      <div className="flex md:hidden flex-1 overflow-hidden flex-col">
        {/* Main content area */}
        <div className="flex-1 overflow-hidden">
          {mobileTab === "files" && (
            <WorkspaceSidebar
              projectId={project.id}
              activeFilePath={activeFile?.path}
              onFileSelect={handleFileSelect}
              refreshKey={fileRefreshKey}
            />
          )}

          {mobileTab === "editor" && (
            <div className="h-full flex flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden">
                {activeFile ? (
                  <CodeEditor projectId={project.id} file={activeFile} onSave={handleEditorSave} />
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
            </div>
          )}

          {mobileTab === "console" && (
            <div className="h-full flex flex-col overflow-hidden">
              <ConsolePanel run={latestRun} onRun={handleRun} isRunning={isRunning} />
            </div>
          )}

          {mobileTab === "preview" && (
            <div className="h-full flex flex-col overflow-hidden">
              <PreviewPanel
                projectId={project.id}
                language={project.language}
                githubRepo={project.githubRepo}
                latestRun={latestRun}
                refreshKey={fileRefreshKey}
                onOpenConsole={() => setMobileTab("console")}
              />
            </div>
          )}

          {/* AI tab — always mounted so streaming survives tab switches */}
          <div className={cn("h-full overflow-hidden flex flex-col", mobileTab !== "ai" && "hidden")}>
            {showSetupBanner && mobileTab === "ai" && (
              <SetupBanner
                projectId={project.id}
                onDismiss={dismissSetup}
                onAiSetup={handleAiSetup}
              />
            )}
            <ChatPanel
              ref={chatRef}
              projectId={project.id}
              activeFilePath={activeFile?.path}
              activeFileContent={activeFile?.content}
              onApplyCode={handleApplyCode}
              onApplyToPath={handleApplyToPath}
              onFileChange={handleFileChange}
              onStreamingChange={setAiStreaming}
              autoDevEnabled={autoDevEnabled}
              growthCount={growthCount}
            />
          </div>
        </div>

        {/* More menu overlay */}
        {moreMenuOpen && (
          <div ref={moreRef} className="absolute bottom-16 right-2 z-50 bg-card border border-border rounded-xl shadow-xl overflow-hidden min-w-[160px]">
            {[
              { label: "GitHub",  icon: <Github className="w-4 h-4" />,  action: () => { setMobileTab("editor"); setGithubOpen(true); setMoreMenuOpen(false); } },
              { label: "Secrets", icon: <KeyRound className="w-4 h-4" />, action: () => { setMobileTab("editor"); setSecretsOpen(true); setMoreMenuOpen(false); } },
              { label: "Deploy",  icon: <Rocket className="w-4 h-4" />,  action: () => { setMobileTab("editor"); setDeployOpen(true); setMoreMenuOpen(false); } },
            ].map((item) => (
              <button key={item.label} onClick={item.action}
                className="flex items-center gap-3 px-4 py-3 text-sm w-full hover:bg-muted transition-colors text-left">
                {item.icon}{item.label}
              </button>
            ))}
          </div>
        )}

        {/* Mobile bottom tab bar */}
        <div className="flex-shrink-0 border-t border-border bg-background safe-b">
          <div className="flex items-stretch h-[54px]">
            {mobileTabs.map((tab) => {
              const isAiStreaming = tab.id === "ai" && aiStreaming;
              return (
                <button
                  key={tab.id}
                  onClick={() => setMobileTab(tab.id)}
                  className={cn(
                    "flex-1 flex flex-col items-center justify-center gap-[3px] text-[9px] font-medium transition-colors relative",
                    mobileTab === tab.id ? "text-primary" : "text-muted-foreground/70",
                  )}
                >
                  <span className={cn(
                    "flex items-center justify-center w-7 h-5 rounded-md transition-colors relative",
                    mobileTab === tab.id && "text-primary"
                  )}>
                    {tab.icon}
                    {isAiStreaming && (
                      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                  </span>
                  {tab.label}
                </button>
              );
            })}
            {/* More button */}
            <button
              onClick={() => setMoreMenuOpen((v) => !v)}
              className="flex-1 flex flex-col items-center justify-center gap-[3px] text-[9px] font-medium text-muted-foreground/70 transition-colors"
            >
              <span className="flex items-center justify-center w-7 h-5">
                <MoreHorizontal className="w-[18px] h-[18px]" />
              </span>
              More
            </button>
          </div>
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

function ConsolePanel({ run, onRun, isRunning }: { run: Run | null; onRun?: () => void; isRunning?: boolean }) {
  const statusColor =
    run?.status === "success" ? "text-green-400"
    : run?.status === "error"   ? "text-red-400"
    : run?.status === "running" ? "text-amber-400"
    : "text-muted-foreground";

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d]">
      {/* Console chrome */}
      <div className="flex items-center gap-2 px-3 h-9 border-b border-white/5 shrink-0">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/50" />
        </div>
        <span className="text-xs text-muted-foreground flex-1">Console</span>
        {run && (
          <span className={`text-xs ${statusColor}`}>
            {run.status}{run.exitCode != null ? ` · exit ${run.exitCode}` : ""}
          </span>
        )}
      </div>

      {/* Output */}
      <div className="flex-1 overflow-auto p-3 font-mono text-sm text-slate-300">
        {run?.status === "running" && (
          <span className="text-amber-400 animate-pulse">● Running…</span>
        )}
        {run?.output ? (
          <pre className="whitespace-pre-wrap leading-5">{run.output}</pre>
        ) : (
          <div className="flex flex-col items-start gap-3 pt-2">
            <span className="text-muted-foreground/40 text-xs">
              {run ? "No output" : "Press Run ▶ to execute your code"}
            </span>
            {onRun && !run && (
              <button
                onClick={onRun}
                disabled={isRunning}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
              >
                {isRunning ? "Running…" : "▶  Run project"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

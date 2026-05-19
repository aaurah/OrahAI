import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useSearch, useLocation } from "wouter";
import {
  Files, MessageSquare, Code2, Globe, Terminal as TerminalIcon,
  MoreHorizontal, Github, KeyRound, Rocket,
} from "lucide-react";
import { WorkspaceSidebar } from "@/components/editor/WorkspaceSidebar";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { FileTabs } from "@/components/editor/FileTabs";
import { SearchPanel } from "@/components/editor/SearchPanel";
import { CommandPalette } from "@/components/editor/CommandPalette";
import { PackagesPanel } from "@/components/editor/PackagesPanel";
import { EditorSettingsPanel } from "@/components/editor/EditorSettingsPanel";
import { ChatPanel, type ChatPanelHandle } from "@/components/chat/ChatPanel";
import { WorkspaceTopbar } from "@/components/editor/WorkspaceTopbar";
import { GitHubPanel } from "@/components/github/GitHubPanel";
import { PreviewPanel } from "@/components/editor/PreviewPanel";
import { SecretsPanel } from "@/components/editor/SecretsPanel";
import { DeployPanel } from "@/components/editor/DeployPanel";
import { DebugPanel } from "@/components/editor/DebugPanel";
import { SetupBanner } from "@/components/editor/SetupBanner";
import { useProject } from "@/hooks/useProject";
import { useRuns } from "@/hooks/useRuns";
import { useFiles } from "@/hooks/useFiles";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import type { ProjectFile, ApiResponse, Run } from "@/types";

type MobileTab = "files" | "editor" | "ai" | "console" | "preview";
type RightPanel = "chat" | "github" | "secrets" | "deploy" | "debug" | "packages" | "settings" | null;

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearch();
  const [, navigate] = useLocation();
  const { project, isLoading, mutate: mutateProject } = useProject(id ?? null);
  const { runs, mutate: mutateRuns } = useRuns(id ?? null);
  const { flat: allFiles } = useFiles(id ?? null);
  const { user: currentUser } = useAuth();
  const isProjectOwner = !!(project && currentUser && project.ownerId === currentUser.id);
  const latestRun = runs[0] ?? null;

  const isSetupMode = new URLSearchParams(search).get("setup") === "1";
  const initialPrompt = new URLSearchParams(search).get("prompt") ?? "";

  // ── File tabs ────────────────────────────────────────────────────────────────
  const [activeFile, setActiveFile] = useState<ProjectFile | null>(null);
  const [openTabs, setOpenTabs] = useState<ProjectFile[]>([]);
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(new Set());

  // ── Panel open/close state ───────────────────────────────────────────────────
  const [fileRefreshKey, setFileRefreshKey] = useState(0);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [githubOpen, setGithubOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [secretsOpen, setSecretsOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [packagesOpen, setPackagesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);

  // ── Other state ──────────────────────────────────────────────────────────────
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

  // Helper: which right panel is active (first match wins)
  const activeRightPanel: RightPanel = chatOpen ? "chat"
    : githubOpen    ? "github"
    : secretsOpen   ? "secrets"
    : deployOpen    ? "deploy"
    : debugOpen     ? "debug"
    : packagesOpen  ? "packages"
    : settingsOpen  ? "settings"
    : null;

  const openRightPanel = (p: RightPanel) => {
    setChatOpen(p === "chat");
    setGithubOpen(p === "github");
    setSecretsOpen(p === "secrets");
    setDeployOpen(p === "deploy");
    setDebugOpen(p === "debug");
    setPackagesOpen(p === "packages");
    setSettingsOpen(p === "settings");
  };

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key === "k") { e.preventDefault(); setCmdPaletteOpen(true); }
      if (ctrl && e.shiftKey && e.key === "F") { e.preventDefault(); setSearchOpen(v => !v); }
      if (e.key === "Escape") { setCmdPaletteOpen(false); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Auto-fire the initial AI prompt when arriving from "Start building"
  useEffect(() => {
    if (!initialPrompt || promptFiredRef.current || !project) return;
    promptFiredRef.current = true;
    setChatOpen(true);
    setMobileTab("ai");
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
    const intervalId = setInterval(trigger, 4 * 60 * 1000);
    return () => clearInterval(intervalId);
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

  // ── File handling ────────────────────────────────────────────────────────────
  const handleFileSelect = useCallback((file: ProjectFile) => {
    setActiveFile(file);
    setMobileTab("editor");
    // Add to open tabs if not already there
    setOpenTabs(prev => {
      if (prev.some(t => t.path === file.path)) return prev;
      return [...prev, file];
    });
    // Update tab content if we have it
    setOpenTabs(prev => prev.map(t => t.path === file.path ? { ...t, content: file.content } : t));
  }, []);

  const handleTabClose = useCallback((path: string) => {
    setOpenTabs(prev => {
      const next = prev.filter(t => t.path !== path);
      if (activeFile?.path === path) {
        setActiveFile(next[next.length - 1] ?? null);
      }
      return next;
    });
    setDirtyPaths(prev => { const n = new Set(prev); n.delete(path); return n; });
  }, [activeFile]);

  const handleTabSelect = useCallback((file: ProjectFile) => {
    setActiveFile(file);
    setMobileTab("editor");
  }, []);

  const handleDirtyChange = useCallback((path: string, dirty: boolean) => {
    setDirtyPaths(prev => {
      const n = new Set(prev);
      dirty ? n.add(path) : n.delete(path);
      return n;
    });
  }, []);

  const handleSearchNavigate = useCallback(async (path: string, _line?: number) => {
    if (!project) return;
    const existing = openTabs.find(t => t.path === path);
    if (existing) { setActiveFile(existing); setMobileTab("editor"); return; }
    try {
      const res = await api.get<{ data: ProjectFile }>(`/api/files/${project.id}/read?path=${encodeURIComponent(path)}`);
      if (res.data) handleFileSelect(res.data);
    } catch { toast({ title: "Could not open file", variant: "destructive" }); }
  }, [project, openTabs, handleFileSelect]);

  const handleApplyCode = useCallback(async (code: string) => {
    if (!activeFile || !project) return;
    const updated = { ...activeFile, content: code };
    setActiveFile(updated);
    setOpenTabs(prev => prev.map(t => t.path === activeFile.path ? updated : t));
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
      const res = await api.get<{ data: ProjectFile }>(`/api/files/${project.id}/read?path=${encodeURIComponent(path)}`);
      const file = res.data;
      if (!file) { toast({ title: "File not found", description: path, variant: "destructive" }); return; }
      const updated = { ...file, content: code };
      setActiveFile(updated);
      setOpenTabs(prev => {
        if (prev.some(t => t.path === path)) return prev.map(t => t.path === path ? updated : t);
        return [...prev, updated];
      });
      setMobileTab("editor");
      await api.put(`/api/files/${project.id}`, { path: file.path, content: code, mimeType: file.mimeType });
      toast({ title: `Applied to ${path}` });
    } catch {
      toast({ title: "Failed to apply code", description: path, variant: "destructive" });
    }
  }, [project]);

  const handleFileChange = useCallback(async (path: string, action: "write" | "delete") => {
    setFileRefreshKey(k => k + 1);
    if (action === "write" && activeFile?.path === path && project) {
      try {
        const res = await api.get<{ data: ProjectFile }>(`/api/files/${project.id}/read?path=${encodeURIComponent(path)}`);
        if (res.data) {
          setActiveFile(res.data);
          setOpenTabs(prev => prev.map(t => t.path === path ? res.data : t));
        }
      } catch { /* ignore */ }
    }
    if (action === "delete" && activeFile?.path === path) {
      setActiveFile(null);
      handleTabClose(path);
    }
  }, [activeFile, project, handleTabClose]);

  const handleEditorSave = useCallback((content: string) => {
    setActiveFile(f => f ? { ...f, content } : f);
    setOpenTabs(prev => prev.map(t => t.path === activeFile?.path ? { ...t, content } : t));
    setFileRefreshKey(k => k + 1);
  }, [activeFile]);

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

  const handleInstallCommand = (cmd: string) => {
    setTerminalOpen(true);
    setMobileTab("console");
    toast({ title: "Run this command in the terminal:", description: cmd });
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

  // Command palette commands
  const paletteCommands = [
    { id: "run",       label: "Run project",             icon: <span>▶</span>,  action: handleRun,                                  kbd: "Ctrl+Enter" },
    { id: "chat",      label: "Toggle AI chat",          icon: <MessageSquare className="w-3.5 h-3.5" />, action: () => openRightPanel(chatOpen ? null : "chat") },
    { id: "terminal",  label: "Toggle terminal",         icon: <TerminalIcon className="w-3.5 h-3.5" />, action: () => setTerminalOpen(v => !v) },
    { id: "preview",   label: "Toggle preview",          icon: <Globe className="w-3.5 h-3.5" />,         action: () => setPreviewOpen(v => !v) },
    { id: "search",    label: "Search in files",         icon: <span>🔍</span>, action: () => setSearchOpen(v => !v),               kbd: "Ctrl+Shift+F" },
    { id: "packages",  label: "Packages panel",          icon: <span>📦</span>, action: () => openRightPanel(packagesOpen ? null : "packages") },
    { id: "settings",  label: "Editor settings",         icon: <span>⚙️</span>, action: () => openRightPanel(settingsOpen ? null : "settings") },
    { id: "github",    label: "GitHub panel",            icon: <span>🐙</span>, action: () => openRightPanel(githubOpen ? null : "github") },
    { id: "debug",   label: "AI Debugger",              icon: <span>🐛</span>, action: () => openRightPanel(debugOpen ? null : "debug") },
    ...(isProjectOwner ? [
      { id: "secrets", label: "Secrets panel",           icon: <span>🔑</span>, action: () => openRightPanel(secretsOpen ? null : "secrets") },
      { id: "deploy",  label: "Deploy panel",            icon: <span>🚀</span>, action: () => openRightPanel(deployOpen ? null : "deploy") },
    ] : []),
    { id: "explore",   label: "Go to Explore",           icon: <Globe className="w-3.5 h-3.5" />, action: () => navigate("/explore") },
  ];

  return (
    <div className="h-[100dvh] flex flex-col bg-background overflow-hidden">
      <WorkspaceTopbar
        project={project}
        latestRun={latestRun}
        isRunning={isRunning}
        onRun={handleRun}
        chatOpen={chatOpen}
        onChatToggle={() => openRightPanel(chatOpen ? null : "chat")}
        terminalOpen={terminalOpen}
        onTerminalToggle={() => setTerminalOpen(v => !v)}
        githubOpen={githubOpen}
        onGithubToggle={() => openRightPanel(githubOpen ? null : "github")}
        previewOpen={previewOpen}
        onPreviewToggle={() => setPreviewOpen(v => !v)}
        secretsOpen={secretsOpen}
        onSecretsToggle={() => openRightPanel(secretsOpen ? null : "secrets")}
        showSecrets={isProjectOwner}
        deployOpen={deployOpen}
        onDeployToggle={() => openRightPanel(deployOpen ? null : "deploy")}
        autoDevEnabled={autoDevEnabled}
        onAutoDevToggle={() => { setAutoDevEnabled(v => !v); setGrowthCount(0); }}
        growthCount={growthCount}
        searchOpen={searchOpen}
        onSearchToggle={() => setSearchOpen(v => !v)}
        packagesOpen={packagesOpen}
        onPackagesToggle={() => openRightPanel(packagesOpen ? null : "packages")}
        settingsOpen={settingsOpen}
        onSettingsToggle={() => openRightPanel(settingsOpen ? null : "settings")}
        onCommandPalette={() => setCmdPaletteOpen(true)}
      />

      {/* ── Command palette overlay ───────────────────────────────────────── */}
      <CommandPalette
        open={cmdPaletteOpen}
        files={allFiles.filter(f => !f.isDir)}
        onClose={() => setCmdPaletteOpen(false)}
        onFileSelect={handleFileSelect}
        commands={paletteCommands}
      />

      {/* ── Desktop layout ──────────────────────────────────────────────────── */}
      <div className="hidden md:flex flex-1 overflow-hidden">

        {/* LEFT: sidebar or search panel */}
        {searchOpen ? (
          <div className="w-72 flex-shrink-0 border-r border-border flex flex-col overflow-hidden bg-background">
            <SearchPanel
              projectId={project.id}
              onNavigate={handleSearchNavigate}
              onClose={() => setSearchOpen(false)}
            />
          </div>
        ) : (
          <WorkspaceSidebar
            projectId={project.id}
            activeFilePath={activeFile?.path}
            onFileSelect={handleFileSelect}
            refreshKey={fileRefreshKey}
            onSearchOpen={() => setSearchOpen(true)}
          />
        )}

        {/* CENTER: editor + file tabs + preview + terminal */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <FileTabs
            tabs={openTabs}
            activeTabPath={activeFile?.path ?? null}
            dirtyPaths={dirtyPaths}
            onSelect={handleTabSelect}
            onClose={handleTabClose}
          />

          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden min-w-0">
              <div className="flex-1 overflow-hidden">
                {activeFile ? (
                  <CodeEditor
                    projectId={project.id}
                    file={activeFile}
                    onSave={handleEditorSave}
                    onDirtyChange={handleDirtyChange}
                    onCodeAction={(action, prompt, _path) => {
                      setChatOpen(true);
                      setMobileTab("ai");
                      setTimeout(() => chatRef.current?.submit(prompt), 100);
                    }}
                  />
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

        {/* RIGHT: chat / github / secrets / deploy / packages / settings */}
        {activeRightPanel === "chat" && (
          <div className="w-80 xl:w-96 border-l border-border flex-shrink-0 flex flex-col overflow-hidden">
            {showSetupBanner && (
              <SetupBanner projectId={project.id} onDismiss={dismissSetup} onAiSetup={handleAiSetup} />
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
        {activeRightPanel === "github" && (
          <div className="w-72 border-l border-border flex-shrink-0 flex flex-col overflow-hidden bg-background">
            <GitHubPanel projectId={project.id} projectName={project.name} onSynced={() => { mutateProject(); setFileRefreshKey(k => k + 1); }} />
          </div>
        )}
        {activeRightPanel === "secrets" && isProjectOwner && (
          <div className="w-72 border-l border-border flex-shrink-0 flex flex-col overflow-hidden bg-background">
            <SecretsPanel projectId={project.id} />
          </div>
        )}
        {activeRightPanel === "deploy" && (
          <div className="w-80 border-l border-border flex-shrink-0 flex flex-col overflow-hidden bg-background">
            <DeployPanel project={project} onProjectUpdate={mutateProject} />
          </div>
        )}
        {activeRightPanel === "debug" && (
          <div className="w-72 border-l border-border flex-shrink-0 flex flex-col overflow-hidden bg-background">
            <DebugPanel
              projectId={project.id}
              activeFilePath={activeFile?.path}
              onSendToChat={(prompt) => {
                setChatOpen(true);
                setDebugOpen(false);
                setMobileTab("ai");
                setTimeout(() => chatRef.current?.submit(prompt), 100);
              }}
            />
          </div>
        )}
        {activeRightPanel === "packages" && (
          <div className="w-64 border-l border-border flex-shrink-0 flex flex-col overflow-hidden bg-background">
            <PackagesPanel
              projectId={project.id}
              language={project.language}
              onInstall={handleInstallCommand}
            />
          </div>
        )}
        {activeRightPanel === "settings" && (
          <div className="w-64 border-l border-border flex-shrink-0 flex flex-col overflow-hidden bg-background">
            <EditorSettingsPanel onClose={() => openRightPanel(null)} />
          </div>
        )}
      </div>

      {/* ── Mobile layout ────────────────────────────────────────────────────── */}
      <div className="flex md:hidden flex-1 overflow-hidden flex-col">
        <div className="flex-1 overflow-hidden">
          {mobileTab === "files" && (
            <WorkspaceSidebar
              projectId={project.id}
              activeFilePath={activeFile?.path}
              onFileSelect={handleFileSelect}
              refreshKey={fileRefreshKey}
              onSearchOpen={() => setSearchOpen(true)}
            />
          )}

          {mobileTab === "editor" && (
            <div className="h-full flex flex-col overflow-hidden">
              {githubOpen ? (
                <div className="flex-1 overflow-hidden flex flex-col">
                  <div className="flex items-center gap-2 px-3 h-9 border-b border-border shrink-0">
                    <button onClick={() => setGithubOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <GitHubPanel projectId={project.id} projectName={project.name} onSynced={() => { mutateProject(); setFileRefreshKey(k => k + 1); }} />
                  </div>
                </div>
              ) : secretsOpen && isProjectOwner ? (
                <div className="flex-1 overflow-hidden flex flex-col">
                  <div className="flex items-center gap-2 px-3 h-9 border-b border-border shrink-0">
                    <button onClick={() => setSecretsOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
                  </div>
                  <div className="flex-1 overflow-hidden"><SecretsPanel projectId={project.id} /></div>
                </div>
              ) : deployOpen ? (
                <div className="flex-1 overflow-hidden flex flex-col">
                  <div className="flex items-center gap-2 px-3 h-9 border-b border-border shrink-0">
                    <button onClick={() => setDeployOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
                  </div>
                  <div className="flex-1 overflow-hidden"><DeployPanel project={project} onProjectUpdate={mutateProject} /></div>
                </div>
              ) : packagesOpen ? (
                <div className="flex-1 overflow-hidden flex flex-col">
                  <div className="flex items-center gap-2 px-3 h-9 border-b border-border shrink-0">
                    <button onClick={() => setPackagesOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
                  </div>
                  <div className="flex-1 overflow-hidden"><PackagesPanel projectId={project.id} language={project.language} onInstall={handleInstallCommand} /></div>
                </div>
              ) : settingsOpen ? (
                <div className="flex-1 overflow-hidden flex flex-col">
                  <div className="flex items-center gap-2 px-3 h-9 border-b border-border shrink-0">
                    <button onClick={() => setSettingsOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">← Back</button>
                  </div>
                  <div className="flex-1 overflow-hidden"><EditorSettingsPanel onClose={() => setSettingsOpen(false)} /></div>
                </div>
              ) : (
                <div className="flex-1 overflow-hidden flex flex-col">
                  <FileTabs
                    tabs={openTabs}
                    activeTabPath={activeFile?.path ?? null}
                    dirtyPaths={dirtyPaths}
                    onSelect={handleTabSelect}
                    onClose={handleTabClose}
                  />
                  <div className="flex-1 overflow-hidden">
                    {activeFile ? (
                      <CodeEditor
                        projectId={project.id}
                        file={activeFile}
                        onSave={handleEditorSave}
                        onDirtyChange={handleDirtyChange}
                        onCodeAction={(action, prompt, _path) => {
                          setChatOpen(true);
                          setMobileTab("ai");
                          setTimeout(() => chatRef.current?.submit(prompt), 100);
                        }}
                      />
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-3 px-6">
                        <Code2 className="w-10 h-10 opacity-20" />
                        <p className="text-sm text-center">No file open</p>
                        <button onClick={() => setMobileTab("files")} className="text-xs text-primary underline underline-offset-2">Browse files →</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
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

          <div className={cn("h-full overflow-hidden flex flex-col", mobileTab !== "ai" && "hidden")}>
            {showSetupBanner && mobileTab === "ai" && (
              <SetupBanner projectId={project.id} onDismiss={dismissSetup} onAiSetup={handleAiSetup} />
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
              { label: "GitHub",   icon: <Github className="w-4 h-4" />,      action: () => { setMobileTab("editor"); setGithubOpen(true); setMoreMenuOpen(false); } },
              { label: "Packages", icon: <span className="text-sm">📦</span>, action: () => { setMobileTab("editor"); setPackagesOpen(true); setMoreMenuOpen(false); } },
              { label: "Settings", icon: <span className="text-sm">⚙️</span>, action: () => { setMobileTab("editor"); setSettingsOpen(true); setMoreMenuOpen(false); } },
              ...(isProjectOwner ? [
                { label: "Secrets", icon: <KeyRound className="w-4 h-4" />, action: () => { setMobileTab("editor"); setSecretsOpen(true); setMoreMenuOpen(false); } },
                { label: "Deploy",  icon: <Rocket className="w-4 h-4" />,   action: () => { setMobileTab("editor"); setDeployOpen(true); setMoreMenuOpen(false); } },
              ] : []),
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
            <button
              onClick={() => setMoreMenuOpen(v => !v)}
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

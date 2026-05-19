import { useState, useEffect } from "react";
import { Package, Plus, ExternalLink, Loader2, Search, X, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import type { ApiResponse, ProjectFile } from "@/types";

interface PackageEntry {
  name: string;
  version: string;
  isDev: boolean;
}

interface NpmResult {
  name: string;
  description: string;
  version: string;
}

interface Props {
  projectId: string;
  language: string;
  onInstall?: (cmd: string) => void;
}

function parsePackages(content: string, lang: string): PackageEntry[] {
  try {
    if (lang === "python") {
      return content.split("\n")
        .map(l => l.trim())
        .filter(l => l && !l.startsWith("#"))
        .map(l => {
          const [name, ...rest] = l.split(/[>=<!~^]/);
          return { name: name.trim(), version: rest.join("").trim() || "*", isDev: false };
        });
    }
    const pkg = JSON.parse(content);
    const deps = Object.entries(pkg.dependencies ?? {}).map(([name, version]) =>
      ({ name, version: String(version), isDev: false }));
    const dev = Object.entries(pkg.devDependencies ?? {}).map(([name, version]) =>
      ({ name, version: String(version), isDev: true }));
    return [...deps, ...dev];
  } catch { return []; }
}

function installCmd(lang: string, pkg: string, dev: boolean): string {
  if (lang === "python") return `pip install ${pkg}`;
  if (dev) return `npm install --save-dev ${pkg}`;
  return `npm install ${pkg}`;
}

function pkgFile(lang: string): string {
  return lang === "python" ? "requirements.txt" : "package.json";
}

export function PackagesPanel({ projectId, language, onInstall }: Props) {
  const [packages, setPackages] = useState<PackageEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [npmResults, setNpmResults] = useState<NpmResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addDev, setAddDev] = useState(false);
  const [newPkg, setNewPkg] = useState("");

  const loadPackages = async () => {
    setIsLoading(true);
    try {
      const res = await api.get<ApiResponse<ProjectFile>>(
        `/api/files/${projectId}/read?path=${encodeURIComponent(pkgFile(language))}`
      );
      if (res.data?.content) setPackages(parsePackages(res.data.content, language));
    } catch { setPackages([]); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { loadPackages(); }, [projectId, language]);

  const searchNpm = async (q: string) => {
    if (!q.trim() || language === "python") return;
    setIsSearching(true);
    try {
      const res = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=8`);
      const data = await res.json() as { objects: Array<{ package: { name: string; description: string; version: string } }> };
      setNpmResults(data.objects.map(o => ({ name: o.package.name, description: o.package.description, version: o.package.version })));
    } catch { setNpmResults([]); }
    finally { setIsSearching(false); }
  };

  const handleInstall = (pkgName: string) => {
    const cmd = installCmd(language, pkgName, addDev);
    onInstall?.(cmd);
    toast({ title: `Install command: ${cmd}`, description: "Run this in the terminal" });
    setNewPkg(""); setSearch(""); setNpmResults([]);
  };

  const filtered = packages.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-border/40 shrink-0">
        <Package className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Packages</span>
        <button onClick={loadPackages} className="ml-auto p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
          <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Add package section */}
        <div className="p-3 space-y-2 border-b border-border/40">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Add package</p>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-1.5 h-7 px-2 rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
              <Search className="w-3 h-3 text-muted-foreground shrink-0" />
              <input
                value={newPkg}
                onChange={e => { setNewPkg(e.target.value); searchNpm(e.target.value); }}
                onKeyDown={e => { if (e.key === "Enter" && newPkg.trim()) handleInstall(newPkg.trim()); }}
                placeholder={language === "python" ? "package-name" : "package-name"}
                className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
              />
              {newPkg && <button onClick={() => { setNewPkg(""); setNpmResults([]); }}><X className="w-3 h-3 text-muted-foreground" /></button>}
            </div>
            <button
              onClick={() => newPkg.trim() && handleInstall(newPkg.trim())}
              disabled={!newPkg.trim()}
              className="flex items-center gap-1 h-7 px-2.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              <Plus className="w-3 h-3" />Install
            </button>
          </div>

          {language !== "python" && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={addDev} onChange={e => setAddDev(e.target.checked)} className="w-3 h-3" />
              Add as devDependency
            </label>
          )}

          {/* NPM search results */}
          {isSearching && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />Searching…</div>}
          {npmResults.length > 0 && (
            <div className="rounded-md border border-border overflow-hidden">
              {npmResults.map(pkg => (
                <button key={pkg.name} onClick={() => handleInstall(pkg.name)}
                  className="w-full flex items-start gap-2 px-3 py-2 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-b-0 text-left">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{pkg.name}</p>
                    {pkg.description && <p className="text-[10px] text-muted-foreground truncate">{pkg.description}</p>}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{pkg.version}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Installed packages */}
        <div className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Installed ({packages.length})
            </p>
          </div>

          {packages.length > 4 && (
            <div className="flex items-center gap-1.5 h-6 px-2 rounded-md border border-input bg-background">
              <Search className="w-3 h-3 text-muted-foreground shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter packages…"
                className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {packages.length === 0 ? `No ${pkgFile(language)} found` : "No matches"}
            </p>
          ) : (
            <div className="space-y-0.5">
              {filtered.map(pkg => (
                <div key={pkg.name} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/30 group">
                  <Package className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="flex-1 text-xs truncate font-medium">{pkg.name}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">{pkg.version}</span>
                  {pkg.isDev && <span className="text-[9px] px-1 rounded bg-muted text-muted-foreground">dev</span>}
                  <a href={`https://npmjs.com/package/${pkg.name}`} target="_blank" rel="noopener noreferrer"
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

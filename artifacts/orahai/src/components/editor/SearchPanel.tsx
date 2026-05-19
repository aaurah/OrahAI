import { useState, useRef, useCallback } from "react";
import { Search, X, Loader2, FileText, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ApiResponse, ProjectFile } from "@/types";

interface SearchResult {
  path: string;
  line: number;
  preview: string;
}

interface Props {
  projectId: string;
  onNavigate: (path: string, line?: number) => void;
  onClose: () => void;
}

export function SearchPanel({ projectId, onNavigate, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setSearched(false); return; }
    setIsSearching(true);
    try {
      const res = await api.get<ApiResponse<SearchResult[]>>(
        `/api/files/${projectId}/search?q=${encodeURIComponent(q)}&limit=100`
      );
      setResults(res.data);
      setSearched(true);
    } catch { setResults([]); }
    finally { setIsSearching(false); }
  }, [projectId]);

  const handleChange = (v: string) => {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 300);
  };

  // Group results by file
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.path] ??= []).push(r);
    return acc;
  }, {});

  const totalMatches = results.length;
  const totalFiles = Object.keys(grouped).length;

  function highlight(text: string, q: string): React.ReactNode {
    if (!q.trim()) return text;
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-400/30 text-foreground rounded-sm px-0.5">{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 px-3 h-9 border-b border-border/40 shrink-0">
        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs font-medium">Search</span>
        <button onClick={onClose} className="ml-auto p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-3 py-2 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-2 h-7 px-2 rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
          {isSearching
            ? <Loader2 className="w-3 h-3 animate-spin text-muted-foreground shrink-0" />
            : <Search className="w-3 h-3 text-muted-foreground shrink-0" />}
          <input
            autoFocus
            value={query}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") onClose(); }}
            placeholder="Search in files…"
            className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button onClick={() => { setQuery(""); setResults([]); setSearched(false); }} className="text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {searched && (
          <p className="text-[10px] text-muted-foreground mt-1.5">
            {totalMatches === 0 ? "No results" : `${totalMatches} result${totalMatches !== 1 ? "s" : ""} in ${totalFiles} file${totalFiles !== 1 ? "s" : ""}`}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {Object.entries(grouped).map(([path, hits]) => (
          <div key={path}>
            <button
              onClick={() => onNavigate(path)}
              className="w-full flex items-center gap-2 px-3 py-1.5 bg-muted/30 hover:bg-muted/60 transition-colors border-b border-border/30"
            >
              <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-[11px] font-medium text-foreground flex-1 truncate text-left">{path}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{hits.length}</span>
              <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
            </button>
            {hits.map((h, i) => (
              <button
                key={i}
                onClick={() => onNavigate(h.path, h.line)}
                className="w-full flex items-start gap-3 px-4 py-1.5 hover:bg-muted/40 transition-colors border-b border-border/20"
              >
                <span className="text-[10px] text-muted-foreground/60 font-mono shrink-0 w-7 text-right mt-0.5">{h.line}</span>
                <span className="text-[11px] font-mono text-left truncate text-muted-foreground leading-relaxed">
                  {highlight(h.preview, query)}
                </span>
              </button>
            ))}
          </div>
        ))}
        {searched && totalMatches === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Search className="w-8 h-8 opacity-20 mb-2" />
            <p className="text-sm">No results for "{query}"</p>
          </div>
        )}
        {!searched && !isSearching && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Search className="w-8 h-8 opacity-20 mb-2" />
            <p className="text-xs">Type to search across all files</p>
          </div>
        )}
      </div>
    </div>
  );
}

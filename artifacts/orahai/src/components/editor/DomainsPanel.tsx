import { useState, useEffect, useCallback } from "react";
import {
  Globe, Plus, Trash2, RefreshCw, CheckCircle2, XCircle, Clock,
  ExternalLink, Copy, Check, ChevronDown, ChevronUp, AlertCircle,
  Link2, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { api } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";

interface Domain {
  id: string;
  projectId: string;
  domain: string;
  status: "pending" | "active" | "failed";
  verificationToken: string;
  verifiedAt: string | null;
  createdAt: string;
}

interface Props {
  project: Project;
}

function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className={cn("p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0", className)}
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function MonoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 bg-[#0d0d0d] rounded-lg px-3 py-2 border border-white/5">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-14 shrink-0">{label}</span>
      <span className="flex-1 font-mono text-xs text-slate-300 break-all">{value}</span>
      <CopyButton text={value} />
    </div>
  );
}

function Collapsible({ title, children, defaultOpen = false }: {
  title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-card hover:bg-muted/30 transition-colors text-left"
      >
        <span className="text-xs font-semibold">{title}</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 pt-2 space-y-3">{children}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: Domain["status"] }) {
  if (status === "active") return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5">
      <CheckCircle2 className="w-3 h-3" /> Active
    </span>
  );
  if (status === "failed") return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">
      <XCircle className="w-3 h-3" /> Failed
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-[10px] font-semibold text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-full px-2 py-0.5">
      <Clock className="w-3 h-3" /> Pending
    </span>
  );
}

function DnsInstructions({ domain, token }: { domain: string; token: string }) {
  const isSubdomain = domain.split(".").length > 2;
  const subdomain = isSubdomain ? domain.split(".")[0] : "@";
  const rootDomain = isSubdomain ? domain.split(".").slice(1).join(".") : domain;
  void rootDomain;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground leading-relaxed">
        Add these DNS records at your domain registrar, then click <strong className="text-foreground">Verify</strong>.
      </p>

      {/* Step 1: Point to OrahAI */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          1. Point your domain to OrahAI
        </p>
        {isSubdomain ? (
          <MonoRow label="CNAME" value={`${subdomain} → app.orahai.app`} />
        ) : (
          <>
            <MonoRow label="A" value={`@ → 76.76.21.21`} />
            <MonoRow label="CNAME" value={`www → app.orahai.app`} />
          </>
        )}
      </div>

      {/* Step 2: Verification TXT record */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          2. Add verification record
        </p>
        <MonoRow label="TXT" value={`@ → ${token}`} />
        <p className="text-[10px] text-muted-foreground">
          This record proves you own the domain. It can be removed after verification.
        </p>
      </div>

      {/* Cloudflare note */}
      <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 flex gap-2">
        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-300/80 leading-relaxed">
          <strong className="text-amber-300">Cloudflare users:</strong> Set the DNS record to <strong className="text-amber-300">DNS only</strong> (grey cloud), not proxied, while verifying.
        </p>
      </div>
    </div>
  );
}

function DomainCard({ domain, onDelete, onVerify }: {
  domain: Domain;
  onDelete: (id: string) => void;
  onVerify: (id: string) => Promise<void>;
}) {
  const [verifying, setVerifying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDns, setShowDns] = useState(domain.status !== "active");

  const handleVerify = async () => {
    setVerifying(true);
    try { await onVerify(domain.id); }
    finally { setVerifying(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try { await onDelete(domain.id); }
    finally { setDeleting(false); }
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      {/* Domain header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-mono font-medium truncate">{domain.domain}</span>
            <StatusBadge status={domain.status} />
          </div>
          {domain.status === "active" && (
            <a
              href={`https://${domain.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-primary hover:underline flex items-center gap-1 mt-0.5"
            >
              https://{domain.domain} <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {domain.status !== "active" && (
            <button
              onClick={handleVerify}
              disabled={verifying}
              title="Check verification"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 text-xs font-medium transition-colors disabled:opacity-50"
            >
              {verifying
                ? <RefreshCw className="w-3 h-3 animate-spin" />
                : <ShieldCheck className="w-3 h-3" />}
              <span className="hidden sm:inline">Verify</span>
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Remove domain"
            className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* DNS instructions toggle */}
      {domain.status !== "active" && (
        <div className="border-t border-border">
          <button
            onClick={() => setShowDns(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 transition-colors text-left"
          >
            <span className="text-[11px] font-medium text-muted-foreground">DNS configuration</span>
            {showDns
              ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
              : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
          {showDns && (
            <div className="px-4 pb-4 border-t border-border/50">
              <DnsInstructions domain={domain.domain} token={domain.verificationToken} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const REGISTRARS = [
  { name: "Cloudflare", url: "https://www.cloudflare.com/products/registrar/", note: "At-cost pricing + best DNS" },
  { name: "Namecheap", url: "https://www.namecheap.com", note: "Low prices, easy UI" },
  { name: "Porkbun", url: "https://porkbun.com", note: "Cheapest .com & .io domains" },
  { name: "Google Domains", url: "https://domains.google", note: "Simple & reliable" },
];

export function DomainsPanel({ project }: Props) {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const loadDomains = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Domain[] }>(`/api/projects/${project.id}/domains`);
      setDomains(res.data ?? []);
    } catch {
      setDomains([]);
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => { void loadDomains(); }, [loadDomains]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim() || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await api.post<{ data: Domain }>(`/api/projects/${project.id}/domains`, { domain: newDomain.trim() });
      setDomains(prev => [...prev, res.data]);
      setNewDomain("");
      toast({ title: `Domain ${res.data.domain} added — configure DNS to activate it` });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      const msg = e.response?.data?.message ?? "Failed to add domain";
      setAddError(msg);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (domainId: string) => {
    try {
      await api.delete(`/api/projects/${project.id}/domains/${domainId}`);
      setDomains(prev => prev.filter(d => d.id !== domainId));
      toast({ title: "Domain removed" });
    } catch {
      toast({ title: "Failed to remove domain", variant: "destructive" });
    }
  };

  const handleVerify = async (domainId: string) => {
    try {
      const res = await api.post<{ data: Domain; verified: boolean }>(
        `/api/projects/${project.id}/domains/${domainId}/verify`,
        {},
      );
      setDomains(prev => prev.map(d => d.id === domainId ? res.data : d));
      if (res.verified) {
        toast({ title: `${res.data.domain} verified and active!` });
      } else {
        toast({ title: "DNS records not found yet — propagation can take up to 24 hours", variant: "destructive" });
      }
    } catch {
      toast({ title: "Verification check failed", variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 h-10 border-b border-border shrink-0">
        <Globe className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Custom Domains</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* Add domain */}
        <div className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Add a domain</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Connect a domain you already own, or register a new one below.
            </p>
          </div>

          <form onSubmit={handleAdd} className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="new-domain" className="sr-only">Domain</Label>
              <Input
                id="new-domain"
                placeholder="yourdomain.com or app.yourdomain.com"
                value={newDomain}
                onChange={e => { setNewDomain(e.target.value); setAddError(null); }}
                className="font-mono text-sm"
              />
            </div>
            <Button type="submit" disabled={adding || !newDomain.trim()} className="shrink-0 gap-1.5">
              {adding ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add
            </Button>
          </form>
          {addError && (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 shrink-0" />{addError}
            </p>
          )}
        </div>

        {/* Existing domains */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your domains</p>
            <button
              onClick={loadDomains}
              disabled={loading}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Refresh"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : domains.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 p-6 flex flex-col items-center gap-2 text-center">
              <Link2 className="w-6 h-6 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">No domains yet</p>
              <p className="text-xs text-muted-foreground/70">Add a domain above to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {domains.map(d => (
                <DomainCard
                  key={d.id}
                  domain={d}
                  onDelete={handleDelete}
                  onVerify={handleVerify}
                />
              ))}
            </div>
          )}
        </div>

        {/* Register a new domain */}
        <Collapsible title="Register a new domain" defaultOpen={domains.length === 0}>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Don't have a domain yet? Buy one from any registrar and come back to add it above.
          </p>
          <div className="space-y-2">
            {REGISTRARS.map(r => (
              <a
                key={r.name}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground">{r.note}</p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </a>
            ))}
          </div>
        </Collapsible>

        {/* How it works */}
        <Collapsible title="How it works">
          <ol className="space-y-3">
            {[
              { n: "1", text: "Register a domain at any registrar (or use one you already own)." },
              { n: "2", text: "Add it above — OrahAI will generate the DNS records you need." },
              { n: "3", text: "Log into your registrar and add the CNAME/A and TXT records shown." },
              { n: "4", text: "Click Verify — DNS propagation takes 2–30 minutes, rarely up to 48 hours." },
              { n: "5", text: "Once active, your app is live at your domain with automatic HTTPS." },
            ].map(step => (
              <li key={step.n} className="flex gap-3">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {step.n}
                </span>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.text}</p>
              </li>
            ))}
          </ol>
        </Collapsible>

      </div>
    </div>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { api } from "@/lib/api";
import { toast } from "@/hooks/useToast";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { PROJECT_TEMPLATES } from "@orahai/types";
import type { ApiResponse, Project } from "@orahai/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

export function CreateProjectDialog({ open, onOpenChange, onCreated }: Props) {
  const router = useRouter();
  const { workspaces } = useWorkspaces();
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("nodejs");
  const [workspaceId, setWorkspaceId] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !workspaceId) return;
    setIsLoading(true);
    try {
      const res = await api.post<ApiResponse<Project>>("/api/projects", {
        name: name.trim(), language, workspaceId,
      });
      toast({ title: "Project created!" });
      onOpenChange(false);
      onCreated?.();
      router.push(`/workspace/${res.data.id}`);
    } catch (err: unknown) {
      toast({ title: (err as Error).message ?? "Failed to create project", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-card border rounded-xl shadow-xl p-6">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-lg font-semibold mb-4">New project</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pname">Project name</Label>
            <Input
              id="pname"
              placeholder="My awesome project"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>Language / Template</Label>
            <div className="grid grid-cols-2 gap-2">
              {PROJECT_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setLanguage(t.language)}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm text-left transition-colors ${
                    language === t.language
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  <span className="text-base">{t.icon}</span>
                  <span className="font-medium">{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="workspace">Workspace</Label>
            {workspaces.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                You don&apos;t have any workspaces yet.{" "}
                <button
                  type="button"
                  onClick={async () => {
                    const res = await api.post<ApiResponse<{ id: string; name: string }>>("/api/workspaces", { name: "My Workspace" });
                    setWorkspaceId(res.data.id);
                  }}
                  className="text-primary hover:underline"
                >
                  Create one
                </button>
              </p>
            ) : (
              <select
                id="workspace"
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                required
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select workspace…</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isLoading || !workspaceId}>
            {isLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating…</> : "Create project"}
          </Button>
        </form>
      </div>
    </div>
  );
}

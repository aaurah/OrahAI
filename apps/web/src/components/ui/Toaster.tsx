"use client";
import { useToast } from "@/hooks/useToast";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Toaster() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "flex items-start gap-3 rounded-lg border p-4 shadow-md bg-card text-card-foreground animate-in slide-in-from-bottom-2",
            t.variant === "destructive" && "border-destructive/50 bg-destructive/10 text-destructive"
          )}
        >
          <div className="flex-1 text-sm">
            {t.title && <p className="font-medium">{t.title}</p>}
            {t.description && <p className="text-muted-foreground mt-0.5">{t.description}</p>}
          </div>
          <button onClick={() => dismiss(t.id)} className="shrink-0 opacity-50 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

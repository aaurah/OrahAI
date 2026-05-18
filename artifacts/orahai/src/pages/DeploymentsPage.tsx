import { Navbar } from "@/components/layout/Navbar";
import { Rocket } from "lucide-react";

export default function DeploymentsPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 flex flex-col items-center justify-center text-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Rocket className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">Deployments</h1>
        <p className="text-muted-foreground">Deploy and manage your projects. Coming soon.</p>
      </main>
    </div>
  );
}

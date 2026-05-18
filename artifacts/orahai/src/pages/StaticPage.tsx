import { Link } from "wouter";
import { Bot } from "lucide-react";

const CONTENT: Record<string, { title: string; body: string }> = {
  privacy: {
    title: "Privacy Policy",
    body: "OrahAI respects your privacy. We collect only the data necessary to provide our services — account information, project files, and usage analytics. We do not sell your data to third parties. All data is stored securely and encrypted at rest. You may delete your account and all associated data at any time.",
  },
  terms: {
    title: "Terms of Service",
    body: "By using OrahAI, you agree to use the platform in compliance with all applicable laws. You retain ownership of all code and content you create. OrahAI reserves the right to suspend accounts that violate our policies. Service availability is provided on a best-effort basis.",
  },
};

export default function StaticPage({ page }: { page: "privacy" | "terms" }) {
  const { title, body } = CONTENT[page] ?? { title: "Not Found", body: "" };
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b px-6 h-14 flex items-center">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <Bot className="w-5 h-5 text-primary" />
          OrahAI
        </Link>
      </nav>
      <main className="max-w-2xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold mb-6">{title}</h1>
        <p className="text-muted-foreground leading-relaxed">{body}</p>
      </main>
    </div>
  );
}

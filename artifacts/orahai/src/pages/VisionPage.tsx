import { Link } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import {
  Bot, Rocket, Zap, Shield, Users, Globe, Code2, Cpu,
  CheckCircle, ArrowRight, ChevronRight,
} from "lucide-react";

const VISION_PILLARS = [
  {
    icon: Cpu,
    title: "Autonomous Development",
    description: "AI builds full applications from plain-English specifications. Describe what you need — architecture, data model, UI — and OrahAI writes the complete codebase.",
    status: "In Progress",
  },
  {
    icon: Shield,
    title: "Self-Healing Code",
    description: "The system continuously monitors for errors, deprecations, and security vulnerabilities — and fixes them automatically without breaking your logic.",
    status: "Roadmap",
  },
  {
    icon: Globe,
    title: "Universal Deployment",
    description: "Deploy anywhere with one command: GitHub Pages, Vercel, Netlify, Docker, your own infrastructure. OrahAI handles the config, the CI/CD, the domains.",
    status: "In Progress",
  },
  {
    icon: Users,
    title: "AI-Native Teams",
    description: "Humans and AI agents work side-by-side in shared workspaces. Agents run tasks in the background — build backend, clean repo, generate docs — while you guide direction.",
    status: "Roadmap",
  },
  {
    icon: Shield,
    title: "Sovereign Infrastructure",
    description: "Your own cloud, your own compute, your own data. Enterprise customers can self-host OrahAI on their infrastructure with full audit trails and compliance.",
    status: "Roadmap",
  },
];

const ROADMAP = [
  {
    quarter: "Q3 2025",
    label: "Foundation",
    active: true,
    items: [
      "AI Debugger — detect errors and propose fixes",
      "Team Collaboration — shared projects and real-time editing",
      "Deployment Hub — Vercel, Netlify, one-click deploy",
      "Vision & Roadmap page",
    ],
  },
  {
    quarter: "Q4 2025",
    label: "Platform",
    active: false,
    items: [
      "AI Agents — background tasks: build, clean, document",
      "Plugin System — themes, linters, integrations",
      "Cloud Workspaces — persistent storage, multi-project",
    ],
  },
  {
    quarter: "Q1 2026",
    label: "Scale",
    active: false,
    items: [
      "Self-healing code — automated bug detection and repair",
      "Universal Deployment Hub — every cloud in one panel",
    ],
  },
  {
    quarter: "Q2 2026",
    label: "Enterprise",
    active: false,
    items: [
      "Sovereign Infrastructure — self-hosted OrahAI",
      "Audit trails, SSO, compliance tooling",
      "Dedicated enterprise compute and SLA",
    ],
  },
];

const STATS = [
  { value: "10M+", label: "Lines of code generated" },
  { value: "50K+", label: "Projects created" },
  { value: "99.9%", label: "Platform uptime" },
  { value: "<3s", label: "Average AI response" },
];

export default function VisionPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/40">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
        <div className="max-w-5xl mx-auto px-6 py-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary mb-8">
            <Bot className="w-3.5 h-3.5" />
            The AI Software Factory
          </div>
          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-tight mb-6">
            Where software
            <span className="text-primary"> builds itself</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10">
            OrahAI is not just an IDE. It's the foundation of a world where AI writes, tests, deploys, and maintains code — and humans focus on what they actually want to build.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/dashboard">
              <Button size="lg" className="gap-2">
                Start building <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link href="/register">
              <Button size="lg" variant="outline">Get started free</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-border/40 bg-muted/20">
        <div className="max-w-5xl mx-auto px-6 py-10 grid grid-cols-2 sm:grid-cols-4 gap-6">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-3xl font-bold text-primary">{s.value}</div>
              <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Vision Pillars */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold tracking-tight mb-3">Five pillars of the autonomous factory</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Each pillar is a stage on the journey from today's AI-assisted IDE to tomorrow's fully autonomous software factory.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {VISION_PILLARS.map((pillar, i) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.title}
                className="rounded-2xl border border-border bg-card p-6 flex flex-col gap-4"
              >
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className={`text-[10px] font-semibold rounded-full px-2.5 py-1 uppercase tracking-wider ${
                    pillar.status === "In Progress"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {pillar.status}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-base mb-2">{pillar.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{pillar.description}</p>
                </div>
              </div>
            );
          })}
          {/* CTA card */}
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 flex flex-col justify-between gap-4">
            <div>
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center mb-4">
                <Rocket className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-semibold text-base mb-2">The mission</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The next billion builders are not developers. They have an idea, a business, a problem to solve — but no team to write the code. OrahAI is built for them.
              </p>
            </div>
            <Link href="/register">
              <Button size="sm" className="w-full gap-1.5">
                Join the factory <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Roadmap */}
      <section className="border-t border-border/40 bg-muted/10">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold tracking-tight mb-3">Product roadmap</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              A transparent, quarter-by-quarter plan from today's AI IDE to the autonomous software factory.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {ROADMAP.map((phase) => (
              <div
                key={phase.quarter}
                className={`rounded-2xl border p-5 ${
                  phase.active
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-card"
                }`}
              >
                <div className={`text-xs font-mono font-semibold mb-1 ${phase.active ? "text-primary" : "text-muted-foreground"}`}>
                  {phase.quarter}
                </div>
                <div className="font-bold text-base mb-4">{phase.label}</div>
                <ul className="space-y-2.5">
                  {phase.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground leading-relaxed">
                      <CheckCircle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${phase.active ? "text-primary" : "text-muted-foreground/40"}`} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border/40">
        <div className="max-w-3xl mx-auto px-6 py-20 text-center">
          <h2 className="text-3xl font-bold tracking-tight mb-4">
            Build the future with us
          </h2>
          <p className="text-muted-foreground text-lg mb-8 leading-relaxed">
            OrahAI is open for builders, investors, advisors, and engineers who believe software development should be effortless. Come build the factory with us.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/dashboard">
              <Button size="lg" className="gap-2">
                Start building <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <a href="mailto:hello@orahai.app">
              <Button size="lg" variant="outline">Contact us</Button>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

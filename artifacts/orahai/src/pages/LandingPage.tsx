import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/Button";
import {
  ArrowRight, Bot, Code2, Rocket, Shield, Zap, Globe, Sparkles,
  Terminal, GitBranch, Cpu, Play, CheckCircle, Users, BarChart3,
  Layers, Wrench, FlaskConical,
} from "lucide-react";

// ── Typing animation ──────────────────────────────────────────────────────────
const TERMINAL_LINES = [
  { prefix: "$", text: "orahai build --prompt \"REST API with auth\"", color: "text-emerald-400" },
  { prefix: "✓", text: "Analysing prompt…", color: "text-sky-400" },
  { prefix: "✓", text: "Writing src/index.ts", color: "text-sky-400" },
  { prefix: "✓", text: "Writing src/auth/jwt.ts", color: "text-sky-400" },
  { prefix: "✓", text: "Writing src/routes/users.ts", color: "text-sky-400" },
  { prefix: "✓", text: "Writing docker-compose.yml", color: "text-sky-400" },
  { prefix: "🚀", text: "Deployed to https://my-api.orahai.app", color: "text-purple-400" },
];

function TerminalMockup() {
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    if (visibleLines >= TERMINAL_LINES.length) return;
    const t = setTimeout(() => setVisibleLines(v => v + 1), visibleLines === 0 ? 600 : 480);
    return () => clearTimeout(t);
  }, [visibleLines]);

  useEffect(() => {
    const t = setTimeout(() => setVisibleLines(0), TERMINAL_LINES.length * 520 + 2000);
    return () => clearTimeout(t);
  }, [visibleLines === 0]);

  return (
    <div className="relative rounded-xl border border-border/50 bg-[#0d1117] overflow-hidden shadow-2xl shadow-black/40">
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border/30 bg-[#161b22]">
        <div className="w-3 h-3 rounded-full bg-red-500/70" />
        <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
        <div className="w-3 h-3 rounded-full bg-green-500/70" />
        <span className="ml-2 text-xs text-muted-foreground font-mono">OrahAI Terminal</span>
      </div>
      <div className="p-5 font-mono text-sm space-y-2 min-h-[220px]">
        {TERMINAL_LINES.slice(0, visibleLines).map((line, i) => (
          <div key={i} className="flex items-start gap-2 animate-in fade-in duration-300">
            <span className={`${line.color} shrink-0`}>{line.prefix}</span>
            <span className="text-slate-300">{line.text}</span>
          </div>
        ))}
        {visibleLines < TERMINAL_LINES.length && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <span className="w-2 h-4 bg-primary/70 animate-pulse rounded-sm" />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stats ─────────────────────────────────────────────────────────────────────
const STATS = [
  { value: "10M+", label: "Lines of code generated" },
  { value: "50k+", label: "Projects created" },
  { value: "99.9%", label: "Uptime" },
  { value: "< 3s", label: "Avg. AI response" },
];

// ── How it works ──────────────────────────────────────────────────────────────
const STEPS = [
  {
    step: "01",
    icon: Sparkles,
    title: "Describe what you want",
    desc: "Type your idea in plain English. OrahAI understands the full stack — framework, database, auth, and deployment.",
  },
  {
    step: "02",
    icon: Cpu,
    title: "AI builds it for you",
    desc: "The AI pair programmer writes every file, fixes errors, runs tests, and refactors code — all in your browser.",
  },
  {
    step: "03",
    icon: Rocket,
    title: "Ship to production",
    desc: "One-click deploy to your custom domain with HTTPS, rollbacks, and environment secrets baked in.",
  },
];

// ── Features ──────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Bot,
    title: "AI Pair Programmer",
    description: "GPT-4o and Claude write, debug, and refactor code alongside you. Select any code → Fix, Refactor, Explain, or Generate tests in one click.",
    tag: "Core",
  },
  {
    icon: Code2,
    title: "Full Browser IDE",
    description: "Monaco editor (same as VS Code) with syntax highlighting, IntelliSense, multi-file tabs, and Ctrl+S saving. No setup required.",
    tag: "Editor",
  },
  {
    icon: Terminal,
    title: "Live Terminal",
    description: "Run any language — Node.js, Python, Go, Rust, Java — directly in the browser. Real-time output via Socket.IO.",
    tag: "Runtime",
  },
  {
    icon: Layers,
    title: "Project Templates",
    description: "Start from production-ready templates: Next.js, Express API, Python FastAPI, Solidity, React, and more. Fully customisable.",
    tag: "Templates",
  },
  {
    icon: GitBranch,
    title: "GitHub Integration",
    description: "Link any existing repo or create a new one. Push, pull, and sync branches directly from the workspace — no CLI needed.",
    tag: "Git",
  },
  {
    icon: Shield,
    title: "Secure Sandboxes",
    description: "Every workspace is isolated with resource quotas and secret management. API keys stay encrypted, never exposed in logs.",
    tag: "Security",
  },
  {
    icon: Globe,
    title: "One-Click Deploy",
    description: "Deploy to production with automatic HTTPS, custom domains, and zero-downtime rollbacks. Powered by Vercel and Netlify.",
    tag: "Deploy",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Shared workspaces, role-based access, and real-time editing. Invite teammates and collaborate on the same project.",
    tag: "Teams",
  },
  {
    icon: BarChart3,
    title: "Usage Analytics",
    description: "Track AI usage, deployment history, run logs, and project activity — all from a single dashboard.",
    tag: "Insights",
  },
];

// ── AI Actions showcase ───────────────────────────────────────────────────────
const AI_ACTIONS = [
  { icon: Wrench,       label: "Fix errors",        desc: "Select broken code → AI diagnoses and patches in seconds" },
  { icon: Sparkles,     label: "Refactor",           desc: "Clean up messy code without changing behaviour" },
  { icon: Cpu,          label: "Explain code",       desc: "Get a plain-English explanation of any function or file" },
  { icon: FlaskConical, label: "Generate tests",     desc: "Unit and integration tests written automatically" },
];

// ── Pricing ───────────────────────────────────────────────────────────────────
const PLANS = [
  {
    name: "Free",
    price: "Free",
    description: "Perfect for personal projects",
    features: ["3 projects", "512 MB workspace", "50 AI messages/day", "Community support", "1 deployment/month"],
    cta: "Get started",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$20",
    description: "For serious developers",
    features: ["Unlimited projects", "4 GB workspace", "Unlimited AI messages", "AI Code Actions", "Unlimited deployments", "Custom domains", "Priority support"],
    highlighted: true,
    cta: "Start free trial",
  },
  {
    name: "Team",
    price: "Custom",
    description: "For teams and organisations",
    features: ["Everything in Pro", "Team workspaces", "RBAC & SSO", "Audit logs", "SLA guarantee", "Dedicated support"],
    cta: "Contact sales",
    highlighted: false,
  },
];

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b border-border/40 bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary-foreground" />
            </div>
            <span>OrahAI</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How it works</a>
            <a href="#features"     className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing"      className="hover:text-foreground transition-colors">Pricing</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">
                Get started free <ArrowRight className="ml-1.5 w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32 grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-8 border border-primary/20">
              <Sparkles className="w-3.5 h-3.5" />
              The AI Software Factory
            </div>

            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6 leading-[1.1]">
              Build. Ship. Scale.{" "}
              <span className="text-primary">With AI.</span>
            </h1>

            <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
              OrahAI is a browser IDE where AI writes, debugs, and deploys your code.
              Describe what you want — your app is ready in minutes, not days.
            </p>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8">
              <Link href="/register">
                <Button size="lg" className="px-8 h-12 text-base">
                  Start building for free
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
              </Link>
              <a href="#how-it-works">
                <Button variant="outline" size="lg" className="px-8 h-12 text-base">
                  <Play className="mr-2 w-4 h-4" />
                  See how it works
                </Button>
              </a>
            </div>

            <p className="text-sm text-muted-foreground">No credit card required · Free tier available</p>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-8">
              {["GPT-4o", "Claude 3.5", "Node.js", "Python", "Solidity"].map((tag) => (
                <span key={tag} className="text-xs text-muted-foreground bg-muted/50 border border-border rounded px-2 py-1 font-mono">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="lg:pl-8">
            <TerminalMockup />
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <div className="border-y border-border/40 bg-muted/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map(({ value, label }) => (
            <div key={label} className="text-center">
              <div className="text-3xl font-bold text-primary">{value}</div>
              <div className="text-sm text-muted-foreground mt-1">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <section id="how-it-works" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              From idea to deployed in minutes
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              No setup. No config. No DevOps. Just describe what you want to build.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="relative p-8 rounded-2xl border bg-card group hover:border-primary/40 transition-colors">
                <div className="absolute -top-3 left-6 text-xs font-bold text-primary/50 font-mono tracking-widest">{step}</div>
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5 group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-3">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Code Actions spotlight */}
      <section className="py-24 bg-muted/20 border-y border-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-3 py-1 text-xs font-semibold mb-6 border border-primary/20">
                <Sparkles className="w-3 h-3" /> AI Code Actions
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-5">
                AI that acts on your code,<br />not just talks about it
              </h2>
              <p className="text-muted-foreground mb-8 leading-relaxed">
                Select any code in the editor and trigger an AI action with one click.
                The AI reads the context, makes the change, and writes it back to the file —
                no copy-pasting required.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {AI_ACTIONS.map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="flex items-start gap-3 p-4 rounded-xl border bg-card hover:border-primary/40 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-border/50 bg-[#0d1117] overflow-hidden shadow-xl">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border/30 bg-[#161b22]">
                <div className="w-3 h-3 rounded-full bg-red-500/70" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                <div className="w-3 h-3 rounded-full bg-green-500/70" />
                <span className="ml-2 text-xs text-muted-foreground font-mono">auth.ts — OrahAI Editor</span>
              </div>
              {/* Editor mockup */}
              <div className="p-5 font-mono text-xs space-y-1 text-slate-400">
                <div><span className="text-purple-400">async function</span> <span className="text-sky-400">login</span><span>(email: string, password: string) {"{"}</span></div>
                <div className="pl-4"><span className="text-purple-400">const</span> user = <span className="text-sky-400">await</span> db.findUser(email);</div>
                <div className="pl-4 bg-primary/10 rounded px-2 py-0.5 border-l-2 border-primary/60">
                  <span className="text-amber-400">// ⚠️ password compared without hashing</span>
                </div>
                <div className="pl-4"><span className="text-purple-400">if</span> (user.password !== password) <span className="text-purple-400">return null</span>;</div>
                <div className="pl-4"><span className="text-purple-400">return</span> generateJWT(user.id);</div>
                <div>{"}"}</div>
              </div>
              <div className="border-t border-border/30 px-5 py-3 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">AI Actions:</span>
                {["✨ Fix", "🔧 Refactor", "💡 Explain", "🧪 Tests"].map((a) => (
                  <span key={a} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary font-medium cursor-pointer hover:bg-primary/20 transition-colors">
                    {a}
                  </span>
                ))}
              </div>
              <div className="border-t border-border/30 px-5 py-3 bg-[#161b22]">
                <div className="flex items-start gap-2">
                  <Bot className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-400 font-mono">
                    Fixed: now uses bcrypt.compare() — password never compared in plaintext. ✓
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Everything you need to build
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              From idea to deployed product — OrahAI handles the entire development workflow.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, description, tag }) => (
              <div key={title} className="group p-6 rounded-xl border bg-card hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-[10px] font-semibold text-muted-foreground bg-muted/60 border border-border rounded px-2 py-0.5 uppercase tracking-wide">
                    {tag}
                  </span>
                </div>
                <h3 className="font-semibold text-base mb-2">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Vision banner */}
      <section className="py-24 bg-primary/5 border-y border-primary/10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-6 leading-tight">
            The future of software is<br />
            <span className="text-primary">AI-native from day one.</span>
          </h2>
          <p className="text-lg text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            OrahAI is building toward a world where AI agents write the code, fix the bugs, run the tests,
            and deploy the product — while you focus on the direction. Not just an IDE. An AI Software Factory.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {[
              { icon: Cpu, label: "Autonomous Dev" },
              { icon: Wrench, label: "Self-Healing Code" },
              { icon: Rocket, label: "Universal Deploy" },
              { icon: Users, label: "AI-Native Teams" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-2 p-4 rounded-xl bg-background/60 border border-border/60">
                <Icon className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/register">
              <Button size="lg" className="px-10 h-12 text-base">
                Join the future <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
            <Link href="/vision">
              <Button size="lg" variant="outline" className="px-10 h-12 text-base">
                See the roadmap
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Simple pricing</h2>
            <p className="text-muted-foreground text-lg">Start free, scale as you grow.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {PLANS.map((plan) => (
              <PricingCard key={plan.name} {...plan} />
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 border-t border-border/40">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-5">
            Ready to build something great?
          </h2>
          <p className="text-muted-foreground text-lg mb-8">
            Join thousands of developers using OrahAI to ship faster.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="px-10 h-12 text-base">
                Start for free <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" className="px-10 h-12 text-base">
                Sign in
              </Button>
            </Link>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            No credit card required · Free tier always available
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
            <div className="col-span-2 md:col-span-1">
              <Link href="/" className="flex items-center gap-2 font-bold mb-3">
                <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                  <Bot className="w-4 h-4 text-primary-foreground" />
                </div>
                OrahAI
              </Link>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The AI Software Factory. Build, ship, and scale with AI.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Product</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a></li>
                <li><a href="#how-it-works" className="hover:text-foreground transition-colors">How it works</a></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Company</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/about"   className="hover:text-foreground transition-colors">About</Link></li>
                <li><Link href="/blog"    className="hover:text-foreground transition-colors">Blog</Link></li>
                <li><Link href="/careers" className="hover:text-foreground transition-colors">Careers</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Legal</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link></li>
                <li><Link href="/terms"   className="hover:text-foreground transition-colors">Terms</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} OrahAI. All rights reserved.
            </p>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              All systems operational
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function PricingCard({ name, price, description, features, highlighted, cta }: {
  name: string; price: string; description: string; features: string[]; highlighted?: boolean; cta: string;
}) {
  return (
    <div className={`relative p-8 rounded-2xl border transition-all ${
      highlighted
        ? "border-primary bg-primary/5 shadow-xl shadow-primary/10 ring-1 ring-primary/20"
        : "bg-card hover:border-primary/30 hover:shadow-md"
    }`}>
      {highlighted && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold text-primary-foreground bg-primary rounded-full px-3 py-1 uppercase tracking-wider">
          Most Popular
        </div>
      )}
      <h3 className="text-xl font-bold mb-1">{name}</h3>
      <p className="text-3xl font-bold mb-1">
        {price}
        {price !== "Free" && price !== "Custom" && (
          <span className="text-base font-normal text-muted-foreground">/mo</span>
        )}
      </p>
      <p className="text-sm text-muted-foreground mb-6">{description}</p>
      <Link href="/register">
        <Button className="w-full" variant={highlighted ? "default" : "outline"}>{cta}</Button>
      </Link>
      <ul className="mt-6 space-y-3">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2.5 text-sm">
            <CheckCircle className="w-4 h-4 text-primary shrink-0" />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

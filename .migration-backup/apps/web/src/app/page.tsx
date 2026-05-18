import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ArrowRight, Bot, Code2, Rocket, Shield, Zap, Globe } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* ── Nav ─────────────────────────────────────────────────────────────── */}
      <nav className="border-b border-border/40 bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Bot className="w-5 h-5 text-primary-foreground" />
            </div>
            <span>OrahAI</span>
          </Link>

          <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <Link href="#features" className="hover:text-foreground transition-colors">Features</Link>
            <Link href="#pricing" className="hover:text-foreground transition-colors">Pricing</Link>
            <Link href="/docs" className="hover:text-foreground transition-colors">Docs</Link>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">
                Get started free
                <ArrowRight className="ml-1.5 w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-4 py-24 sm:py-36">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary rounded-full px-4 py-1.5 text-sm font-medium mb-8">
            <Zap className="w-3.5 h-3.5" />
            Powered by GPT-4o & Claude
          </div>

          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight mb-6 leading-tight">
            Build software{" "}
            <span className="text-primary">10× faster</span>{" "}
            with AI
          </h1>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            OrahAI is a browser-based IDE with a built-in AI pair programmer.
            Write, run, debug, and deploy code — all in one place, all AI-assisted.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="px-8 h-12 text-base">
                Start building for free
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button variant="outline" size="lg" className="px-8 h-12 text-base">
                View demo
              </Button>
            </Link>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            No credit card required · Free tier available
          </p>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Everything you need to build
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              From idea to deployed product — OrahAI handles the entire development workflow.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {FEATURES.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
              Simple pricing
            </h2>
            <p className="text-muted-foreground text-lg">
              Start free, scale as you grow.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {PLANS.map((plan) => (
              <PricingCard key={plan.name} {...plan} />
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2 font-bold">
              <Bot className="w-5 h-5 text-primary" />
              OrahAI
            </Link>
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} OrahAI. All rights reserved.
            </p>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
              <Link href="/terms" className="hover:text-foreground">Terms</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 rounded-xl border bg-card hover:shadow-md transition-shadow">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function PricingCard({
  name,
  price,
  description,
  features,
  highlighted,
  cta,
}: {
  name: string;
  price: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  cta: string;
}) {
  return (
    <div
      className={`p-8 rounded-xl border ${
        highlighted
          ? "border-primary bg-primary/5 shadow-lg shadow-primary/10 ring-1 ring-primary/20"
          : "bg-card"
      }`}
    >
      {highlighted && (
        <div className="text-xs font-semibold text-primary uppercase tracking-wider mb-4">
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
        <Button
          className="w-full"
          variant={highlighted ? "default" : "outline"}
        >
          {cta}
        </Button>
      </Link>
      <ul className="mt-6 space-y-3">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm">
            <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

const FEATURES = [
  {
    icon: Bot,
    title: "AI Pair Programmer",
    description:
      "Chat with GPT-4o or Claude directly in your editor. Get code suggestions, debug errors, and refactor with a single prompt.",
  },
  {
    icon: Code2,
    title: "Browser IDE",
    description:
      "Full VS Code-like editor experience in your browser. Syntax highlighting, IntelliSense, file tree, and terminal included.",
  },
  {
    icon: Zap,
    title: "Instant Workspaces",
    description:
      "Spin up a full development environment in seconds. Run any language — Python, Node.js, Go, Rust, and more.",
  },
  {
    icon: Rocket,
    title: "One-Click Deploy",
    description:
      "Deploy to production with a single click. Automatic HTTPS, custom domains, and rollback support built in.",
  },
  {
    icon: Shield,
    title: "Secure Sandboxes",
    description:
      "Every workspace runs in an isolated container with resource quotas. Your code and data are always protected.",
  },
  {
    icon: Globe,
    title: "Team Collaboration",
    description:
      "Invite teammates, share projects, and collaborate in real-time. Organization management and role-based access included.",
  },
];

const PLANS = [
  {
    name: "Free",
    price: "Free",
    description: "Perfect for personal projects",
    features: [
      "3 projects",
      "512 MB workspace memory",
      "50 AI messages/day",
      "Community support",
      "1 deployment/month",
    ],
    cta: "Get started",
  },
  {
    name: "Pro",
    price: "$20",
    description: "For serious developers",
    features: [
      "Unlimited projects",
      "4 GB workspace memory",
      "Unlimited AI messages",
      "Priority support",
      "Unlimited deployments",
      "Custom domains",
    ],
    highlighted: true,
    cta: "Start free trial",
  },
  {
    name: "Team",
    price: "Custom",
    description: "For teams and organizations",
    features: [
      "Everything in Pro",
      "Team collaboration",
      "RBAC & SSO",
      "Audit logs",
      "SLA guarantee",
      "Dedicated support",
    ],
    cta: "Contact sales",
  },
];

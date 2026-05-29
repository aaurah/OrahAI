import { useState } from "react";
import { useLocation } from "wouter";
import { Sparkles, Search, ArrowRight, Loader2 } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { toast } from "@/hooks/useToast";
import type { ApiResponse } from "@/types";

interface Template {
  id: string;
  emoji: string;
  name: string;
  description: string;
  language: string;
  category: string;
  tags: string[];
  prompt: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
}

const TEMPLATES: Template[] = [
  // ── Web ──────────────────────────────────────────────────────────────────────
  {
    id: "react-vite",
    emoji: "⚛️", name: "React + Vite",
    description: "Modern React app with Vite, TypeScript, Tailwind CSS, and React Router. Perfect starting point for SPAs.",
    language: "typescript", category: "web",
    tags: ["React", "Vite", "TypeScript", "Tailwind"],
    difficulty: "Beginner",
    prompt: "Build a complete React app with Vite, TypeScript, Tailwind CSS, and React Router. Include a home page, about page, navigation, and reusable UI components.",
  },
  {
    id: "nextjs",
    emoji: "▲", name: "Next.js App",
    description: "Full-stack Next.js 14 app with App Router, TypeScript, Tailwind, server components, and API routes.",
    language: "typescript", category: "web",
    tags: ["Next.js", "TypeScript", "Full-stack"],
    difficulty: "Intermediate",
    prompt: "Build a Next.js 14 app with TypeScript, Tailwind CSS, App Router, server components, and API routes. Include a home page, navigation, and a data fetching example.",
  },
  {
    id: "vue-app",
    emoji: "💚", name: "Vue 3 App",
    description: "Vue 3 app with Vite, TypeScript, Pinia state management, and Vue Router.",
    language: "typescript", category: "web",
    tags: ["Vue", "Pinia", "TypeScript"],
    difficulty: "Beginner",
    prompt: "Build a Vue 3 app with Vite, TypeScript, Pinia for state management, and Vue Router. Include components, a store, and routing between pages.",
  },
  {
    id: "svelte",
    emoji: "🔥", name: "SvelteKit",
    description: "SvelteKit full-stack app with routing, load functions, form actions, and TypeScript.",
    language: "typescript", category: "web",
    tags: ["Svelte", "SvelteKit", "Full-stack"],
    difficulty: "Intermediate",
    prompt: "Build a SvelteKit app with TypeScript, routing, server-side load functions, form actions, and a simple data store.",
  },
  {
    id: "portfolio",
    emoji: "🎨", name: "Portfolio Site",
    description: "Personal developer portfolio with projects, skills, blog, and contact form.",
    language: "html", category: "web",
    tags: ["Portfolio", "HTML", "CSS"],
    difficulty: "Beginner",
    prompt: "Build a beautiful personal developer portfolio website with a hero section, about me, skills, projects grid, blog, and contact form. Use modern CSS with animations.",
  },
  {
    id: "todo-app",
    emoji: "✅", name: "Todo App",
    description: "Full-featured todo app with drag-and-drop, filtering, local persistence, and dark mode.",
    language: "typescript", category: "web",
    tags: ["React", "DnD", "TypeScript"],
    difficulty: "Beginner",
    prompt: "Build a full-featured todo list app with React and TypeScript. Support drag-and-drop reordering, priority levels, due dates, filtering, and localStorage persistence.",
  },
  {
    id: "chat-app",
    emoji: "💬", name: "Real-time Chat",
    description: "Real-time chat app with Socket.IO, Express, React, and multiple rooms.",
    language: "nodejs", category: "web",
    tags: ["Socket.IO", "Real-time", "React"],
    difficulty: "Intermediate",
    prompt: "Build a real-time chat app with Socket.IO, Express backend, and React frontend. Support multiple rooms, online users list, and message history.",
  },
  {
    id: "dashboard",
    emoji: "📊", name: "Analytics Dashboard",
    description: "Beautiful data dashboard with charts, tables, KPI cards, and real-time updates.",
    language: "typescript", category: "web",
    tags: ["Dashboard", "Charts", "React"],
    difficulty: "Intermediate",
    prompt: "Build a beautiful analytics dashboard with React and Recharts. Include KPI cards, bar charts, line charts, data tables, date range filters, and mock data.",
  },
  {
    id: "ecommerce",
    emoji: "🛒", name: "E-commerce Store",
    description: "Full e-commerce store with product listing, cart, checkout, and order management.",
    language: "typescript", category: "web",
    tags: ["E-commerce", "React", "Full-stack"],
    difficulty: "Advanced",
    prompt: "Build a full e-commerce store with React frontend and Node.js backend. Include product listing, search, filters, shopping cart, checkout flow, and order management.",
  },
  {
    id: "rest-client",
    emoji: "🔌", name: "REST API Client",
    description: "API testing tool like Postman — request builder, collections, history, and response viewer.",
    language: "typescript", category: "web",
    tags: ["API", "Testing", "Tool"],
    difficulty: "Intermediate",
    prompt: "Build a REST API client tool like a simplified Postman. Include request builder with method/URL/headers/body, collections, request history, and formatted response viewer.",
  },
  // ── Backend ───────────────────────────────────────────────────────────────────
  {
    id: "express-api",
    emoji: "⚡", name: "Express REST API",
    description: "Production-ready Express API with TypeScript, JWT auth, PostgreSQL, Zod validation, and full CRUD.",
    language: "nodejs", category: "backend",
    tags: ["Express", "Node.js", "REST", "JWT"],
    difficulty: "Intermediate",
    prompt: "Build a production-ready Express REST API with TypeScript, JWT authentication, PostgreSQL, Zod input validation, error handling middleware, and CRUD endpoints for a resource.",
  },
  {
    id: "fastapi",
    emoji: "🐍", name: "FastAPI",
    description: "Python FastAPI backend with Pydantic, SQLAlchemy, JWT auth, and auto-generated OpenAPI docs.",
    language: "python", category: "backend",
    tags: ["Python", "FastAPI", "OpenAPI"],
    difficulty: "Intermediate",
    prompt: "Build a Python FastAPI backend with Pydantic models, SQLAlchemy ORM, JWT auth, automatic OpenAPI docs, and CRUD endpoints for a resource.",
  },
  {
    id: "django",
    emoji: "🟢", name: "Django App",
    description: "Full-stack Django web app with models, views, templates, user auth, and admin panel.",
    language: "python", category: "backend",
    tags: ["Python", "Django", "Full-stack"],
    difficulty: "Intermediate",
    prompt: "Build a full-stack Django web app with models, views, templates, user authentication, and Django admin. Include a home page, user dashboard, and CRUD operations.",
  },
  {
    id: "graphql-api",
    emoji: "🔗", name: "GraphQL API",
    description: "Apollo Server GraphQL API with Node.js, TypeScript, resolvers, mutations, and subscriptions.",
    language: "typescript", category: "backend",
    tags: ["GraphQL", "Apollo", "Node.js"],
    difficulty: "Advanced",
    prompt: "Build a GraphQL API with Apollo Server, Node.js, and TypeScript. Include queries, mutations, and subscriptions. Add a simple schema for a blog with posts and comments.",
  },
  {
    id: "go-api",
    emoji: "🐹", name: "Go REST API",
    description: "Fast Go API with Gin framework, PostgreSQL, JWT auth, middleware, and structured logging.",
    language: "go", category: "backend",
    tags: ["Go", "Gin", "REST", "PostgreSQL"],
    difficulty: "Intermediate",
    prompt: "Build a Go REST API with the Gin framework, PostgreSQL database, JWT authentication middleware, structured logging, and CRUD endpoints. Include proper error handling and request validation.",
  },
  {
    id: "rust-api",
    emoji: "🦀", name: "Rust Web Server",
    description: "High-performance Rust API with Axum, Tokio async, PostgreSQL via SQLx, and type-safe handlers.",
    language: "rust", category: "backend",
    tags: ["Rust", "Axum", "Async", "SQLx"],
    difficulty: "Advanced",
    prompt: "Build a Rust web API with Axum, Tokio async runtime, SQLx for PostgreSQL, JWT auth, and type-safe request/response handlers. Include proper error types and middleware.",
  },
  {
    id: "java-spring",
    emoji: "☕", name: "Spring Boot API",
    description: "Java Spring Boot REST API with JPA, Hibernate, Spring Security, and MySQL.",
    language: "java", category: "backend",
    tags: ["Java", "Spring Boot", "JPA", "REST"],
    difficulty: "Intermediate",
    prompt: "Build a Spring Boot REST API with Java, Spring Data JPA, Hibernate, Spring Security with JWT, MySQL database, and full CRUD endpoints. Include validation and global exception handling.",
  },
  {
    id: "discord-bot",
    emoji: "🤖", name: "Discord Bot",
    description: "Discord bot with slash commands, embed messages, roles management, and event listeners.",
    language: "nodejs", category: "backend",
    tags: ["Discord", "Bot", "Node.js"],
    difficulty: "Intermediate",
    prompt: "Build a Discord bot with discord.js, slash commands, embed messages, role management, and event listeners for messages and reactions.",
  },
  {
    id: "telegram-bot",
    emoji: "✈️", name: "Telegram Bot",
    description: "Telegram bot with Python-telegram-bot, commands, inline keyboards, and webhook support.",
    language: "python", category: "backend",
    tags: ["Telegram", "Bot", "Python"],
    difficulty: "Beginner",
    prompt: "Build a Telegram bot with Python using python-telegram-bot library. Support commands, inline keyboards, callback queries, and conversation handlers. Add webhook support for production.",
  },
  {
    id: "cli-tool",
    emoji: "🖥️", name: "CLI Tool",
    description: "Node.js command-line tool with argument parsing, interactive prompts, and rich terminal output.",
    language: "nodejs", category: "backend",
    tags: ["CLI", "Node.js", "Terminal"],
    difficulty: "Beginner",
    prompt: "Build a Node.js CLI tool with TypeScript, Commander.js for argument parsing, Inquirer.js for interactive prompts, chalk for colored output, and ora for spinners. Include a practical utility feature.",
  },
  // ── AI ────────────────────────────────────────────────────────────────────────
  {
    id: "ai-chatbot",
    emoji: "🧠", name: "AI Chatbot",
    description: "LLM-powered chatbot with streaming responses, conversation history, and system prompts.",
    language: "typescript", category: "ai",
    tags: ["AI", "OpenAI", "Streaming"],
    difficulty: "Intermediate",
    prompt: "Build an AI chatbot with React frontend and Node.js backend. Use OpenAI API for streaming chat completions. Support conversation history, system prompts, and model selection.",
  },
  {
    id: "image-gen",
    emoji: "🖼️", name: "AI Image Generator",
    description: "Image generation app using DALL-E or Stable Diffusion with prompt history and gallery.",
    language: "typescript", category: "ai",
    tags: ["AI", "Images", "DALL-E"],
    difficulty: "Beginner",
    prompt: "Build an AI image generation app using OpenAI's DALL-E API. Include a prompt input, style options, image gallery with download, and generation history.",
  },
  {
    id: "rag-app",
    emoji: "📚", name: "RAG App",
    description: "Retrieval-augmented generation app — upload documents and chat with them using embeddings and vector search.",
    language: "typescript", category: "ai",
    tags: ["RAG", "Embeddings", "AI", "Pinecone"],
    difficulty: "Advanced",
    prompt: "Build a RAG (Retrieval-Augmented Generation) app. Allow users to upload PDF/text documents, generate embeddings with OpenAI, store them in a vector store, and chat with the documents using context-injected prompts.",
  },
  {
    id: "ai-code-review",
    emoji: "🔍", name: "AI Code Reviewer",
    description: "Paste code and get AI-powered review: bugs, security issues, style improvements, and explanations.",
    language: "typescript", category: "ai",
    tags: ["AI", "Code Review", "React"],
    difficulty: "Intermediate",
    prompt: "Build an AI code review tool with React. Users paste code, select a language, and get a detailed AI review covering bugs, security issues, performance, and best practices. Support multiple programming languages.",
  },
  {
    id: "voice-assistant",
    emoji: "🎙️", name: "Voice Assistant",
    description: "Browser voice assistant using Web Speech API, OpenAI Whisper, and text-to-speech.",
    language: "typescript", category: "ai",
    tags: ["AI", "Voice", "Whisper", "TTS"],
    difficulty: "Intermediate",
    prompt: "Build a browser-based voice assistant. Use the Web Speech API for recording, OpenAI Whisper for transcription, GPT for responses, and text-to-speech for playback. Include a visual waveform and conversation history.",
  },
  {
    id: "data-science",
    emoji: "📈", name: "Data Science Notebook",
    description: "Python data analysis with Pandas, NumPy, Matplotlib, and an interactive Jupyter-style interface.",
    language: "python", category: "ai",
    tags: ["Python", "Pandas", "Matplotlib", "Data"],
    difficulty: "Beginner",
    prompt: "Build a Python data science project with Pandas for data manipulation, NumPy for numerical computing, Matplotlib and Seaborn for visualizations, and Scikit-learn for a basic ML model. Use a real-world dataset.",
  },
  // ── Mobile ───────────────────────────────────────────────────────────────────
  {
    id: "expo-app",
    emoji: "📱", name: "React Native App",
    description: "Cross-platform mobile app with Expo, React Native, navigation, and native device features.",
    language: "typescript", category: "mobile",
    tags: ["Expo", "React Native", "Mobile", "iOS/Android"],
    difficulty: "Beginner",
    prompt: "Build a React Native mobile app with Expo and TypeScript. Use Expo Router for navigation, NativeWind for styling, and include tabs, a list screen, a detail screen, and access to at least one native feature (camera or location).",
  },
  {
    id: "expo-ecommerce",
    emoji: "🛍️", name: "Mobile Shop",
    description: "Full mobile e-commerce app with Expo — product listing, cart, checkout, and auth.",
    language: "typescript", category: "mobile",
    tags: ["Expo", "E-commerce", "React Native"],
    difficulty: "Advanced",
    prompt: "Build a mobile e-commerce app with Expo and React Native. Include a product listing page, product detail, shopping cart, checkout flow, user login, and order history. Use AsyncStorage for cart persistence.",
  },
  {
    id: "expo-fitness",
    emoji: "🏃", name: "Fitness Tracker",
    description: "Mobile workout tracking app with Expo — log workouts, set goals, view charts, and track streaks.",
    language: "typescript", category: "mobile",
    tags: ["Expo", "Health", "Charts", "React Native"],
    difficulty: "Intermediate",
    prompt: "Build a mobile fitness tracker app with Expo and React Native. Allow users to log workouts, set fitness goals, view progress charts, track streaks, and get push notifications for reminders.",
  },
  // ── Game ─────────────────────────────────────────────────────────────────────
  {
    id: "browser-game",
    emoji: "🎮", name: "Browser Game",
    description: "2D HTML5 Canvas game with game loop, sprites, physics, score tracking, and levels.",
    language: "typescript", category: "game",
    tags: ["Game", "Canvas", "TypeScript"],
    difficulty: "Intermediate",
    prompt: "Build a fun 2D browser game using HTML5 Canvas and TypeScript. Include a game loop, sprite rendering, collision detection, player movement, enemy AI, score tracking, and multiple levels. Choose an engaging game genre (platformer, shooter, or puzzle).",
  },
  {
    id: "threejs-game",
    emoji: "🌐", name: "3D WebGL Game",
    description: "3D browser game or interactive scene with Three.js, physics, lighting, and player controls.",
    language: "typescript", category: "game",
    tags: ["Three.js", "3D", "WebGL", "Game"],
    difficulty: "Advanced",
    prompt: "Build a 3D browser game or interactive scene with Three.js and TypeScript. Include lighting, shadows, physics (Cannon.js or Rapier), player movement/camera controls, and interactive objects.",
  },
  {
    id: "pygame",
    emoji: "🎲", name: "Python Game",
    description: "2D desktop game with Pygame — sprites, sounds, collision, score system, and menus.",
    language: "python", category: "game",
    tags: ["Python", "Pygame", "2D", "Game"],
    difficulty: "Beginner",
    prompt: "Build a 2D game with Python and Pygame. Include a game loop, sprite classes, collision detection, background music and sound effects, a score system, main menu, and game-over screen.",
  },
  // ── Blockchain ───────────────────────────────────────────────────────────────
  {
    id: "smart-contract",
    emoji: "⟠", name: "Smart Contract",
    description: "Solidity smart contract with Hardhat, ERC-20 token, tests, and deployment scripts.",
    language: "solidity", category: "blockchain",
    tags: ["Solidity", "ERC-20", "Hardhat"],
    difficulty: "Advanced",
    prompt: "Build a Solidity smart contract with Hardhat. Include an ERC-20 token with minting, burning, and transfer functions. Add deployment scripts and comprehensive tests.",
  },
  {
    id: "nft-contract",
    emoji: "🖼️", name: "NFT Collection",
    description: "ERC-721 NFT smart contract with metadata, minting, royalties, and an OpenSea-compatible API.",
    language: "solidity", category: "blockchain",
    tags: ["NFT", "ERC-721", "Solidity", "Hardhat"],
    difficulty: "Advanced",
    prompt: "Build an ERC-721 NFT collection with Solidity and Hardhat. Include minting with whitelist/public phases, on-chain and IPFS metadata, royalties (ERC-2981), and reveal mechanics. Add a simple React minting UI.",
  },
  {
    id: "defi-app",
    emoji: "💰", name: "DeFi Protocol",
    description: "DeFi application with liquidity pools, token swapping, and yield farming smart contracts.",
    language: "solidity", category: "blockchain",
    tags: ["DeFi", "AMM", "Solidity", "Web3"],
    difficulty: "Advanced",
    prompt: "Build a DeFi protocol with Solidity. Include an AMM with liquidity pools and token swapping (Uniswap V2 style), yield farming with staking rewards, and a React/ethers.js frontend for interacting with the contracts.",
  },
  {
    id: "web3-dapp",
    emoji: "🔗", name: "Web3 dApp",
    description: "Full dApp with wallet connection (MetaMask/WalletConnect), ENS, on-chain reads, and transactions.",
    language: "web3", category: "blockchain",
    tags: ["Web3", "wagmi", "React", "MetaMask"],
    difficulty: "Intermediate",
    prompt: "Build a Web3 dApp with React, wagmi, viem, and RainbowKit. Include wallet connection (MetaMask & WalletConnect), chain switching, ENS name resolution, on-chain data reads, and transaction sending with status tracking.",
  },
];

const CATEGORIES = [
  { id: "all",        label: "All",        emoji: "✨" },
  { id: "web",        label: "Web",        emoji: "🌐" },
  { id: "backend",    label: "Backend",    emoji: "⚙️" },
  { id: "ai",         label: "AI",         emoji: "🧠" },
  { id: "mobile",     label: "Mobile",     emoji: "📱" },
  { id: "game",       label: "Game",       emoji: "🎮" },
  { id: "blockchain", label: "Blockchain", emoji: "⟠" },
];

const DIFFICULTY_COLORS = {
  Beginner:     "bg-green-500/10 text-green-600 dark:text-green-400",
  Intermediate: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  Advanced:     "bg-red-500/10 text-red-600 dark:text-red-400",
};

export default function TemplatesPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { workspaces } = useWorkspaces();
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState<string | null>(null);

  const filtered = TEMPLATES.filter(t => {
    const matchesCat = category === "all" || t.category === category;
    const matchesSearch = !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  const handleUse = async (template: Template) => {
    if (!user) { navigate("/login"); return; }
    const wsId = workspaces[0]?.id;
    if (!wsId) { toast({ title: "No workspace found", variant: "destructive" }); return; }

    setCreating(template.id);
    try {
      const res = await api.post<ApiResponse<{ id: string }>>("/api/projects", {
        workspaceId: wsId,
        name: template.name,
        description: template.description,
        language: template.language,
        isPublic: false,
        aiPrompt: template.prompt,
      });
      toast({ title: `Creating "${template.name}"…` });
      navigate(`/workspace/${res.data.id}`);
    } catch (err: unknown) {
      toast({ title: (err as Error).message ?? "Failed to create project", variant: "destructive" });
      setCreating(null);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <Navbar />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            {TEMPLATES.length} templates
          </div>
          <h1 className="text-3xl font-bold mb-2">Start from a template</h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Choose a template to jumpstart your project. Every template comes pre-configured and ready to run.
          </p>
        </div>

        {/* Search + Category filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="pl-9"
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {CATEGORIES.map(c => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  category === c.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{c.emoji}</span>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-muted-foreground gap-3">
            <Sparkles className="w-12 h-12 opacity-20" />
            <p className="text-sm">No templates match your search.</p>
            <Button variant="outline" onClick={() => { setSearch(""); setCategory("all"); }}>Clear filters</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(t => (
              <div
                key={t.id}
                className="flex flex-col rounded-xl border border-border bg-card hover:border-primary/30 hover:shadow-md transition-all group overflow-hidden"
              >
                <div className="flex-1 p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-xl shrink-0">
                        {t.emoji}
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">{t.name}</h3>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${DIFFICULTY_COLORS[t.difficulty]}`}>
                          {t.difficulty}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-3">{t.description}</p>

                  <div className="flex flex-wrap gap-1">
                    {t.tags.slice(0, 3).map(tag => (
                      <Badge key={tag} variant="secondary" className="text-[10px] h-4 px-1.5">{tag}</Badge>
                    ))}
                  </div>
                </div>

                <div className="px-5 pb-4">
                  <Button
                    size="sm"
                    className="w-full gap-2 group-hover:gap-3 transition-all"
                    onClick={() => handleUse(t)}
                    disabled={creating === t.id}
                  >
                    {creating === t.id ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" />Creating…</>
                    ) : (
                      <>Use template<ArrowRight className="w-3.5 h-3.5" /></>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function Slide04Demo() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0a0f" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 40% 60% at 20% 60%, rgba(124,58,237,0.1) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "6vh 8vw" }}>
        <div style={{ marginBottom: "3.5vh" }}>
          <span style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "#7c3aed", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            03 / Product Demo
          </span>
          <div style={{ fontFamily: "var(--font-display-family)", fontSize: "3.5vw", fontWeight: 700, color: "#f1f0ff", lineHeight: 1.15, letterSpacing: "-0.03em", marginTop: "1vh" }}>
            From prompt to live app
            <span style={{ color: "#a78bfa" }}> in under 3 minutes</span>
          </div>
        </div>

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: "3vw", alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2vh" }}>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.4vw", fontWeight: 600, color: "rgba(241,240,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              What you type
            </div>
            <div style={{ background: "rgba(19,18,31,0.9)", border: "1px solid rgba(124,58,237,0.25)", borderRadius: "1vw", padding: "2.5vh 2vw" }}>
              <div style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.35vw", color: "#a78bfa", lineHeight: 1.7 }}>
                "Build a REST API with JWT auth and PostgreSQL"
              </div>
            </div>

            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.4vw", fontWeight: 600, color: "rgba(241,240,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "1vh" }}>
              What happens
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.2vh" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1vw" }}>
                <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-body-family)", fontSize: "1.35vw", color: "rgba(241,240,255,0.7)" }}>AI writes 12 files across frontend + backend</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "1vw" }}>
                <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-body-family)", fontSize: "1.35vw", color: "rgba(241,240,255,0.7)" }}>Sets up routes, auth middleware, DB schema</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "1vw" }}>
                <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-body-family)", fontSize: "1.35vw", color: "rgba(241,240,255,0.7)" }}>Live preview loads in browser instantly</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "1vw" }}>
                <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#a78bfa", flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-body-family)", fontSize: "1.35vw", color: "rgba(241,240,255,0.7)" }}>One click deployed to your-app.orahai.app</span>
              </div>
            </div>
          </div>

          <div style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "1vw", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5vw", padding: "1.2vh 1.5vw", background: "#161b22", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ width: "0.8vw", height: "0.8vw", borderRadius: "50%", background: "#ff5f57" }} />
              <div style={{ width: "0.8vw", height: "0.8vw", borderRadius: "50%", background: "#febc2e" }} />
              <div style={{ width: "0.8vw", height: "0.8vw", borderRadius: "50%", background: "#28c840" }} />
              <span style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "rgba(255,255,255,0.35)", marginLeft: "0.8vw" }}>OrahAI Terminal</span>
            </div>
            <div style={{ padding: "2.5vh 2vw", fontFamily: "var(--font-mono-family)", fontSize: "1.25vw", lineHeight: 2 }}>
              <div style={{ color: "#7ee787" }}>$ orahai build --prompt "REST API with auth"</div>
              <div style={{ color: "#58a6ff" }}>&#x2713; Analysing prompt...</div>
              <div style={{ color: "#58a6ff" }}>&#x2713; Writing src/index.ts</div>
              <div style={{ color: "#58a6ff" }}>&#x2713; Writing src/auth/jwt.ts</div>
              <div style={{ color: "#58a6ff" }}>&#x2713; Writing src/routes/users.ts</div>
              <div style={{ color: "#58a6ff" }}>&#x2713; Writing src/db/schema.ts</div>
              <div style={{ color: "#58a6ff" }}>&#x2713; Writing docker-compose.yml</div>
              <div style={{ color: "#a78bfa" }}>&#x1F680; Deployed to https://my-api.orahai.app</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

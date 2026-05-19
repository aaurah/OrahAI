export default function Slide10Roadmap() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0a0f" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 40% at 50% 100%, rgba(124,58,237,0.08) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "6.5vh 8vw" }}>
        <div style={{ marginBottom: "4vh" }}>
          <span style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "#7c3aed", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            09 / Roadmap
          </span>
          <div style={{ fontFamily: "var(--font-display-family)", fontSize: "3.8vw", fontWeight: 700, color: "#f1f0ff", lineHeight: 1.1, letterSpacing: "-0.03em", marginTop: "1vh" }}>
            Building the
            <span style={{ color: "#a78bfa" }}> factory — quarter by quarter</span>
          </div>
        </div>

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "2vw", alignItems: "stretch" }}>
          <div style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.4)", borderRadius: "1vw", padding: "3vh 2vw", display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "#a78bfa", marginBottom: "0.8vh", letterSpacing: "0.08em" }}>Q3 2025</div>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.6vw", fontWeight: 700, color: "#f1f0ff", marginBottom: "2vh" }}>Foundation</div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1.2vh" }}>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.75)", lineHeight: 1.4 }}>AI Debugger</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.75)", lineHeight: 1.4 }}>Team Collaboration</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.75)", lineHeight: 1.4 }}>Vercel / Netlify deploy</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.75)", lineHeight: 1.4 }}>Vision / Roadmap page</div>
            </div>
          </div>

          <div style={{ background: "rgba(19,18,31,0.7)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "1vw", padding: "3vh 2vw", display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "rgba(241,240,255,0.4)", marginBottom: "0.8vh", letterSpacing: "0.08em" }}>Q4 2025</div>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.6vw", fontWeight: 700, color: "#f1f0ff", marginBottom: "2vh" }}>Platform</div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1.2vh" }}>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.55)", lineHeight: 1.4 }}>AI Agents</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.55)", lineHeight: 1.4 }}>Plugin System</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.55)", lineHeight: 1.4 }}>Cloud Workspaces</div>
            </div>
          </div>

          <div style={{ background: "rgba(19,18,31,0.7)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "1vw", padding: "3vh 2vw", display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "rgba(241,240,255,0.4)", marginBottom: "0.8vh", letterSpacing: "0.08em" }}>Q1 2026</div>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.6vw", fontWeight: 700, color: "#f1f0ff", marginBottom: "2vh" }}>Scale</div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1.2vh" }}>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.55)", lineHeight: 1.4 }}>Self-healing code</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.55)", lineHeight: 1.4 }}>Universal deployment hub</div>
            </div>
          </div>

          <div style={{ background: "rgba(19,18,31,0.7)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "1vw", padding: "3vh 2vw", display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "rgba(241,240,255,0.4)", marginBottom: "0.8vh", letterSpacing: "0.08em" }}>Q2 2026</div>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.6vw", fontWeight: 700, color: "#f1f0ff", marginBottom: "2vh" }}>Enterprise</div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1.2vh" }}>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.55)", lineHeight: 1.4 }}>Sovereign infrastructure</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.55)", lineHeight: 1.4 }}>Audit trails + SSO</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.55)", lineHeight: 1.4 }}>Compliance</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

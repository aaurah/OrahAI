export default function Slide05Features() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0a0f" }}>
      <div className="absolute" style={{ top: 0, right: 0, width: "30vw", height: "40vh", background: "radial-gradient(ellipse at top right, rgba(124,58,237,0.1) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "6.5vh 8vw" }}>
        <div style={{ marginBottom: "4vh" }}>
          <span style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "#7c3aed", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            04 / Key Features
          </span>
          <div style={{ fontFamily: "var(--font-display-family)", fontSize: "3.8vw", fontWeight: 700, color: "#f1f0ff", lineHeight: 1.1, letterSpacing: "-0.03em", marginTop: "1vh" }}>
            A complete
            <span style={{ color: "#a78bfa" }}> development platform</span>
          </div>
        </div>

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2vh 2vw" }}>
          <div style={{ background: "rgba(19,18,31,0.7)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "1vw", padding: "2.5vh 2vw" }}>
            <div style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "#a78bfa", marginBottom: "1.2vh", letterSpacing: "0.06em" }}>AI CODE ACTIONS</div>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.5vw", fontWeight: 600, color: "#f1f0ff", marginBottom: "0.8vh" }}>Fix · Refactor · Explain · Test</div>
            <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.25vw", color: "rgba(241,240,255,0.5)", lineHeight: 1.5 }}>One-click AI actions on any selected code or full file</div>
          </div>

          <div style={{ background: "rgba(19,18,31,0.7)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "1vw", padding: "2.5vh 2vw" }}>
            <div style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "#a78bfa", marginBottom: "1.2vh", letterSpacing: "0.06em" }}>TEMPLATES</div>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.5vw", fontWeight: 600, color: "#f1f0ff", marginBottom: "0.8vh" }}>6 starter projects</div>
            <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.25vw", color: "rgba(241,240,255,0.5)", lineHeight: 1.5 }}>React, Next.js, Express, FastAPI, Solidity, Portfolio</div>
          </div>

          <div style={{ background: "rgba(19,18,31,0.7)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "1vw", padding: "2.5vh 2vw" }}>
            <div style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "#a78bfa", marginBottom: "1.2vh", letterSpacing: "0.06em" }}>LIVE PREVIEW</div>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.5vw", fontWeight: 600, color: "#f1f0ff", marginBottom: "0.8vh" }}>Instant browser preview</div>
            <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.25vw", color: "rgba(241,240,255,0.5)", lineHeight: 1.5 }}>iframe preview beside the editor, always in sync</div>
          </div>

          <div style={{ background: "rgba(19,18,31,0.7)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "1vw", padding: "2.5vh 2vw" }}>
            <div style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "#a78bfa", marginBottom: "1.2vh", letterSpacing: "0.06em" }}>EDITOR</div>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.5vw", fontWeight: 600, color: "#f1f0ff", marginBottom: "0.8vh" }}>Monaco-powered IDE</div>
            <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.25vw", color: "rgba(241,240,255,0.5)", lineHeight: 1.5 }}>Professional-grade editor — same engine as VS Code</div>
          </div>

          <div style={{ background: "rgba(19,18,31,0.7)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "1vw", padding: "2.5vh 2vw" }}>
            <div style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "#a78bfa", marginBottom: "1.2vh", letterSpacing: "0.06em" }}>GITHUB INTEGRATION</div>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.5vw", fontWeight: 600, color: "#f1f0ff", marginBottom: "0.8vh" }}>One-click deploy</div>
            <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.25vw", color: "rgba(241,240,255,0.5)", lineHeight: 1.5 }}>Push to GitHub Pages — live site in seconds</div>
          </div>

          <div style={{ background: "rgba(19,18,31,0.7)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "1vw", padding: "2.5vh 2vw" }}>
            <div style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "#a78bfa", marginBottom: "1.2vh", letterSpacing: "0.06em" }}>TERMINAL + RUNS</div>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.5vw", fontWeight: 600, color: "#f1f0ff", marginBottom: "0.8vh" }}>Execute and debug</div>
            <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.25vw", color: "rgba(241,240,255,0.5)", lineHeight: 1.5 }}>Run code, see output, debug inline with AI</div>
          </div>
        </div>
      </div>
    </div>
  );
}

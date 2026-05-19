export default function Slide03Solution() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0a0f" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 60% 50% at 80% 50%, rgba(124,58,237,0.12) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex" style={{ padding: "7vh 8vw", gap: "5vw" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <span style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "#7c3aed", letterSpacing: "0.12em", textTransform: "uppercase", display: "block", marginBottom: "2.5vh" }}>
            02 / Solution
          </span>
          <div style={{ fontFamily: "var(--font-display-family)", fontSize: "4.5vw", fontWeight: 700, color: "#f1f0ff", lineHeight: 1.1, letterSpacing: "-0.03em", textWrap: "balance" }}>
            OrahAI is the first
            <span style={{ display: "block", color: "#a78bfa" }}>AI Software</span>
            Factory
          </div>
          <p style={{ fontFamily: "var(--font-body-family)", fontSize: "1.7vw", color: "rgba(241,240,255,0.55)", lineHeight: 1.6, marginTop: "3vh", maxWidth: "38vw" }}>
            Describe what you want in plain English. AI writes the full codebase, runs it, and deploys it — in under 3 minutes.
          </p>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: "2vh" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5vw" }}>
            <div style={{ width: "2.8vw", height: "2.8vw", borderRadius: "0.8vw", background: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.35)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.2vw", color: "#a78bfa", fontWeight: 600 }}>1</span>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.7vw", fontWeight: 600, color: "#f1f0ff" }}>Describe in plain English</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.5)", marginTop: "0.5vh", lineHeight: 1.5 }}>Type what you want — AI understands intent, not just keywords</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5vw" }}>
            <div style={{ width: "2.8vw", height: "2.8vw", borderRadius: "0.8vw", background: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.35)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.2vw", color: "#a78bfa", fontWeight: 600 }}>2</span>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.7vw", fontWeight: 600, color: "#f1f0ff" }}>AI writes the full codebase</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.5)", marginTop: "0.5vh", lineHeight: 1.5 }}>Frontend, backend, config files, Docker — the complete stack</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5vw" }}>
            <div style={{ width: "2.8vw", height: "2.8vw", borderRadius: "0.8vw", background: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.35)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.2vw", color: "#a78bfa", fontWeight: 600 }}>3</span>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.7vw", fontWeight: 600, color: "#f1f0ff" }}>Live preview, instant deploy</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.5)", marginTop: "0.5vh", lineHeight: 1.5 }}>See your app running in the browser — deploy to GitHub Pages in one click</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5vw" }}>
            <div style={{ width: "2.8vw", height: "2.8vw", borderRadius: "0.8vw", background: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.35)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.2vw", color: "#a78bfa", fontWeight: 600 }}>4</span>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.7vw", fontWeight: 600, color: "#f1f0ff" }}>AI Code Actions</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.5)", marginTop: "0.5vh", lineHeight: 1.5 }}>Fix, Refactor, Explain, Generate Tests — on any code, in one click</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

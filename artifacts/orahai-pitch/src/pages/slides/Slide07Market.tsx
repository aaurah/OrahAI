export default function Slide07Market() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0a0f" }}>
      <div className="absolute" style={{ bottom: 0, left: 0, width: "40vw", height: "40vh", background: "radial-gradient(ellipse at bottom left, rgba(124,58,237,0.1) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "6.5vh 8vw" }}>
        <div style={{ marginBottom: "4vh" }}>
          <span style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "#7c3aed", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            06 / Market Opportunity
          </span>
          <div style={{ fontFamily: "var(--font-display-family)", fontSize: "3.8vw", fontWeight: 700, color: "#f1f0ff", lineHeight: 1.1, letterSpacing: "-0.03em", marginTop: "1vh" }}>
            A
            <span style={{ color: "#a78bfa" }}> $56B market</span> — and growing
          </div>
        </div>

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2.5vh 3vw" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2.5vh" }}>
            <div style={{ display: "flex", gap: "2vw", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: "var(--font-display-family)", fontSize: "4.5vw", fontWeight: 700, color: "#a78bfa", lineHeight: 1 }}>$56B</div>
                <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.35vw", color: "rgba(241,240,255,0.55)", marginTop: "0.8vh", lineHeight: 1.4 }}>Developer tools market by 2030 (from $26.8B in 2024)</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "2vw", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: "var(--font-display-family)", fontSize: "4.5vw", fontWeight: 700, color: "#a78bfa", lineHeight: 1 }}>38%</div>
                <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.35vw", color: "rgba(241,240,255,0.55)", marginTop: "0.8vh", lineHeight: 1.4 }}>CAGR for AI coding tools — the fastest-growing segment</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "2vw", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: "var(--font-display-family)", fontSize: "4.5vw", fontWeight: 700, color: "#a78bfa", lineHeight: 1 }}>27M</div>
                <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.35vw", color: "rgba(241,240,255,0.55)", marginTop: "0.8vh", lineHeight: 1.4 }}>Software developers worldwide — our immediate addressable market</div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "2vh" }}>
            <div style={{ background: "rgba(19,18,31,0.8)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "1vw", padding: "2.5vh 2vw" }}>
              <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.5vw", fontWeight: 600, color: "#f1f0ff", marginBottom: "0.8vh" }}>GitHub Copilot</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.5)", lineHeight: 1.5 }}>1.3M paid subscribers in year 1 — proving willingness to pay for AI dev tools</div>
            </div>

            <div style={{ background: "rgba(19,18,31,0.8)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "1vw", padding: "2.5vh 2vw" }}>
              <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.5vw", fontWeight: 600, color: "#f1f0ff", marginBottom: "0.8vh" }}>Replit</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.5)", lineHeight: 1.5 }}>$97.4M raised, 20M+ users — validating browser-native development</div>
            </div>

            <div style={{ background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.35)", borderRadius: "1vw", padding: "2.5vh 2vw" }}>
              <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.5vw", fontWeight: 600, color: "#a78bfa", marginBottom: "0.8vh" }}>OrahAI's real target</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.65)", lineHeight: 1.5 }}>The next 100M builders who aren't developers yet — they need a factory, not an editor</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

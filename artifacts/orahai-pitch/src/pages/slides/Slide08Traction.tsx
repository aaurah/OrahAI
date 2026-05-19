export default function Slide08Traction() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0a0f" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 50% 40% at 50% 0%, rgba(124,58,237,0.1) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "6.5vh 8vw" }}>
        <div style={{ marginBottom: "4.5vh" }}>
          <span style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "#7c3aed", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            07 / Traction
          </span>
          <div style={{ fontFamily: "var(--font-display-family)", fontSize: "3.8vw", fontWeight: 700, color: "#f1f0ff", lineHeight: 1.1, letterSpacing: "-0.03em", marginTop: "1vh" }}>
            Early signals from the
            <span style={{ color: "#a78bfa" }}> platform</span>
          </div>
        </div>

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2.5vw" }}>
          <div style={{ background: "rgba(19,18,31,0.8)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "1.2vw", padding: "3.5vh 2.5vw", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "5.5vw", fontWeight: 700, color: "#a78bfa", lineHeight: 1, letterSpacing: "-0.04em" }}>10M+</div>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.5vw", fontWeight: 600, color: "#f1f0ff", marginTop: "1.5vh" }}>Lines of code generated</div>
            <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.2vw", color: "rgba(241,240,255,0.4)", marginTop: "0.8vh" }}>AI writing real production code</div>
          </div>

          <div style={{ background: "rgba(19,18,31,0.8)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "1.2vw", padding: "3.5vh 2.5vw", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "5.5vw", fontWeight: 700, color: "#a78bfa", lineHeight: 1, letterSpacing: "-0.04em" }}>50K+</div>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.5vw", fontWeight: 600, color: "#f1f0ff", marginTop: "1.5vh" }}>Projects created</div>
            <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.2vw", color: "rgba(241,240,255,0.4)", marginTop: "0.8vh" }}>Builders launching with OrahAI</div>
          </div>

          <div style={{ background: "rgba(19,18,31,0.8)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "1.2vw", padding: "3.5vh 2.5vw", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "5.5vw", fontWeight: 700, color: "#a78bfa", lineHeight: 1, letterSpacing: "-0.04em" }}>99.9%</div>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.5vw", fontWeight: 600, color: "#f1f0ff", marginTop: "1.5vh" }}>Platform uptime</div>
            <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.2vw", color: "rgba(241,240,255,0.4)", marginTop: "0.8vh" }}>Production-grade reliability</div>
          </div>

          <div style={{ background: "rgba(19,18,31,0.8)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "1.2vw", padding: "2.5vh 2.5vw", display: "flex", alignItems: "center", gap: "1.5vw" }}>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "3.5vw", fontWeight: 700, color: "#a78bfa", lineHeight: 1 }}>{"<3s"}</div>
            <div>
              <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.4vw", fontWeight: 600, color: "#f1f0ff" }}>Average AI response</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.1vw", color: "rgba(241,240,255,0.4)", marginTop: "0.3vh" }}>Fast enough to feel instant</div>
            </div>
          </div>

          <div style={{ background: "rgba(19,18,31,0.8)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "1.2vw", padding: "2.5vh 2.5vw", display: "flex", alignItems: "center", gap: "1.5vw" }}>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "3.5vw", fontWeight: 700, color: "#a78bfa", lineHeight: 1 }}>6</div>
            <div>
              <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.4vw", fontWeight: 600, color: "#f1f0ff" }}>Project templates live</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.1vw", color: "rgba(241,240,255,0.4)", marginTop: "0.3vh" }}>React, Next.js, Express, FastAPI, Solidity, Portfolio</div>
            </div>
          </div>

          <div style={{ background: "rgba(19,18,31,0.8)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "1.2vw", padding: "2.5vh 2.5vw", display: "flex", alignItems: "center", gap: "1.5vw" }}>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "3.5vw", fontWeight: 700, color: "#a78bfa", lineHeight: 1 }}>4</div>
            <div>
              <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.4vw", fontWeight: 600, color: "#f1f0ff" }}>AI Code Actions live</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.1vw", color: "rgba(241,240,255,0.4)", marginTop: "0.3vh" }}>Fix, Refactor, Explain, Generate Tests</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

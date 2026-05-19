export default function Slide12WhyNow() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0a0f" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(124,58,237,0.12) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col justify-between" style={{ padding: "6vh 8vw" }}>
        <div>
          <span style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "#7c3aed", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            11 / Why Now. Why OrahAI.
          </span>
          <div style={{ fontFamily: "var(--font-display-family)", fontSize: "4vw", fontWeight: 700, color: "#f1f0ff", lineHeight: 1.1, letterSpacing: "-0.03em", marginTop: "1.5vh", textWrap: "balance" }}>
            The window is open —
            <span style={{ color: "#a78bfa" }}> and closing fast</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2.5vh 3vw" }}>
          <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
            <div style={{ width: "1px", background: "#7c3aed", alignSelf: "stretch", flexShrink: 0, minHeight: "6vh" }} />
            <div>
              <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.6vw", fontWeight: 600, color: "#f1f0ff", marginBottom: "0.8vh" }}>LLMs crossed the threshold</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.5)", lineHeight: 1.5 }}>GPT-4o can write production code. The AI capability bottleneck is gone.</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
            <div style={{ width: "1px", background: "#7c3aed", alignSelf: "stretch", flexShrink: 0, minHeight: "6vh" }} />
            <div>
              <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.6vw", fontWeight: 600, color: "#f1f0ff", marginBottom: "0.8vh" }}>Developers are already using AI</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.5)", lineHeight: 1.5 }}>But tools are fragmented. No single platform does build, preview, and deploy.</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
            <div style={{ width: "1px", background: "#7c3aed", alignSelf: "stretch", flexShrink: 0, minHeight: "6vh" }} />
            <div>
              <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.6vw", fontWeight: 600, color: "#f1f0ff", marginBottom: "0.8vh" }}>The next billion builders</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.5)", lineHeight: 1.5 }}>They are not developers. They need a factory, not an editor. No tool serves them.</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "1.5vw", alignItems: "flex-start" }}>
            <div style={{ width: "1px", background: "#7c3aed", alignSelf: "stretch", flexShrink: 0, minHeight: "6vh" }} />
            <div>
              <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.6vw", fontWeight: 600, color: "#f1f0ff", marginBottom: "0.8vh" }}>First-mover advantage available</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.3vw", color: "rgba(241,240,255,0.5)", lineHeight: 1.5 }}>Browser-native AI IDE category is still open. OrahAI is building it now.</div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "var(--font-display-family)", fontSize: "2.5vw", fontWeight: 700, color: "#f1f0ff", marginBottom: "1.5vh" }}>
            Join us in building the future of software.
          </div>
          <div style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.5vw", color: "#a78bfa" }}>
            hello@orahai.app
          </div>
        </div>
      </div>
    </div>
  );
}

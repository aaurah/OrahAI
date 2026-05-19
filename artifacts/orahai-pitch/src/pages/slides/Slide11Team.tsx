export default function Slide11Team() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0a0f" }}>
      <div className="absolute" style={{ top: 0, left: 0, right: 0, height: "40vh", background: "radial-gradient(ellipse 80% 100% at 50% 0%, rgba(124,58,237,0.08) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "6.5vh 8vw" }}>
        <div style={{ marginBottom: "4vh" }}>
          <span style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "#7c3aed", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            10 / Team
          </span>
          <div style={{ fontFamily: "var(--font-display-family)", fontSize: "3.8vw", fontWeight: 700, color: "#f1f0ff", lineHeight: 1.1, letterSpacing: "-0.03em", marginTop: "1vh" }}>
            Built by a
            <span style={{ color: "#a78bfa" }}> founder who ships</span>
          </div>
        </div>

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "3vw" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2.5vh" }}>
            <div style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: "1.2vw", padding: "3.5vh 3vw" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "1.5vw", marginBottom: "2vh" }}>
                <div style={{ width: "5vw", height: "5vw", borderRadius: "50%", background: "linear-gradient(135deg, #7c3aed, #a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontFamily: "var(--font-display-family)", fontSize: "2.2vw", fontWeight: 700, color: "#f1f0ff" }}>P</span>
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-display-family)", fontSize: "2vw", fontWeight: 700, color: "#f1f0ff" }}>Parminder</div>
                  <div style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "#a78bfa", marginTop: "0.3vh" }}>Founder &amp; CEO</div>
                </div>
              </div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.4vw", color: "rgba(241,240,255,0.6)", lineHeight: 1.6 }}>
                Vision: The AI Software Factory that replaces a 5-person dev team — and gives the next billion builders a professional-grade development environment.
              </div>
            </div>

            <div style={{ background: "rgba(19,18,31,0.7)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1vw", padding: "2.5vh 2.5vw" }}>
              <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.5vw", fontWeight: 600, color: "#f1f0ff", marginBottom: "1.5vh" }}>Advisors and investors welcome</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.35vw", color: "rgba(241,240,255,0.5)", lineHeight: 1.5 }}>
                We are actively building our advisory board and seeking seed investment. If you believe in the future of AI-native development, reach out.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "2vh" }}>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.5vw", fontWeight: 600, color: "rgba(241,240,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5vh" }}>
              We are hiring
            </div>

            <div style={{ background: "rgba(19,18,31,0.7)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1vw", padding: "2.2vh 2vw", display: "flex", alignItems: "flex-start", gap: "1.2vw" }}>
              <div style={{ width: "2.5vw", height: "2.5vw", borderRadius: "0.6vw", background: "rgba(124,58,237,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "0.2vh" }}>
                <svg viewBox="0 0 24 24" fill="none" style={{ width: "1.3vw", height: "1.3vw" }}>
                  <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z" stroke="#a78bfa" strokeWidth="1.5" />
                  <path d="M8 12h8M12 8v8" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.4vw", fontWeight: 600, color: "#f1f0ff" }}>AI / ML Engineer</div>
                <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.2vw", color: "rgba(241,240,255,0.45)", marginTop: "0.4vh" }}>LLM fine-tuning, agents, inference optimization</div>
              </div>
            </div>

            <div style={{ background: "rgba(19,18,31,0.7)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1vw", padding: "2.2vh 2vw", display: "flex", alignItems: "flex-start", gap: "1.2vw" }}>
              <div style={{ width: "2.5vw", height: "2.5vw", borderRadius: "0.6vw", background: "rgba(124,58,237,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "0.2vh" }}>
                <svg viewBox="0 0 24 24" fill="none" style={{ width: "1.3vw", height: "1.3vw" }}>
                  <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.4vw", fontWeight: 600, color: "#f1f0ff" }}>Full-Stack Engineer</div>
                <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.2vw", color: "rgba(241,240,255,0.45)", marginTop: "0.4vh" }}>React, Node.js, TypeScript, PostgreSQL</div>
              </div>
            </div>

            <div style={{ background: "rgba(19,18,31,0.7)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "1vw", padding: "2.2vh 2vw", display: "flex", alignItems: "flex-start", gap: "1.2vw" }}>
              <div style={{ width: "2.5vw", height: "2.5vw", borderRadius: "0.6vw", background: "rgba(124,58,237,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "0.2vh" }}>
                <svg viewBox="0 0 24 24" fill="none" style={{ width: "1.3vw", height: "1.3vw" }}>
                  <path d="M3 12a9 9 0 1018 0 9 9 0 00-18 0z" stroke="#a78bfa" strokeWidth="1.5" />
                  <path d="M12 8v4l3 3" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.4vw", fontWeight: 600, color: "#f1f0ff" }}>DevOps / Infrastructure</div>
                <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.2vw", color: "rgba(241,240,255,0.45)", marginTop: "0.4vh" }}>Kubernetes, multi-cloud, platform reliability</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

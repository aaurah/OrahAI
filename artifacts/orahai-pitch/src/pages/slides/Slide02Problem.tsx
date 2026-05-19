export default function Slide02Problem() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0a0f" }}>
      <div className="absolute" style={{ top: 0, right: 0, width: "35vw", height: "100vh", background: "linear-gradient(135deg, transparent 0%, rgba(124,58,237,0.06) 100%)" }} />
      <div className="absolute" style={{ top: "8vh", right: "6vw", width: "18vw", height: "18vw", borderRadius: "50%", background: "radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "7vh 8vw" }}>
        <div style={{ marginBottom: "5vh" }}>
          <span style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "#7c3aed", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            01 / Problem
          </span>
          <div style={{ fontFamily: "var(--font-display-family)", fontSize: "4.2vw", fontWeight: 700, color: "#f1f0ff", lineHeight: 1.15, letterSpacing: "-0.03em", marginTop: "1.5vh", textWrap: "balance" }}>
            Software development is
            <span style={{ color: "#a78bfa" }}> broken</span>
          </div>
        </div>

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2.5vh 3vw" }}>
          <div style={{ background: "rgba(19,18,31,0.8)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "1.2vw", padding: "3vh 2.5vw" }}>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "3.8vw", fontWeight: 700, color: "#7c3aed", lineHeight: 1 }}>60%</div>
            <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.5vw", color: "rgba(241,240,255,0.7)", marginTop: "1vh", lineHeight: 1.4 }}>
              of dev time spent on boilerplate and debugging, not shipping features
            </div>
          </div>

          <div style={{ background: "rgba(19,18,31,0.8)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "1.2vw", padding: "3vh 2.5vw" }}>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "3.8vw", fontWeight: 700, color: "#7c3aed", lineHeight: 1 }}>3x</div>
            <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.5vw", color: "rgba(241,240,255,0.7)", marginTop: "1vh", lineHeight: 1.4 }}>
              longer than estimated — DevOps, CI/CD, deployment remain constant friction
            </div>
          </div>

          <div style={{ background: "rgba(19,18,31,0.8)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "1.2vw", padding: "3vh 2.5vw", gridColumn: "span 2" }}>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.8vw", fontWeight: 600, color: "#f1f0ff", lineHeight: 1.2, marginBottom: "1.5vh" }}>
              Most AI tools are assistants — not builders
            </div>
            <div style={{ display: "flex", gap: "2.5vw" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.4vw", color: "rgba(241,240,255,0.55)", lineHeight: 1.6 }}>
                  GitHub Copilot autocompletes lines. ChatGPT answers questions. Cursor helps you edit. None of them build your app end-to-end, deploy it, or debug it autonomously.
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.4vw", color: "rgba(241,240,255,0.55)", lineHeight: 1.6 }}>
                  Senior devs still waste hours on repetitive tasks. Junior devs are stuck in complexity. The next 100M builders are not developers at all — they have no tool built for them.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

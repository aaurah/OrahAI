const base = import.meta.env.BASE_URL;

export default function Slide06Vision() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0a0f" }}>
      <img
        src={`${base}vision-bg.png`}
        crossOrigin="anonymous"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: 0.3 }}
      />
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(10,10,15,0.9) 0%, rgba(10,10,15,0.7) 50%, rgba(124,58,237,0.1) 100%)" }} />

      <div className="absolute inset-0 flex flex-col justify-center" style={{ padding: "7vh 8vw" }}>
        <span style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "#7c3aed", letterSpacing: "0.12em", textTransform: "uppercase", display: "block", marginBottom: "2.5vh" }}>
          05 / The Vision
        </span>

        <div style={{ fontFamily: "var(--font-display-family)", fontSize: "2.2vw", fontWeight: 700, color: "rgba(241,240,255,0.45)", letterSpacing: "-0.02em", marginBottom: "0.5vh" }}>
          OrahAI =
        </div>
        <div style={{ fontFamily: "var(--font-display-family)", fontSize: "5.5vw", fontWeight: 700, color: "#f1f0ff", lineHeight: 1.05, letterSpacing: "-0.04em", marginBottom: "5vh", textWrap: "balance" }}>
          The Autonomous
          <span style={{ color: "#a78bfa" }}> Software Factory</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: "2vw" }}>
          <div style={{ borderTop: "2px solid #7c3aed", paddingTop: "2vh" }}>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.4vw", fontWeight: 700, color: "#f1f0ff", marginBottom: "1vh", lineHeight: 1.3 }}>Autonomous Development</div>
            <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.2vw", color: "rgba(241,240,255,0.45)", lineHeight: 1.5 }}>AI builds full apps from specs</div>
          </div>
          <div style={{ borderTop: "2px solid #7c3aed", paddingTop: "2vh" }}>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.4vw", fontWeight: 700, color: "#f1f0ff", marginBottom: "1vh", lineHeight: 1.3 }}>Self-Healing Code</div>
            <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.2vw", color: "rgba(241,240,255,0.45)", lineHeight: 1.5 }}>Bugs fix themselves automatically</div>
          </div>
          <div style={{ borderTop: "2px solid #7c3aed", paddingTop: "2vh" }}>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.4vw", fontWeight: 700, color: "#f1f0ff", marginBottom: "1vh", lineHeight: 1.3 }}>Universal Deployment</div>
            <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.2vw", color: "rgba(241,240,255,0.45)", lineHeight: 1.5 }}>Deploy anywhere with one command</div>
          </div>
          <div style={{ borderTop: "2px solid #7c3aed", paddingTop: "2vh" }}>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.4vw", fontWeight: 700, color: "#f1f0ff", marginBottom: "1vh", lineHeight: 1.3 }}>AI-Native Teams</div>
            <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.2vw", color: "rgba(241,240,255,0.45)", lineHeight: 1.5 }}>Humans + agents working together</div>
          </div>
          <div style={{ borderTop: "2px solid #7c3aed", paddingTop: "2vh" }}>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "1.4vw", fontWeight: 700, color: "#f1f0ff", marginBottom: "1vh", lineHeight: 1.3 }}>Sovereign Infrastructure</div>
            <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.2vw", color: "rgba(241,240,255,0.45)", lineHeight: 1.5 }}>Your own cloud, your own compute</div>
          </div>
        </div>
      </div>
    </div>
  );
}

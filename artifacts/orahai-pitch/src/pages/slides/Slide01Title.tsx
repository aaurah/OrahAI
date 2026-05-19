const base = import.meta.env.BASE_URL;

export default function Slide01Title() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0a0f" }}>
      <img
        src={`${base}hero-bg.png`}
        crossOrigin="anonymous"
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: 0.45 }}
      />
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(135deg, rgba(10,10,15,0.92) 0%, rgba(10,10,15,0.6) 60%, rgba(124,58,237,0.15) 100%)" }}
      />

      <div className="absolute inset-0 flex flex-col justify-between" style={{ padding: "6vh 7vw" }}>
        <div className="flex items-center gap-[1.5vw]">
          <div
            className="flex items-center justify-center rounded-xl"
            style={{ width: "4vw", height: "4vw", background: "#7c3aed" }}
          >
            <svg viewBox="0 0 24 24" fill="none" style={{ width: "2.2vw", height: "2.2vw" }}>
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#f1f0ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span style={{ fontFamily: "var(--font-display-family)", fontSize: "1.8vw", fontWeight: 700, color: "#f1f0ff", letterSpacing: "-0.02em" }}>
            OrahAI
          </span>
        </div>

        <div>
          <div
            className="inline-block rounded-full"
            style={{ background: "rgba(124,58,237,0.2)", border: "1px solid rgba(167,139,250,0.3)", padding: "0.6vh 1.8vw", marginBottom: "3vh" }}
          >
            <span style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "#a78bfa", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Investor Presentation · 2025
            </span>
          </div>

          <div style={{ fontFamily: "var(--font-display-family)", fontSize: "7.5vw", fontWeight: 700, color: "#f1f0ff", lineHeight: 1.0, letterSpacing: "-0.04em", textWrap: "balance" }}>
            The AI
            <span style={{ display: "block", color: "#a78bfa" }}>Software</span>
            Factory
          </div>

          <div style={{ marginTop: "3.5vh", maxWidth: "45vw" }}>
            <p style={{ fontFamily: "var(--font-body-family)", fontSize: "2.1vw", color: "rgba(241,240,255,0.65)", fontWeight: 400, lineHeight: 1.5 }}>
              Build. Ship. Scale. With AI.
            </p>
            <p style={{ fontFamily: "var(--font-body-family)", fontSize: "1.7vw", color: "rgba(241,240,255,0.45)", fontWeight: 400, lineHeight: 1.5, marginTop: "1.2vh" }}>
              Browser-based IDE where AI writes, debugs, and deploys your code
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "3vw", alignItems: "center" }}>
          <div style={{ height: "1px", width: "4vw", background: "rgba(167,139,250,0.4)" }} />
          <span style={{ fontFamily: "var(--font-body-family)", fontSize: "1.4vw", color: "rgba(241,240,255,0.4)" }}>
            orahai.replit.app
          </span>
        </div>
      </div>
    </div>
  );
}

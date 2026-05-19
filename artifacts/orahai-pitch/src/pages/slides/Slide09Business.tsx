export default function Slide09Business() {
  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: "#0a0a0f" }}>
      <div className="absolute" style={{ top: 0, right: 0, width: "35vw", height: "50vh", background: "radial-gradient(ellipse at top right, rgba(124,58,237,0.08) 0%, transparent 70%)" }} />

      <div className="absolute inset-0 flex flex-col" style={{ padding: "6.5vh 8vw" }}>
        <div style={{ marginBottom: "4vh" }}>
          <span style={{ fontFamily: "var(--font-mono-family)", fontSize: "1.1vw", color: "#7c3aed", letterSpacing: "0.12em", textTransform: "uppercase" }}>
            08 / Business Model
          </span>
          <div style={{ fontFamily: "var(--font-display-family)", fontSize: "3.5vw", fontWeight: 700, color: "#f1f0ff", lineHeight: 1.1, letterSpacing: "-0.03em", marginTop: "1vh" }}>
            Freemium SaaS —
            <span style={{ color: "#a78bfa" }}> land free, expand with value</span>
          </div>
        </div>

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "2vw", alignItems: "stretch" }}>
          <div style={{ background: "rgba(19,18,31,0.7)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "1vw", padding: "3vh 2vw", display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: "var(--font-mono-family)", fontSize: "1vw", color: "rgba(241,240,255,0.4)", letterSpacing: "0.1em", marginBottom: "1.5vh" }}>FREE</div>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "3vw", fontWeight: 700, color: "#f1f0ff", lineHeight: 1 }}>$0</div>
            <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.1vw", color: "rgba(241,240,255,0.4)", marginBottom: "2vh", marginTop: "0.5vh" }}>Forever</div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1vh" }}>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.15vw", color: "rgba(241,240,255,0.6)", lineHeight: 1.4 }}>3 projects</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.15vw", color: "rgba(241,240,255,0.6)", lineHeight: 1.4 }}>Community AI</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.15vw", color: "rgba(241,240,255,0.6)", lineHeight: 1.4 }}>GitHub Pages deploy</div>
            </div>
          </div>

          <div style={{ background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.4)", borderRadius: "1vw", padding: "3vh 2vw", display: "flex", flexDirection: "column", position: "relative" }}>
            <div style={{ position: "absolute", top: "-1.5vh", left: "50%", transform: "translateX(-50%)", background: "#7c3aed", borderRadius: "2vw", padding: "0.4vh 1.2vw" }}>
              <span style={{ fontFamily: "var(--font-mono-family)", fontSize: "0.9vw", color: "#f1f0ff", letterSpacing: "0.06em" }}>POPULAR</span>
            </div>
            <div style={{ fontFamily: "var(--font-mono-family)", fontSize: "1vw", color: "#a78bfa", letterSpacing: "0.1em", marginBottom: "1.5vh" }}>PRO</div>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "3vw", fontWeight: 700, color: "#f1f0ff", lineHeight: 1 }}>$19</div>
            <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.1vw", color: "rgba(241,240,255,0.4)", marginBottom: "2vh", marginTop: "0.5vh" }}>per month</div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1vh" }}>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.15vw", color: "rgba(241,240,255,0.75)", lineHeight: 1.4 }}>Unlimited projects</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.15vw", color: "rgba(241,240,255,0.75)", lineHeight: 1.4 }}>GPT-4o AI</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.15vw", color: "rgba(241,240,255,0.75)", lineHeight: 1.4 }}>Custom domains</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.15vw", color: "rgba(241,240,255,0.75)", lineHeight: 1.4 }}>Priority AI response</div>
            </div>
          </div>

          <div style={{ background: "rgba(19,18,31,0.7)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "1vw", padding: "3vh 2vw", display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: "var(--font-mono-family)", fontSize: "1vw", color: "rgba(241,240,255,0.4)", letterSpacing: "0.1em", marginBottom: "1.5vh" }}>TEAM</div>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "3vw", fontWeight: 700, color: "#f1f0ff", lineHeight: 1 }}>$49</div>
            <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.1vw", color: "rgba(241,240,255,0.4)", marginBottom: "2vh", marginTop: "0.5vh" }}>per seat / month</div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1vh" }}>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.15vw", color: "rgba(241,240,255,0.6)", lineHeight: 1.4 }}>Collaboration</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.15vw", color: "rgba(241,240,255,0.6)", lineHeight: 1.4 }}>Shared workspaces</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.15vw", color: "rgba(241,240,255,0.6)", lineHeight: 1.4 }}>Audit logs + SSO</div>
            </div>
          </div>

          <div style={{ background: "rgba(19,18,31,0.7)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "1vw", padding: "3vh 2vw", display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: "var(--font-mono-family)", fontSize: "1vw", color: "rgba(241,240,255,0.4)", letterSpacing: "0.1em", marginBottom: "1.5vh" }}>ENTERPRISE</div>
            <div style={{ fontFamily: "var(--font-display-family)", fontSize: "3vw", fontWeight: 700, color: "#f1f0ff", lineHeight: 1 }}>Custom</div>
            <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.1vw", color: "rgba(241,240,255,0.4)", marginBottom: "2vh", marginTop: "0.5vh" }}>pricing</div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1vh" }}>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.15vw", color: "rgba(241,240,255,0.6)", lineHeight: 1.4 }}>Self-hosted</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.15vw", color: "rgba(241,240,255,0.6)", lineHeight: 1.4 }}>Dedicated infra</div>
              <div style={{ fontFamily: "var(--font-body-family)", fontSize: "1.15vw", color: "rgba(241,240,255,0.6)", lineHeight: 1.4 }}>SLA + compliance</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: "3vh", display: "flex", alignItems: "center", gap: "0.8vw" }}>
          <div style={{ width: "0.5vw", height: "0.5vw", borderRadius: "50%", background: "#a78bfa" }} />
          <span style={{ fontFamily: "var(--font-body-family)", fontSize: "1.35vw", color: "rgba(241,240,255,0.55)" }}>
            Net Revenue Retention target: <strong style={{ color: "#a78bfa" }}>120%+</strong> — expansion through usage, not just seats
          </span>
        </div>
      </div>
    </div>
  );
}

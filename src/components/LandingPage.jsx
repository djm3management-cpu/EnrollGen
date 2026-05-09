/* eslint-disable react/no-unknown-property -- Keep the literal fetchpriority attribute on the hero video. */
import { Suspense } from "react";
import EnrollGenLogo from "./EnrollGenLogo";
import "./LandingPage.css";

const flowAccents = [
  { label: "MA", name: "Medicare Advantage", color: "#b85c5c" },
  { label: "ACA", name: "ACA", color: "#5c88b8" },
  { label: "MS", name: "Medicare Supplement", color: "#6aab7d" },
  { label: "U65", name: "U65", color: "#8b6eb8" },
  { label: "ANC", name: "Ancillary", color: "#c49940" },
];

const featureCards = [
  {
    label: "Script Intelligence",
    body: "Per-LOB guided flows for MA, ACA, SUP, U65, ancillary.",
  },
  {
    label: "Live Compliance",
    body: "Real-time CMS telemetry with CFR citation tracking.",
  },
  {
    label: "Field Intelligence",
    body: "FEMA disaster alerts, CMS bulletins, carrier news feed.",
  },
];

function HeroBackgroundVideo() {
  return (
    <video
      className="landing-hero-video"
      src="/videos/hero-bg.mp4"
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      fetchpriority="high"
      aria-hidden="true"
    />
  );
}

export default function LandingPage() {
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <a className="landing-logo-link" href="/" aria-label="EnrollGen home">
          <EnrollGenLogo width={142} className="landing-logo" />
        </a>
        <nav className="landing-nav-links" aria-label="Landing page navigation">
          <a href="mailto:djm3management@gmail.com?subject=EnrollGen%20Access%20Request">
            Request Access
          </a>
          <a href="/login">Login</a>
        </nav>
        <a className="landing-nav-cta" href="/login">
          Start Free Trial
        </a>
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="landing-hero-title">
          <div className="landing-hero-shell">
            <Suspense fallback={null}>
              <HeroBackgroundVideo />
            </Suspense>
            <div className="landing-hero-overlay" aria-hidden="true" />
            <div className="landing-hero-content">
              <div className="landing-flow-strip" aria-label="Supported enrollment flows">
                {flowAccents.map((flow) => (
                  <span key={flow.label} style={{ "--flow-color": flow.color }}>
                    <i aria-hidden="true" />
                    {flow.label}
                  </span>
                ))}
              </div>
              <h1 id="landing-hero-title">
                Compliant Medicare Scripting Intelligence&nbsp;System
              </h1>
              <p className="landing-hero-subhead">
                EnrollGen gives agents a live command center with guided script flows, real-time
                CMS compliance scoring, and AI copilot coaching , built for Medicare
                Advantage, ACA, Supplement, U65, and ancillary sales.
              </p>
            </div>
            <div className="landing-hero-panel" aria-label="EnrollGen workflow snapshot">
              <div className="landing-panel-topbar">
                <span>LIVE ENROLLMENT</span>
                <strong>
                  <i aria-hidden="true" />
                  AI READY
                </strong>
              </div>
              <div className="landing-terminal-section">
                <div className="landing-terminal-heading">SCRIPT FLOW</div>
                <div className="landing-terminal-row">
                  <span className="landing-status-dot is-green" aria-hidden="true" />
                  <span>Recording Disclosure</span>
                  <strong>✓</strong>
                </div>
                <div className="landing-terminal-row">
                  <span className="landing-status-dot is-amber" aria-hidden="true" />
                  <span>TPMO Disclosure</span>
                  <strong>→ IN PROGRESS</strong>
                </div>
              </div>

              <div className="landing-terminal-section">
                <div className="landing-terminal-heading">CO-PILOT FEED</div>
                <p className="landing-terminal-ai">
                  Beneficiary expressed cost concern , suggest MAPD with $0 premium
                </p>
              </div>

              <div className="landing-terminal-section">
                <div className="landing-terminal-heading">COMPLIANCE</div>
                <div className="landing-compliance-row is-green">
                  <div>
                    <span>Call Opening</span>
                    <strong>100%</strong>
                  </div>
                  <i aria-hidden="true" />
                </div>
                <div className="landing-compliance-row is-amber">
                  <div>
                    <span>Required Disclosures</span>
                    <strong>43%</strong>
                  </div>
                  <i aria-hidden="true" />
                </div>
                <div className="landing-compliance-row is-muted">
                  <div>
                    <span>Needs Assessment</span>
                    <strong>0%</strong>
                  </div>
                  <i aria-hidden="true" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-feature-section" aria-label="EnrollGen capabilities">
          <div className="landing-feature-grid">
            {featureCards.map((feature) => (
              <article key={feature.label} className="landing-feature-card">
                <span>{feature.label}</span>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <span>&copy; 2026 EnrollGen. All rights reserved.</span>
      </footer>
    </div>
  );
}

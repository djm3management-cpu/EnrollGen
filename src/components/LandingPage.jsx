/* eslint-disable react/no-unknown-property -- Keep the literal fetchpriority attribute on the hero video. */
import { Suspense } from "react";
import EnrollGenLogo from "./EnrollGenLogo";
import "./LandingPage.css";

const flowAccents = [
  { label: "MA", name: "Medicare Advantage", color: "#E8002D" },
  { label: "ACA", name: "ACA", color: "#EAB308" },
  { label: "SUP", name: "Medicare Supplement", color: "#00D166" },
  { label: "U65", name: "U65", color: "#a855f7" },
  { label: "ANC", name: "Ancillary", color: "#3B82F6" },
];

const features = [
  {
    eyebrow: "Guided Scripts",
    title: "Keep agents on the compliant path",
    body: "Dynamic enrollment flows help teams stay aligned with required disclosures, eligibility checks, and plan presentation steps.",
  },
  {
    eyebrow: "AI Copilot",
    title: "Surface the next best response",
    body: "EnrollGen turns call context into timely coaching, objection support, and compliance reminders without slowing the conversation.",
  },
  {
    eyebrow: "Multi-Flow",
    title: "One operating system for growth",
    body: "Support Medicare Advantage, ACA, Medicare Supplement, U65, and ancillary workflows from a single dark-theme command center.",
  },
];

const steps = [
  "Select the enrollment flow that matches the call.",
  "Follow guided prompts, checks, and AI coaching in real time.",
  "Review summaries, compliance signals, and operational context after the call.",
];

function handleSectionScroll(event, selector) {
  event.preventDefault();
  document.querySelector(selector)?.scrollIntoView({ behavior: "smooth" });
}

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
          <a href="#problem" onClick={(event) => handleSectionScroll(event, "#problem")}>
            Problem
          </a>
          <a href="#features" onClick={(event) => handleSectionScroll(event, "#features")}>
            Features
          </a>
          <a
            href="#how-it-works"
            onClick={(event) => handleSectionScroll(event, "#how-it-works")}
          >
            How It Works
          </a>
          <a href="#contact" onClick={(event) => handleSectionScroll(event, "#contact")}>
            Contact
          </a>
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
              <h1 id="landing-hero-title">Compliant Medicare enrollment, guided by AI</h1>
              <p className="landing-hero-subhead">
                EnrollGen gives agents a live command center with guided script flows, real-time
                CMS compliance scoring, and AI copilot coaching &mdash; built for Medicare
                Advantage, ACA, Supplement, U65, and ancillary sales.
              </p>
              <div className="landing-hero-actions">
                <a className="landing-button landing-button-primary" href="/login">
                  Start Free Trial
                </a>
                <a
                  className="landing-button landing-button-secondary"
                  href="#features"
                  onClick={(event) => handleSectionScroll(event, "#features")}
                >
                  See How It Works
                </a>
              </div>
            </div>
            <div className="landing-hero-panel" aria-label="EnrollGen workflow snapshot">
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
                  Beneficiary expressed cost concern &mdash; suggest MAPD with $0 premium
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

        <section id="problem" className="landing-section landing-problem">
          <div className="landing-section-kicker">Problem</div>
          <div className="landing-two-column">
            <h2>Enrollment calls move faster than manual compliance support can follow.</h2>
            <p>
              Agents are expected to sell, document, disclose, qualify, and respond with precision
              while switching between products, scripts, and customer objections. That creates risk
              at the exact moment teams need consistency.
            </p>
          </div>
        </section>

        <section id="features" className="landing-section">
          <div className="landing-section-heading">
            <div className="landing-section-kicker">Features</div>
            <h2>Built for the call floor, not a static script binder.</h2>
          </div>
          <div className="landing-feature-grid">
            {features.map((feature) => (
              <article key={feature.title} className="landing-feature-card">
                <span>{feature.eyebrow}</span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="landing-section landing-how">
          <div className="landing-section-heading">
            <div className="landing-section-kicker">How It Works</div>
            <h2>From call start to QA-ready summary in three steps.</h2>
          </div>
          <div className="landing-step-grid">
            {steps.map((step, index) => (
              <article key={step} className="landing-step">
                <strong>{String(index + 1).padStart(2, "0")}</strong>
                <p>{step}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="contact" className="landing-section landing-contact">
          <div className="landing-section-heading">
            <div className="landing-section-kicker">Contact</div>
            <h2>Bring live script guidance, AI coaching, and compliance scoring to your team.</h2>
          </div>
          <a
            className="landing-contact-box"
            href="mailto:djm3management@gmail.com?subject=EnrollGen%20Demo%20Request"
          >
            <span>Contact EnrollGen</span>
            <strong>djm3management@gmail.com</strong>
          </a>
        </section>
      </main>

      <footer className="landing-footer">
        <EnrollGenLogo width={126} className="landing-footer-logo" />
        <div>
          <strong>EnrollGen</strong>
          <span>AI-guided enrollment workflows for compliant growth.</span>
        </div>
        <a href="/login">Start Free Trial</a>
      </footer>
    </div>
  );
}

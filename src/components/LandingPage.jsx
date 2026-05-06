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

const pricing = [
  {
    name: "Starter",
    price: "$99",
    body: "For individual agents validating a compliant workflow.",
  },
  {
    name: "Team",
    price: "$249",
    body: "For sales teams standardizing scripts, coaching, and QA.",
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    body: "For organizations with multi-tenant operations and advanced controls.",
  },
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
          <a href="#pricing" onClick={(event) => handleSectionScroll(event, "#pricing")}>
            Pricing
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
                EnrollGen gives agents a real-time command center for guided scripts, compliance
                checkpoints, and AI coaching across Medicare and health enrollment workflows.
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
              <div className="landing-panel-topline">
                <span>Live Enrollment</span>
                <strong>AI READY</strong>
              </div>
              <div className="landing-panel-metric">
                <span>Compliance Confidence</span>
                <strong>94%</strong>
              </div>
              <div className="landing-panel-list">
                <span>TPMO disclosure verified</span>
                <span>Needs assessment in progress</span>
                <span>Plan impact check queued</span>
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

        <section id="pricing" className="landing-section">
          <div className="landing-section-heading">
            <div className="landing-section-kicker">Pricing</div>
            <h2>Choose the operating tier that matches your enrollment team.</h2>
          </div>
          <div className="landing-pricing-grid">
            {pricing.map((tier) => (
              <article
                key={tier.name}
                className={`landing-price-card${tier.featured ? " is-featured" : ""}`}
              >
                <h3>{tier.name}</h3>
                <div className="landing-price">{tier.price}</div>
                <p>{tier.body}</p>
                <a href="/login">Start Free Trial</a>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section landing-proof">
          <div className="landing-section-kicker">Social Proof</div>
          <blockquote>
            "EnrollGen helped our agents standardize compliant enrollment conversations without
            taking momentum out of the call."
          </blockquote>
          <p>Customer story placeholder</p>
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

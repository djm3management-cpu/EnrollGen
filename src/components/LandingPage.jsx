/* eslint-disable react/no-unknown-property -- Keep the literal fetchpriority attribute on the hero video. */
import { Suspense } from "react";
import "./LandingPage.css";

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
    <div className="landing-page landing-page--mystery">
      <header className="landing-nav">
        <a className="landing-logo-link" href="/" aria-label="EnrollGen home">
          <img
            className="landing-logo landing-logo-image"
            src="/enrollgen-logo-v3.png?v=2"
            alt="EnrollGen"
          />
        </a>
        <span className="landing-nav-spacer" aria-hidden="true" />
        <div className="landing-nav-actions">
          <a className="landing-nav-login" href="/login">
            Login
          </a>
          <a
            className="landing-nav-cta"
            href="mailto:djm3management@gmail.com?subject=EnrollGen%20Contact"
          >
            Contact
          </a>
        </div>
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="landing-hero-title">
          <div className="landing-hero-shell landing-hero-shell--mystery">
            <Suspense fallback={null}>
              <HeroBackgroundVideo />
            </Suspense>
              <div className="landing-hero-overlay" aria-hidden="true" />
            <div className="landing-hero-content landing-mystery-content">
              <h1 id="landing-hero-title">
                <span>new generation agent dashboard</span>
              </h1>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

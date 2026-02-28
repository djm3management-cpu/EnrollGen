import EnrollGenLogo from "./EnrollGenLogo";
import { useState, useMemo } from "react";
import ObjectionHandler from "./ObjectionHandler";
import SEPLookup from "./SEPLookup";
import ComplianceDashboard from "./ComplianceDashboard";
import DailyVerse from "./DailyVerse";

/* ---- Collapsible Accordion ---- */
function Accordion({
  title,
  children,
  defaultOpen = false,
  searchMatch = true,
}) {
  const [open, setOpen] = useState(defaultOpen);

  // If search is active and this doesn't match, hide it
  if (!searchMatch) return null;

  return (
    <div className={`accordion ${open ? "open" : ""}`}>
      <button
        className="accordion-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        type="button"
      >
        <span>{title}</span>
        <span className="accordion-arrow">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  );
}

/* ---- Carrier Quick Links ---- */
const CARRIER_LINKS = [
  {
    name: "Humana MBI Lookup (Vantage)",
    url: "https://agentportal.humana.com/Vantage/apps/index.html?agenthome=-1#!/dual-eligibility-verification",
    icon: "🟡",
  },
  {
    name: "UHC MBI Lookup (Jarvis)",
    url: "https://www.uhcjarvis.com/content/jarvis/en/secure/tools/eligibility_lookup.html",
    icon: "🔵",
  },
  { name: "Sunfire", url: "https://app.sunfirematrix.com", icon: "🔥" },
  {
    name: "MARx (CMS)",
    url: "https://www.cms.gov/medicare/enrollment-renewal/providers-suppliers/internet-based-marx",
    icon: "🏛️",
  },
  {
    name: "Aetna / Producer World",
    url: "https://www.aetna.com/producer.html",
    icon: "🅰️",
  },
  {
    name: "Anthem / Broker Connect",
    url: "https://www.anthem.com/broker/",
    icon: "🔷",
  },
  { name: "Cigna / Brokers", url: "https://cignaforbrokers.com", icon: "🟢" },
  {
    name: "Devoted Agent Portal",
    url: "https://www.devoted.com/agents",
    icon: "❤️",
  },
  { name: "Humana / Vantage", url: "https://www.humana.com/agent", icon: "🟡" },
  { name: "UHC / Jarvis", url: "https://www.uhcjarvis.com", icon: "🔵" },
  {
    name: "WellCare / Broker Portal",
    url: "https://www.wellcare.com/broker",
    icon: "🟣",
  },
  { name: "Medicare.gov", url: "https://www.medicare.gov", icon: "🏛️" },
];

export default function AgentTools() {
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const q = searchQuery.toLowerCase().trim();
  const matchesSearch = (text) => {
    if (!q) return true;
    return text.toLowerCase().includes(q);
  };

  const accordionMatches = useMemo(() => {
    if (!q) {
      return {
        maps: true,
        core: true,
        seps: true,
        disaster: true,
        refs: true,
        links: true,
        sepLookup: true,
      };
    }

    return {
      maps: matchesSearch("FEMA Disaster SEP Zones Medicaid Map"),
      core: matchesSearch("Core Medicare Enrollment Periods AEP OEP IEP"),
      seps: matchesSearch(
        "Special Enrollment Periods SEP Moving Medicaid Extra Help Institutional Life Events Employer 5-Star Dual Chronic"
      ),
      disaster: matchesSearch(
        "Disaster SEP Tracker FEMA Aetna Anthem Cigna Devoted Humana WellCare UHC"
      ),
      refs: matchesSearch(
        "Quick Agent References Medicaid Income Limits D-SNP"
      ),
      links: matchesSearch(
        "Carrier Quick Links Sunfire MARx Aetna Anthem Cigna Devoted Humana UHC WellCare Medicare portal login"
      ),
      sepLookup: matchesSearch(
        "SEP Lookup Tool zip code search carrier FEMA disaster Medicare Advantage plan codes contract ID PBP enrollment period UHC Aetna BCBS Cigna Humana Wellcare Molina Devoted Kaiser 5-star dual eligible D-SNP C-SNP grocery OTC flex card"
      ),
    };
  }, [q]);

  return (
    <div className="agent-tools">
      {/* 1) SEARCH ALWAYS FIRST */}
      <div className="agent-tools-search">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="🔍 Search agent tools..."
          className="input-dark agent-tools-search-input"
        />
        {searchQuery && (
          <button
            className="agent-tools-search-clear"
            onClick={() => setSearchQuery("")}
            title="Clear search"
            type="button"
          >
            ✕
          </button>
        )}
      </div>

      {/* No results message directly under search */}
      {q && !Object.values(accordionMatches).some(Boolean) && (
        <div className="agent-tools-no-results">
          <p>No results for "{searchQuery}"</p>
        </div>
      )}
      <ObjectionHandler />
      {/* 2) SEP LOOKUP NEXT (so it stays high on the page) */}
      {accordionMatches.sepLookup && <SEPLookup />}

      {/* 4) QUICK LINKS */}
      <Accordion
        title="🚀 Carrier Quick Links"
        defaultOpen
        searchMatch={accordionMatches.links}
      >
        <div className="carrier-links-grid">
          {CARRIER_LINKS.map((link) => (
            <a
              key={link.name}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="carrier-link-card"
            >
              <span className="carrier-link-icon">{link.icon}</span>
              <span className="carrier-link-name">{link.name}</span>
            </a>
          ))}
        </div>
      </Accordion>

      {/* 5) CORE EP */}
      <Accordion
        title="🗓️ Core Medicare Enrollment Periods"
        defaultOpen
        searchMatch={accordionMatches.core}
      >
        <ul>
          <li>
            <strong>AEP</strong> (Oct 15 – Dec 7): Change, drop, or enroll in
            Medicare Advantage
          </li>
          <li>
            <strong>OEP</strong> (Jan 1 – Mar 31): One MA plan change or drop to
            Original Medicare
          </li>
          <li>
            <strong>IEP</strong>: 7-month window around 65th birthday for
            first-time enrollment
          </li>
        </ul>
      </Accordion>

      {/* 6) SEPs */}
      <Accordion
        title="🔁 Medicare Advantage Special Enrollment Periods (SEPs)"
        searchMatch={accordionMatches.seps}
      >
        {/* keep your existing SEP content here */}
      </Accordion>

      {/* 7) DISASTER */}
      <Accordion
        title="🌪️ Disaster SEP Tracker"
        searchMatch={accordionMatches.disaster}
      >
        {/* keep your existing Disaster content here */}
      </Accordion>

      {/* 8) MAPS (LOWER because they are huge) */}
      <Accordion
        title="🗺️ FEMA Disaster SEP Zones & Medicaid Map"
        searchMatch={accordionMatches.maps}
      >
        {!mapsLoaded ? (
          <div className="map-load-prompt">
            <p>Maps are large and may take a moment to load.</p>
            <button
              className="primary"
              onClick={() => setMapsLoaded(true)}
              type="button"
            >
              Load Maps
            </button>
          </div>
        ) : (
          <>
            <h4>FEMA Disaster SEP Zones</h4>
            <iframe
              src="https://www.google.com/maps/d/embed?mid=1XUQ3Haav_eI8jD4lNnXErKMni_gyPMk&ehbc=2E312F"
              width="100%"
              height="650"
              style={{ border: 0 }}
              loading="lazy"
              title="FEMA Disaster SEP Zones"
            />

            <h4 style={{ marginTop: 24 }}>Medicaid Eligibility by State</h4>
            <iframe
              src="https://www.google.com/maps/d/u/0/embed?mid=14aNMdQKllgQH1P81J-0U9pIoiqjLD7g&ehbc=2E312F"
              width="100%"
              height="650"
              style={{ border: 0 }}
              loading="lazy"
              title="Medicaid Eligibility by State"
            />
          </>
        )}
      </Accordion>

      {/* 9) REFS */}
      <Accordion
        title="🔗 Quick Agent References"
        searchMatch={accordionMatches.refs}
      >
        {/* keep your existing References content here */}
      </Accordion>

      {/* 10) DAILY VERSE LAST */}
      <DailyVerse />
    </div>
  );
}

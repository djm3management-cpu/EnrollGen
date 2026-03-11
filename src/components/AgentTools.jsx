import { useState, useMemo } from "react";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Circle,
  Flame,
  Heart,
  Landmark,
  Map,
  Rocket,
  RotateCw,
  Search,
  Shield,
  X,
} from "lucide-react";
import DailyVerse from "./DailyVerse";
import { NGHS_SEP_SCRIPT } from "../context/SEPScript";

/* ---- Collapsible Accordion ---- */
function Accordion({
  title,
  icon,
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
        <span
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          {icon}
          {title}
        </span>
        <span className="accordion-arrow">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  );
}

function renderCarrierIcon(type) {
  const props = { size: 16, strokeWidth: 2 };
  const iconMap = {
    humana: <Circle {...props} color="#fbbf24" fill="#fbbf24" />,
    uhc: <Circle {...props} color="#60a5fa" fill="#60a5fa" />,
    sunfire: <Flame {...props} color="#f97316" />,
    cms: <Landmark {...props} color="#cbd5e1" />,
    aetna: <Building2 {...props} color="#60a5fa" />,
    anthem: <Shield {...props} color="#60a5fa" />,
    cigna: <Circle {...props} color="#34d399" fill="#34d399" />,
    devoted: <Heart {...props} color="#f87171" />,
    wellcare: <Circle {...props} color="#c084fc" fill="#c084fc" />,
  };

  return iconMap[type] || <Building2 {...props} color="#cbd5e1" />;
}

function SEPReference({ script }) {
  return (
    <div className="sep-reference">
      <div className="sep-reference-header">
        <div>
          <h4>{script.title}</h4>
          <p>{script.subtitle}</p>
        </div>
        <span className="sep-reference-badge">Internal Use Only</span>
      </div>

      <div className="sep-reference-note">{script.instructions}</div>

      <div className="sep-reference-sections">
        {script.sections.map((section) => (
          <div key={section.id} className="sep-reference-section">
            <div className="sep-reference-section-title">{section.name}</div>
            <div className="sep-reference-items">
              {section.items.map((item) => (
                <article key={item.id} className="sep-reference-item">
                  <div className="sep-reference-ask">{item.ask}</div>
                  <div className="sep-reference-meta">
                    <span className="sep-reference-label">Allowed actions</span>
                    <ul className="sep-reference-actions">
                      {item.allowed_actions.map((action) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="sep-reference-window">
                    <span className="sep-reference-label">Enrollment window</span>
                    <p>{item.window}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="sep-reference-footer">{script.footer}</div>
    </div>
  );
}

/* ---- Carrier Quick Links ---- */
const CARRIER_LINKS = [
  {
    name: "Humana MBI Lookup (Vantage)",
    url: "https://agentportal.humana.com/Vantage/apps/index.html?agenthome=-1#!/dual-eligibility-verification",
    icon: "humana",
  },
  {
    name: "UHC MBI Lookup (Jarvis)",
    url: "https://www.uhcjarvis.com/content/jarvis/en/secure/tools/eligibility_lookup.html",
    icon: "uhc",
  },
  { name: "Sunfire", url: "https://app.sunfirematrix.com", icon: "sunfire" },
  {
    name: "MARx (CMS)",
    url: "https://www.cms.gov/medicare/enrollment-renewal/providers-suppliers/internet-based-marx",
    icon: "cms",
  },
  {
    name: "Aetna / Producer World",
    url: "https://www.aetna.com/producer.html",
    icon: "aetna",
  },
  {
    name: "Anthem / Broker Connect",
    url: "https://www.anthem.com/broker/",
    icon: "anthem",
  },
  { name: "Cigna / Brokers", url: "https://cignaforbrokers.com", icon: "cigna" },
  {
    name: "Devoted Agent Portal",
    url: "https://www.devoted.com/agents",
    icon: "devoted",
  },
  { name: "Humana / Vantage", url: "https://www.humana.com/agent", icon: "humana" },
  { name: "UHC / Jarvis", url: "https://www.uhcjarvis.com", icon: "uhc" },
  {
    name: "WellCare / Broker Portal",
    url: "https://www.wellcare.com/broker",
    icon: "wellcare",
  },
  { name: "Medicare.gov", url: "https://www.medicare.gov", icon: "cms" },
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
          placeholder="Search agent tools..."
          className="input-dark agent-tools-search-input"
        />
        <Search size={16} className="agent-tools-search-icon" />
        {searchQuery && (
          <button
            className="agent-tools-search-clear"
            onClick={() => setSearchQuery("")}
            title="Clear search"
            type="button"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* No results message directly under search */}
      {q && !Object.values(accordionMatches).some(Boolean) && (
        <div className="agent-tools-no-results">
          <p>No results for "{searchQuery}"</p>
        </div>
      )}
      {/* 6) SEPs */}
      <Accordion
        title="Medicare Advantage Special Enrollment Periods (SEPs)"
        icon={<RotateCw size={16} />}
        defaultOpen
        searchMatch={accordionMatches.seps}
      >
        <SEPReference script={NGHS_SEP_SCRIPT} />
      </Accordion>
      {/* 4) QUICK LINKS */}
      <Accordion
        title="Carrier Quick Links"
        icon={<Rocket size={16} />}
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
              <span className="carrier-link-icon">
                {renderCarrierIcon(link.icon)}
              </span>
              <span className="carrier-link-name">{link.name}</span>
            </a>
          ))}
        </div>
      </Accordion>

      {/* 8) MAPS (LOWER because they are huge) */}
      <Accordion
        title="FEMA Disaster SEP Zones & Medicaid Map"
        icon={<Map size={16} />}
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

      {/* 10) DAILY VERSE LAST */}
      <DailyVerse />
    </div>
  );
}

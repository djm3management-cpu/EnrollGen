import { useState, useMemo } from "react";
import ObjectionHandler from "./ObjectionHandler";
import SEPLookup from "./SEPLookup";
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

  // Search filter logic — check if accordion title or content keywords match
  const q = searchQuery.toLowerCase().trim();
  const matchesSearch = (text) => {
    if (!q) return true;
    return text.toLowerCase().includes(q);
  };

  // Pre-compute accordion search matches
  const accordionMatches = useMemo(() => {
    if (!q)
      return {
        maps: true,
        core: true,
        seps: true,
        disaster: true,
        refs: true,
        links: true,
        sepLookup: true,
      };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="agent-tools">
      {/* Search Box */}
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
          >
            ✕
          </button>
        )}
      </div>
      <ObjectionHandler />

      <SEPLookup />
      {/* ===== CARRIER QUICK LINKS ===== */}
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
      {/* ===== MAPS (lazy loaded) ===== */}
      <Accordion
        title="🗺️ FEMA Disaster SEP Zones & Medicaid Map"
        searchMatch={accordionMatches.maps}
      >
        {!mapsLoaded ? (
          <div className="map-load-prompt">
            <p>Maps are large and may take a moment to load.</p>
            <button className="primary" onClick={() => setMapsLoaded(true)}>
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
      {/* ===== CORE ENROLLMENT PERIODS ===== */}
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
      {/* ===== SPECIAL ENROLLMENT PERIODS ===== */}
      <Accordion
        title="🔁 Medicare Advantage Special Enrollment Periods (SEPs)"
        searchMatch={accordionMatches.seps}
      >
        <h5>Moving / Location</h5>
        <ul>
          <li>Permanent Move: New MA plan options available</li>
          <li>Plan Not Offered in Area: Switch to available plan</li>
        </ul>

        <h5>Plan / Coverage Issues</h5>
        <ul>
          <li>Plan Terminated: Enroll in a new MA plan</li>
          <li>CMS Sanction SEP: Leave poor-performing plan</li>
          <li>Plan Contract Violation: Change due to carrier error</li>
        </ul>

        <h5>Medicaid / Extra Help</h5>
        <ul>
          <li>Gain Medicaid: Switch MA anytime</li>
          <li>Lose Medicaid: 3-month SEP</li>
          <li>Gain Extra Help (LIS): One change per quarter (Q1–Q3)</li>
          <li>Lose Extra Help: 3-month SEP</li>
        </ul>

        <h5>Institutional</h5>
        <ul>
          <li>Enter Nursing Home / LTC: Change MA anytime</li>
          <li>Leave Facility: 2-month SEP after discharge</li>
        </ul>

        <h5>Life Events</h5>
        <ul>
          <li>Marriage: SEP if coverage impacted</li>
          <li>Divorce: SEP if coverage lost</li>
          <li>Death of Household Member: SEP if coverage affected</li>
        </ul>

        <h5>Employer Coverage</h5>
        <ul>
          <li>Lose Employer Coverage: 2-month SEP</li>
          <li>Employer Plan Ends: Enroll in MA</li>
        </ul>

        <h5>5-Star SEP</h5>
        <ul>
          <li>5-Star Plan Available: One switch per year (Dec–Nov)</li>
        </ul>

        <h5>Dual / Chronic Eligibility</h5>
        <ul>
          <li>Eligible for C-SNP: Enroll if condition qualifies</li>
          <li>Eligible for D-SNP: Enroll with Medicaid status</li>
        </ul>

        <h5>Administrative / Misc</h5>
        <ul>
          <li>Medicare Error or Misinformation: CMS-granted SEP</li>
          <li>Return from Incarceration: SEP upon release</li>
          <li>FEMA Disaster SEP: Extended enrollment window</li>
        </ul>
      </Accordion>
      {/* ===== DISASTER SEP TRACKER ===== */}
      <Accordion
        title="🌪️ Disaster SEP Tracker"
        searchMatch={accordionMatches.disaster}
      >
        <p>
          <strong>National Disaster References</strong>
        </p>
        <ul>
          <li>
            FEMA Disaster Declarations:{" "}
            <a
              href="https://www.fema.gov/disaster/declarations"
              target="_blank"
              rel="noreferrer"
            >
              fema.gov/disaster/declarations
            </a>
          </li>
          <li>
            DST Disaster SEP Tracker:{" "}
            <a
              href="https://dst.bobbybrockinsurance.com/"
              target="_blank"
              rel="noreferrer"
            >
              dst.bobbybrockinsurance.com
            </a>
          </li>
        </ul>

        <p>
          <strong>How to Find Disaster / Weather SEP Lists by Carrier</strong>
        </p>

        <Accordion title="Aetna">
          <ul>
            <li>Log in to Producer World</li>
            <li>
              Scroll down and click Individual Medicare under the News heading
            </li>
            <li>On Producer News page, click the Individual Medicare tab</li>
            <li>Click SEP Announcements</li>
            <li>Select month and state from the menu</li>
          </ul>
        </Accordion>

        <Accordion title="Anthem">
          <ul>
            <li>Log in to Producer Toolbox</li>
            <li>Scroll to Medicare Quick Links (right side)</li>
            <li>Click Broker Connect</li>
            <li>Click Communications in the top toolbar</li>
            <li>Scroll to Updated SEP Disaster Declaration List</li>
            <li>Click Learn More to download the Excel file</li>
          </ul>
        </Accordion>

        <Accordion title="Cigna">
          <ul>
            <li>Log in to Cigna for Brokers</li>
            <li>Scroll to Tools and click Medicare Producers University</li>
            <li>Click Resource Center</li>
            <li>Select Agent Communications</li>
            <li>Open Ongoing SEPs, Disaster, and Emergency Declarations</li>
            <li>Click Ongoing SEP Tracker to download the Excel file</li>
          </ul>
        </Accordion>

        <Accordion title="Devoted">
          <ul>
            <li>Log in to Devoted Agent Portal</li>
            <li>Scroll to Sales Tools on the home page</li>
            <li>Click View Active SEP List</li>
            <li>A PDF will open with current SEPs</li>
          </ul>
        </Accordion>

        <Accordion title="Humana">
          <ul>
            <li>Log in to Vantage</li>
            <li>Scroll to Additional Resources (right side)</li>
            <li>
              Click SEP for Individuals Affected by a Disaster or Emergency
            </li>
            <li>A PDF will open showing SEPs by state</li>
          </ul>
        </Accordion>

        <Accordion title="WellCare (Centene)">
          <ul>
            <li>Log in to the Broker Portal</li>
            <li>Click Centene Workbench</li>
            <li>Under Quick Links, click Broker Quick Links</li>
            <li>Scroll to Application & Enrollment Resources</li>
            <li>Under Special Election Periods, click Active SEPs</li>
            <li>A new window will open with current SEPs</li>
          </ul>
        </Accordion>

        <Accordion title="UnitedHealthcare (UHC)">
          <ul>
            <li>Log in to Jarvis</li>
            <li>Type SEP into the search bar</li>
            <li>Select State SEP Information</li>
            <li>An Excel file will download with available SEPs</li>
          </ul>
        </Accordion>
      </Accordion>
      {/* ===== QUICK REFERENCES ===== */}
      <Accordion
        title="🔗 Quick Agent References"
        searchMatch={accordionMatches.refs}
      >
        <h5>Medicaid Income Limits by State</h5>
        <ul>
          <li>
            <a
              href="https://www.medicaidplanningassistance.org/medicaid-eligibility-income-chart/"
              target="_blank"
              rel="noreferrer"
            >
              Medicaid Eligibility Income Chart
            </a>
          </li>
          <li>
            <a
              href="https://www.kff.org/affordable-care-act/state-indicator/medicaid-income-eligibility-limits-for-adults-as-a-percent-of-the-federal-poverty-level/?currentTimeframe=0&sortModel=%7B%22colId%22:%22Location%22,%22sort%22:%22asc%22%7D"
              target="_blank"
              rel="noreferrer"
            >
              KFF Medicaid Income Eligibility (FPL %)
            </a>
          </li>
        </ul>

        <h5>D-SNP Core Requirements</h5>
        <ul>
          <li>
            <strong>Medicare Enrollment:</strong> Must be enrolled in both
            Medicare Part A and Part B.
          </li>
          <li>
            <strong>Medicaid Eligibility:</strong> Must qualify for state
            Medicaid (full or partial via QMB, SLMB, QI, or other MSP).
          </li>
          <li>
            <strong>Location:</strong> Must live in the D-SNP plan's service
            area.
          </li>
        </ul>
      </Accordion>
      {/* No results message */}
      {q && !Object.values(accordionMatches).some(Boolean) && (
        <div className="agent-tools-no-results">
          <p>No results for "{searchQuery}"</p>
        </div>
      )}

      <DailyVerse />
    </div>
  );
}

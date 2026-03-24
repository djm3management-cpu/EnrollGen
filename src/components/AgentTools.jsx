import { useState, useMemo } from "react";
import {
  Building2,
  CalendarDays,
  CheckSquare,
  Circle,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Flame,
  Heart,
  Landmark,
  Map,
  RotateCw,
  Scale,
  Search,
  Shield,
  Stethoscope,
  UserCheck,
  X,
  Zap,
} from "lucide-react";
import DailyVerse from "./DailyVerse";
import DecisionTree from "./DecisionTree";
import ObjectionHandler from "./ObjectionHandler";
import { NGHS_SEP_SCRIPT } from "../context/SEPScript";
import "../AgentTools.css";

/* ═══════════════════════════════════════════════════════════════════════
   SECTION DATA
   ═══════════════════════════════════════════════════════════════════════ */

const OFFICIAL_REFS = [
  { name: "Federal Register", desc: "Proposed rules, final rules & notices", url: "https://www.federalregister.gov/" },
  { name: "eCFR 42 CFR §422", desc: "Medicare Advantage regulations", url: "https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-422" },
  { name: "eCFR 42 CFR §423", desc: "Part D regulations", url: "https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-423" },
  { name: "CMS Marketing Guidelines", desc: "MCMG — what agents can & cannot say", url: "https://www.cms.gov/medicare/health-drug-plans/managed-care-marketing" },
  { name: "HPMS Memos Archive", desc: "CMS operational memos & bulletins", url: "https://www.cms.gov/medicare/health-drug-plans/managed-care-marketing/resource-center" },
  { name: "Medicare Managed Care Manual", desc: "Chapters 1–19 operating guidance", url: "https://www.cms.gov/regulations-and-guidance/guidance/manuals/internet-only-manuals-ioms-items/cms019326" },
  { name: "Regulations.gov", desc: "Comment tracking & rulemaking follow-up", url: "https://www.regulations.gov/" },
];

const ENROLLMENT_TOOLS = [
  { name: "CMS Enrollment & Disenrollment Guidance", desc: "Current MA / Part D enrollment rules", url: "https://www.cms.gov/medicare/enrollment-renewal/managed-care-eligibility-enrollment" },
  { name: "Medicare.gov Plan Compare", desc: "Official plan comparison tool", url: "https://www.medicare.gov/plan-compare/" },
  { name: "Original Medicare Enrollment", desc: "Part A & B enrollment page", url: "https://www.medicare.gov/basics/get-started-with-medicare/sign-up/when-does-medicare-coverage-start" },
  { name: "SSA Extra Help / LIS", desc: "Apply for Part D cost assistance", url: "https://www.ssa.gov/medicare/part-d-extra-help" },
  { name: "State Medicaid Contacts", desc: "Route to state Medicaid agencies", url: "https://www.medicaid.gov/about-us/contact-us/contact-your-state-page/index.html" },
  { name: "FEMA Disaster Declarations", desc: "Official disaster declaration lookup", url: "https://www.fema.gov/disaster/declarations" },
  { name: "1-800-MEDICARE Contact", desc: "CMS contact & help page", url: "https://www.medicare.gov/talk-to-someone" },
];

const PROVIDER_TOOLS = [
  { name: "Care Compare", desc: "Provider participation lookup", url: "https://www.medicare.gov/care-compare/" },
  { name: "NPI Registry", desc: "National Provider Identifier lookup", url: "https://npiregistry.cms.hhs.gov/search" },
  { name: "OIG LEIE Exclusions", desc: "Excluded provider search", url: "https://exclusions.oig.hhs.gov/" },
  { name: "Pharmacy Network Reference", desc: "Preferred pharmacy / network concepts", url: "https://www.medicare.gov/plan-compare/#/pharmaceutical-assistance-program" },
  { name: "Medicare Rx Payment Plan", desc: "Prescription Payment Plan info", url: "https://www.medicare.gov/basics/costs/help/drug-costs" },
];

const CARRIER_LINKS = [
  { name: "Humana MBI Lookup (Vantage)", url: "https://agentportal.humana.com/Vantage/apps/index.html?agenthome=-1#!/dual-eligibility-verification", icon: "humana" },
  { name: "UHC MBI Lookup (Jarvis)", url: "https://www.uhcjarvis.com/content/jarvis/en/secure/tools/eligibility_lookup.html", icon: "uhc" },
  { name: "Sunfire Matrix", url: "https://app.sunfirematrix.com", icon: "sunfire" },
  { name: "MARx (CMS)", url: "https://www.cms.gov/medicare/enrollment-renewal/providers-suppliers/internet-based-marx", icon: "cms" },
  { name: "Aetna / Producer World", url: "https://www.aetna.com/producer.html", icon: "aetna" },
  { name: "Anthem / Broker Connect", url: "https://www.anthem.com/broker/", icon: "anthem" },
  { name: "Cigna / Brokers", url: "https://cignaforbrokers.com", icon: "cigna" },
  { name: "Devoted Agent Portal", url: "https://www.devoted.com/agents", icon: "devoted" },
  { name: "Humana / Vantage", url: "https://www.humana.com/agent", icon: "humana" },
  { name: "UHC / Jarvis", url: "https://www.uhcjarvis.com", icon: "uhc" },
  { name: "WellCare / Broker Portal", url: "https://www.wellcare.com/broker", icon: "wellcare" },
  { name: "Medicare.gov", url: "https://www.medicare.gov", icon: "cms" },
];

/* ── Compliance quick-copy prompts ── */
const COMPLIANCE_PROMPTS = [
  { label: "TPMO Disclaimer", text: "We do not offer every plan available in your area. Any information we provide is limited to those plans we do offer in your area. Please contact Medicare.gov or 1-800-MEDICARE to get information on all of your options." },
  { label: "Scope of Appointment", text: "This call will be limited to discussing [Medicare Advantage / Part D / Medicare Supplement] plans. I need your verbal permission to continue discussing these plan types. Do I have your consent?" },
  { label: "Permission to Discuss", text: "Before we review any specific plan details, I need to confirm — do I have your permission to discuss Medicare plan options with you today?" },
  { label: "Enrollment Recap", text: "To confirm — I've enrolled you in [Plan Name] effective [Date]. You'll receive your new member materials in the mail within 7–10 business days. Your new plan ID card will be included." },
  { label: "Rx Disclaimer", text: "Formularies, pharmacy networks, and provider networks may change at any time. You will receive notice when necessary. The formulary and provider network can change on January 1st of each year." },
  { label: "Provider Network", text: "If you use providers or facilities outside of the plan's network, you may pay more or the plan may not cover services at all, except in an emergency. Please verify your providers are in-network before enrolling." },
];

/* ── SEP Effective Date rules ── */
const SEP_DATE_RULES = [
  { reason: "ICEP (Initial Coverage)", effective: "1st of the month Part A & B are both active" },
  { reason: "OEP (Open Enrollment Jan–Mar)", effective: "1st of the month after plan receives enrollment" },
  { reason: "AEP (Oct 15 – Dec 7)", effective: "January 1 of the following year" },
  { reason: "Move / Change of Address", effective: "1st of the month after plan receives enrollment" },
  { reason: "Loss of Creditable Coverage", effective: "1st of the month after plan receives enrollment" },
  { reason: "Loss of Medicaid", effective: "1st of the month after plan receives enrollment" },
  { reason: "Dual / LIS (Monthly)", effective: "1st of the month after plan receives enrollment" },
  { reason: "5-Star SEP", effective: "1st of the month after plan receives enrollment" },
  { reason: "FEMA Disaster", effective: "1st of the month after plan receives enrollment" },
  { reason: "Institutional (SNF/LTCF)", effective: "1st of the month after plan receives enrollment" },
  { reason: "C-SNP (Chronic Condition)", effective: "1st of the month after plan receives enrollment, or up to 3 months retroactive" },
  { reason: "Employer / COBRA Loss", effective: "1st of the month after plan receives enrollment" },
];

/* ── Doc checklist by scenario ── */
const DOC_CHECKLISTS = [
  { scenario: "Moving SEP", docs: ["Proof of new address (utility bill, lease, mortgage)", "Prior plan ID if switching", "MBI / Medicare card"] },
  { scenario: "Loss of Coverage", docs: ["Creditable coverage letter or termination notice", "Dates of prior coverage", "MBI / Medicare card"] },
  { scenario: "Medicaid Loss", docs: ["Medicaid termination notice with date", "MBI / Medicare card", "State Medicaid contact info for verification"] },
  { scenario: "FEMA Disaster", docs: ["FEMA declaration number", "Proof of residence in declared county", "MBI / Medicare card"] },
  { scenario: "C-SNP Enrollment", docs: ["Physician attestation / diagnosis confirmation", "MBI / Medicare card", "Provider NPI in plan network"] },
  { scenario: "D-SNP Enrollment", docs: ["Medicaid ID / eligibility verification", "MBI / Medicare card", "Current medication list"] },
];

/* ── Carrier note matrix ── */
const CARRIER_NOTES = [
  { carrier: "Humana", mbi: "Required before enrollment", method: "Vantage portal, phone, paper", release: "Early Sept (AEP)", quirks: "Strict SEP documentation — requires proof uploaded within 48hrs" },
  { carrier: "UnitedHealthcare", mbi: "Required before enrollment", method: "Jarvis portal, phone, paper", release: "Mid Sept (AEP)", quirks: "MBI lookup in Jarvis. Fastest electronic enrollment processing" },
  { carrier: "Aetna", mbi: "Required before enrollment", method: "Producer World, phone, paper", release: "Late Sept (AEP)", quirks: "Plan changes processed next business day. Producer World SSO required" },
  { carrier: "Anthem / BCBS", mbi: "Required before enrollment", method: "Broker Connect, phone, paper", release: "Early Oct (AEP)", quirks: "Varies by BCBS affiliate — verify state-specific portal" },
  { carrier: "Cigna", mbi: "Required before enrollment", method: "Broker portal, phone, paper", release: "Mid Sept (AEP)", quirks: "HealthSpring plans in some states. Confirm plan vs entity name" },
  { carrier: "Devoted Health", mbi: "Required before enrollment", method: "Agent portal, phone", release: "Early Oct (AEP)", quirks: "No paper apps. Agent portal only. Strong concierge model" },
  { carrier: "WellCare (Centene)", mbi: "Required before enrollment", method: "Broker portal, Sunfire, phone", release: "Late Sept (AEP)", quirks: "Some Ambetter crossover — confirm correct entity for MA vs ACA" },
  { carrier: "Mutual of Omaha", mbi: "N/A (MedSup)", method: "Agent portal, paper", release: "N/A (year-round)", quirks: "MedSup only. No MA plans. Issue-age in most states" },
];

/* ── Enrollment period timeline ── */
const TIMELINE_PERIODS = [
  { label: "AEP", start: "Oct 15", end: "Dec 7", color: "#E8002D", desc: "Annual Enrollment Period — switch MA/PDP" },
  { label: "OEP", start: "Jan 1", end: "Mar 31", color: "#FFD700", desc: "Open Enrollment — MA members only, one change" },
  { label: "IEP", start: "3 mo before 65th", end: "3 mo after 65th", color: "#39FF88", desc: "Initial Enrollment Period — first-time Medicare" },
  { label: "GI", start: "6 mo window", end: "From Part B start", color: "#22D3EE", desc: "Medigap Guaranteed Issue — no health questions" },
];

/* ═══════════════════════════════════════════════════════════════════════
   SUBCOMPONENTS
   ═══════════════════════════════════════════════════════════════════════ */

function Section({ title, icon, children, defaultOpen = false, searchMatch = true, color = "#E8002D" }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!searchMatch) return null;

  return (
    <div className="at-section" data-open={open || undefined}>
      <button className="at-section-toggle" onClick={() => setOpen(!open)} type="button">
        <div className="at-section-left">
          <span className="at-section-dot" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
          <span className="at-section-icon">{icon}</span>
          <span className="at-section-title">{title}</span>
        </div>
        <span className="at-section-arrow" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
      </button>
      {open && <div className="at-section-body">{children}</div>}
    </div>
  );
}

function LinkGrid({ items }) {
  return (
    <div className="at-link-grid">
      {items.map((item) => (
        <a key={item.name} href={item.url} target="_blank" rel="noopener noreferrer" className="at-link-card">
          <span className="at-link-name">{item.name}</span>
          <span className="at-link-desc">{item.desc}</span>
          <ExternalLink size={11} className="at-link-arrow" />
        </a>
      ))}
    </div>
  );
}

function CarrierIcon({ type }) {
  const s = { size: 14, strokeWidth: 2 };
  const map = {
    humana: <Circle {...s} color="#fbbf24" fill="#fbbf24" />,
    uhc: <Circle {...s} color="#60a5fa" fill="#60a5fa" />,
    sunfire: <Flame {...s} color="#f97316" />,
    cms: <Landmark {...s} color="#cbd5e1" />,
    aetna: <Building2 {...s} color="#60a5fa" />,
    anthem: <Shield {...s} color="#60a5fa" />,
    cigna: <Circle {...s} color="#34d399" fill="#34d399" />,
    devoted: <Heart {...s} color="#f87171" />,
    wellcare: <Circle {...s} color="#c084fc" fill="#c084fc" />,
  };
  return map[type] || <Building2 {...s} color="#cbd5e1" />;
}

function CompliancePrompts() {
  const [copied, setCopied] = useState(null);
  const copy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div className="at-compliance-grid">
      {COMPLIANCE_PROMPTS.map((p) => (
        <button
          key={p.label}
          className="at-compliance-btn"
          onClick={() => copy(p.text, p.label)}
          type="button"
        >
          <span className="at-compliance-label">{p.label}</span>
          <span className="at-compliance-status">
            {copied === p.label ? "Copied" : "Copy"}
          </span>
        </button>
      ))}
    </div>
  );
}

function SEPCalculator() {
  const [reason, setReason] = useState("");
  const selected = SEP_DATE_RULES.find((r) => r.reason === reason);

  return (
    <div className="at-calc">
      <div className="at-calc-label">SEP Reason</div>
      <select
        className="at-calc-select"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      >
        <option value="">Select SEP type...</option>
        {SEP_DATE_RULES.map((r) => (
          <option key={r.reason} value={r.reason}>{r.reason}</option>
        ))}
      </select>
      {selected && (
        <div className="at-calc-result">
          <span className="at-calc-result-label">Effective Date Rule</span>
          <span className="at-calc-result-value">{selected.effective}</span>
        </div>
      )}
    </div>
  );
}

function DocChecklist() {
  const [scenario, setScenario] = useState("");
  const selected = DOC_CHECKLISTS.find((d) => d.scenario === scenario);

  return (
    <div className="at-calc">
      <div className="at-calc-label">Enrollment Scenario</div>
      <select
        className="at-calc-select"
        value={scenario}
        onChange={(e) => setScenario(e.target.value)}
      >
        <option value="">Select scenario...</option>
        {DOC_CHECKLISTS.map((d) => (
          <option key={d.scenario} value={d.scenario}>{d.scenario}</option>
        ))}
      </select>
      {selected && (
        <div className="at-checklist">
          {selected.docs.map((doc, i) => (
            <label key={i} className="at-checklist-item">
              <input type="checkbox" />
              <span>{doc}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineBar() {
  return (
    <div className="at-timeline">
      {TIMELINE_PERIODS.map((p) => (
        <div key={p.label} className="at-timeline-row">
          <div className="at-timeline-badge" style={{ background: `${p.color}18`, border: `1px solid ${p.color}40`, color: p.color }}>
            {p.label}
          </div>
          <div className="at-timeline-range">{p.start} — {p.end}</div>
          <div className="at-timeline-desc">{p.desc}</div>
        </div>
      ))}
    </div>
  );
}

function CarrierMatrix() {
  const [expanded, setExpanded] = useState(null);
  return (
    <div className="at-matrix">
      {CARRIER_NOTES.map((c) => (
        <div
          key={c.carrier}
          className="at-matrix-row"
          data-open={expanded === c.carrier || undefined}
          onClick={() => setExpanded(expanded === c.carrier ? null : c.carrier)}
        >
          <div className="at-matrix-header">
            <span className="at-matrix-name">{c.carrier}</span>
            <span className="at-matrix-mbi">{c.mbi}</span>
          </div>
          {expanded === c.carrier && (
            <div className="at-matrix-detail">
              <div><span className="at-matrix-key">Enrollment Method:</span> {c.method}</div>
              <div><span className="at-matrix-key">AEP Plan Release:</span> {c.release}</div>
              <div><span className="at-matrix-key">Notes:</span> {c.quirks}</div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SEPReference({ script }) {
  return (
    <div className="at-sep-ref">
      <div className="at-sep-ref-header">
        <div>
          <h4 style={{ margin: "0 0 4px" }}>{script.title}</h4>
          <p style={{ margin: 0, fontSize: "0.78em", color: "var(--text-muted)" }}>{script.subtitle}</p>
        </div>
        <span className="at-badge-warning">Internal Use Only</span>
      </div>

      <div className="at-sep-ref-note">{script.instructions}</div>

      {script.sections.map((section) => (
        <div key={section.id} className="at-sep-section">
          <div className="at-sep-section-title">{section.name}</div>
          <div className="at-sep-items">
            {section.items.map((item) => (
              <article key={item.id} className="at-sep-item">
                <div className="at-sep-ask">{item.ask}</div>
                <div className="at-sep-meta">
                  <span className="at-sep-label">Allowed actions</span>
                  <ul>{item.allowed_actions.map((a) => <li key={a}>{a}</li>)}</ul>
                </div>
                <div className="at-sep-meta">
                  <span className="at-sep-label">Enrollment window</span>
                  <p style={{ margin: 0 }}>{item.window}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      ))}

      <div className="at-sep-ref-note">{script.footer}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════ */

export default function AgentTools() {
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const q = search.toLowerCase().trim();

  const m = (text) => !q || text.toLowerCase().includes(q);

  const matches = useMemo(() => {
    if (!q) {
      return {
        assist: true,
        refs: true,
        enroll: true,
        provider: true,
        carrier: true,
        utils: true,
        seps: true,
        maps: true,
      };
    }
    return {
      assist: m("objection handler rebuttal decision tree product triage routing medicare aca u65 medsup plan fit"),
      refs: m("federal register ecfr regulation compliance marketing guidelines hpms manual cms rules"),
      enroll: m("enrollment eligibility plan compare medicaid extra help ssa fema 1800 medicare disenrollment"),
      provider: m("care compare npi oig exclusion pharmacy prescription provider drug"),
      carrier: m("carrier portal humana uhc aetna anthem cigna devoted wellcare sunfire marx mbi lookup"),
      utils: m("sep calculator compliance disclaimer scope tpmo checklist timeline aep oep iep carrier matrix notes doc"),
      seps: m("special enrollment period sep moving medicaid extra help institutional life events employer 5-star dual chronic"),
      maps: m("fema disaster sep zones medicaid map"),
    };
  }, [q]);

  return (
    <div className="at-root">
      {/* ── Search ── */}
      <div className="at-search">
        <Search size={15} className="at-search-icon" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tools, refs, carriers..."
          className="at-search-input"
        />
        {search && (
          <button className="at-search-clear" onClick={() => setSearch("")} type="button">
            <X size={13} />
          </button>
        )}
      </div>

      {q && !Object.values(matches).some(Boolean) && (
        <div className="at-no-results">No results for "{search}"</div>
      )}

      {matches.assist && (
        <div className="at-priority-tools">
          <ObjectionHandler />
          <DecisionTree singleCardMode embedded />
        </div>
      )}

      {/* ═══ 1. OFFICIAL REFERENCES ═══ */}
      <Section
        title="Official References"
        icon={<Scale size={15} />}
        searchMatch={matches.refs}
        color="#FFD700"
      >
        <LinkGrid items={OFFICIAL_REFS} />
      </Section>

      {/* ═══ 2. ELIGIBILITY & ENROLLMENT ═══ */}
      <Section
        title="Eligibility & Enrollment"
        icon={<UserCheck size={15} />}
        searchMatch={matches.enroll}
        color="#39FF88"
      >
        <LinkGrid items={ENROLLMENT_TOOLS} />
      </Section>

      {/* ═══ 3. PROVIDER & DRUG CHECKS ═══ */}
      <Section
        title="Provider & Drug Checks"
        icon={<Stethoscope size={15} />}
        searchMatch={matches.provider}
        color="#22D3EE"
      >
        <LinkGrid items={PROVIDER_TOOLS} />
      </Section>

      {/* ═══ 4. CARRIER PORTALS ═══ */}
      <Section
        title="Carrier Portals"
        icon={<Building2 size={15} />}
        searchMatch={matches.carrier}
        color="#C084FC"
      >
        <div className="at-carrier-grid">
          {CARRIER_LINKS.map((link) => (
            <a key={link.name} href={link.url} target="_blank" rel="noopener noreferrer" className="at-carrier-card">
              <CarrierIcon type={link.icon} />
              <span className="at-carrier-name">{link.name}</span>
              <ExternalLink size={10} className="at-link-arrow" />
            </a>
          ))}
        </div>
      </Section>

      {/* ═══ 5. QUICK UTILITIES ═══ */}
      <Section
        title="Quick Utilities"
        icon={<Zap size={15} />}
        searchMatch={matches.utils}
        color="#FF9F43"
      >
        {/* SEP Effective Date Calculator */}
        <div className="at-util-block">
          <div className="at-util-header">
            <CalendarDays size={13} />
            <span>SEP Effective Date Calculator</span>
          </div>
          <SEPCalculator />
        </div>

        {/* Enrollment Period Timeline */}
        <div className="at-util-block">
          <div className="at-util-header">
            <CalendarDays size={13} />
            <span>OEP / AEP / IEP Timeline</span>
          </div>
          <TimelineBar />
        </div>

        {/* Doc Checklist */}
        <div className="at-util-block">
          <div className="at-util-header">
            <CheckSquare size={13} />
            <span>Doc Checklist by Scenario</span>
          </div>
          <DocChecklist />
        </div>

        {/* Compliance Quick Prompts */}
        <div className="at-util-block">
          <div className="at-util-header">
            <ClipboardCheck size={13} />
            <span>Compliance Quick Copy</span>
          </div>
          <CompliancePrompts />
        </div>

        {/* Carrier Note Matrix */}
        <div className="at-util-block">
          <div className="at-util-header">
            <FileText size={13} />
            <span>Carrier Note Matrix</span>
          </div>
          <CarrierMatrix />
        </div>
      </Section>

      {/* ═══ 6. SEP REFERENCE ═══ */}
      <Section
        title="Medicare Advantage SEPs"
        icon={<RotateCw size={15} />}
        searchMatch={matches.seps}
        color="#E8002D"
      >
        <SEPReference script={NGHS_SEP_SCRIPT} />
      </Section>

      {/* ═══ 7. MAPS ═══ */}
      <Section
        title="FEMA Disaster SEP Zones & Medicaid Map"
        icon={<Map size={15} />}
        searchMatch={matches.maps}
        color="#FF5A5A"
      >
        {!mapsLoaded ? (
          <div className="at-map-prompt">
            <p>Maps are large — click to load.</p>
            <button className="at-map-load-btn" onClick={() => setMapsLoaded(true)} type="button">
              Load Maps
            </button>
          </div>
        ) : (
          <>
            <h4 className="at-map-title">FEMA Disaster SEP Zones</h4>
            <iframe
              src="https://www.google.com/maps/d/embed?mid=1XUQ3Haav_eI8jD4lNnXErKMni_gyPMk&ehbc=2E312F"
              width="100%"
              height="500"
              style={{ border: 0, borderRadius: 12 }}
              loading="lazy"
              title="FEMA Disaster SEP Zones"
            />
            <h4 className="at-map-title" style={{ marginTop: 18 }}>Medicaid Eligibility by State</h4>
            <iframe
              src="https://www.google.com/maps/d/u/0/embed?mid=14aNMdQKllgQH1P81J-0U9pIoiqjLD7g&ehbc=2E312F"
              width="100%"
              height="500"
              style={{ border: 0, borderRadius: 12 }}
              loading="lazy"
              title="Medicaid Eligibility by State"
            />
          </>
        )}
      </Section>

      {/* ═══ DAILY VERSE ═══ */}
      <DailyVerse />
    </div>
  );
}

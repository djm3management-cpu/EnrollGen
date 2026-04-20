import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
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
import DecisionTree from "./DecisionTree";
import ObjectionHandler from "./ObjectionHandler";
import SEPGuide2026 from "./SEPGuide2026";
import { NGHS_SEP_SCRIPT } from "../context/SEPScript";
import "../AgentTools.css";

const TOOL_TABS = [
  { id: "all", label: "All Tools" },
  { id: "sales", label: "Sales" },
  { id: "reference", label: "Reference" },
  { id: "enrollment", label: "Enrollment" },
  { id: "carrier", label: "Carrier" },
  { id: "utilities", label: "Utilities" },
];

const BADGE_STYLES = {
  new: { label: "NEW", background: "#e8372c33", color: "#e8372c" },
  hot: { label: "HOT", background: "#f5a62333", color: "#f5a623" },
};

const OFFICIAL_REFS = [
  {
    name: "Federal Register",
    desc: "Proposed rules, final rules, and notices.",
    url: "https://www.federalregister.gov/",
  },
  {
    name: "eCFR 42 CFR 422",
    desc: "Medicare Advantage regulations.",
    url: "https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-422",
  },
  {
    name: "eCFR 42 CFR 423",
    desc: "Part D regulations.",
    url: "https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-B/part-423",
  },
  {
    name: "CMS Marketing Guidelines",
    desc: "MCMG guidance on what agents can and cannot say.",
    url: "https://www.cms.gov/medicare/health-drug-plans/managed-care-marketing",
  },
  {
    name: "HPMS Memos Archive",
    desc: "CMS operational memos and bulletins.",
    url: "https://www.cms.gov/medicare/health-drug-plans/managed-care-marketing/resource-center",
  },
  {
    name: "Medicare Managed Care Manual",
    desc: "Operating guidance across Chapters 1 to 19.",
    url: "https://www.cms.gov/regulations-and-guidance/guidance/manuals/internet-only-manuals-ioms-items/cms019326",
  },
  {
    name: "Regulations.gov",
    desc: "Comment tracking and rulemaking follow-up.",
    url: "https://www.regulations.gov/",
  },
];

const ENROLLMENT_TOOLS = [
  {
    name: "CMS Enrollment and Disenrollment Guidance",
    desc: "Current MA and Part D enrollment rules.",
    url: "https://www.cms.gov/medicare/enrollment-renewal/managed-care-eligibility-enrollment",
  },
  {
    name: "Medicare.gov Plan Compare",
    desc: "Official plan comparison tool.",
    url: "https://www.medicare.gov/plan-compare/",
  },
  {
    name: "Original Medicare Enrollment",
    desc: "Part A and B enrollment page.",
    url: "https://www.medicare.gov/basics/get-started-with-medicare/sign-up/when-does-medicare-coverage-start",
  },
  {
    name: "SSA Extra Help and LIS",
    desc: "Apply for Part D cost assistance.",
    url: "https://www.ssa.gov/medicare/part-d-extra-help",
  },
  {
    name: "State Medicaid Contacts",
    desc: "Route to state Medicaid agencies.",
    url: "https://www.medicaid.gov/about-us/contact-us/contact-your-state-page/index.html",
  },
  {
    name: "FEMA Disaster Declarations",
    desc: "Official disaster declaration lookup.",
    url: "https://www.fema.gov/disaster/declarations",
  },
  {
    name: "1-800-MEDICARE Contact",
    desc: "CMS contact and help page.",
    url: "https://www.medicare.gov/talk-to-someone",
  },
];

const PROVIDER_TOOLS = [
  {
    name: "Care Compare",
    desc: "Provider participation lookup.",
    url: "https://www.medicare.gov/care-compare/",
  },
  {
    name: "NPI Registry",
    desc: "National Provider Identifier lookup.",
    url: "https://npiregistry.cms.hhs.gov/search",
  },
  {
    name: "OIG LEIE Exclusions",
    desc: "Excluded provider search.",
    url: "https://exclusions.oig.hhs.gov/",
  },
  {
    name: "Pharmacy Network Reference",
    desc: "Preferred pharmacy and network concepts.",
    url: "https://www.medicare.gov/plan-compare/#/pharmaceutical-assistance-program",
  },
  {
    name: "Medicare Rx Payment Plan",
    desc: "Prescription Payment Plan info.",
    url: "https://www.medicare.gov/basics/costs/help/drug-costs",
  },
];

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
  { name: "Sunfire Matrix", url: "https://app.sunfirematrix.com", icon: "sunfire" },
  {
    name: "MARx (CMS)",
    url: "https://www.cms.gov/medicare/enrollment-renewal/providers-suppliers/internet-based-marx",
    icon: "cms",
  },
  { name: "Aetna / Producer World", url: "https://www.aetna.com/producer.html", icon: "aetna" },
  { name: "Anthem / Broker Connect", url: "https://www.anthem.com/broker/", icon: "anthem" },
  { name: "Cigna / Brokers", url: "https://cignaforbrokers.com", icon: "cigna" },
  { name: "Devoted Agent Portal", url: "https://www.devoted.com/agents", icon: "devoted" },
  { name: "Humana / Vantage", url: "https://www.humana.com/agent", icon: "humana" },
  { name: "UHC / Jarvis", url: "https://www.uhcjarvis.com", icon: "uhc" },
  { name: "WellCare / Broker Portal", url: "https://www.wellcare.com/broker", icon: "wellcare" },
  { name: "Medicare.gov", url: "https://www.medicare.gov", icon: "cms" },
];

const COMPLIANCE_PROMPTS = [
  {
    label: "TPMO Disclaimer",
    text: "We do not offer every plan available in your area. Any information we provide is limited to those plans we do offer in your area. Please contact Medicare.gov or 1-800-MEDICARE to get information on all of your options.",
  },
  {
    label: "Scope of Appointment",
    text: "This call will be limited to discussing Medicare Advantage, Part D, or Medicare Supplement plans. I need your verbal permission to continue discussing these plan types. Do I have your consent?",
  },
  {
    label: "Permission to Discuss",
    text: "Before we review any specific plan details, I need to confirm that I have your permission to discuss Medicare plan options with you today.",
  },
  {
    label: "Enrollment Recap",
    text: "To confirm, I enrolled you in [Plan Name] effective [Date]. You will receive your new member materials in the mail within 7 to 10 business days. Your new plan ID card will be included.",
  },
  {
    label: "Rx Disclaimer",
    text: "Formularies, pharmacy networks, and provider networks may change at any time. You will receive notice when necessary. The formulary and provider network can change on January 1 of each year.",
  },
  {
    label: "Provider Network",
    text: "If you use providers or facilities outside of the plan's network, you may pay more or the plan may not cover services at all, except in an emergency. Please verify your providers are in network before enrolling.",
  },
];

const SEP_DATE_RULES = [
  { reason: "ICEP (Initial Coverage)", effective: "1st of the month Part A and B are both active." },
  { reason: "OEP (Open Enrollment Jan-Mar)", effective: "1st of the month after the plan receives enrollment." },
  { reason: "AEP (Oct 15 - Dec 7)", effective: "January 1 of the following year." },
  { reason: "Move / Change of Address", effective: "1st of the month after the plan receives enrollment." },
  { reason: "Loss of Creditable Coverage", effective: "1st of the month after the plan receives enrollment." },
  { reason: "Loss of Medicaid", effective: "1st of the month after the plan receives enrollment." },
  { reason: "Dual / LIS (Monthly)", effective: "1st of the month after the plan receives enrollment." },
  { reason: "5-Star SEP", effective: "1st of the month after the plan receives enrollment." },
  { reason: "FEMA Disaster", effective: "1st of the month after the plan receives enrollment." },
  { reason: "Institutional (SNF/LTCF)", effective: "1st of the month after the plan receives enrollment." },
  { reason: "C-SNP (Chronic Condition)", effective: "1st of the month after the plan receives enrollment, or up to 3 months retroactive." },
  { reason: "Employer / COBRA Loss", effective: "1st of the month after the plan receives enrollment." },
];

const DOC_CHECKLISTS = [
  {
    scenario: "Moving SEP",
    docs: [
      "Proof of new address (utility bill, lease, mortgage).",
      "Prior plan ID if switching.",
      "MBI / Medicare card.",
    ],
  },
  {
    scenario: "Loss of Coverage",
    docs: [
      "Creditable coverage letter or termination notice.",
      "Dates of prior coverage.",
      "MBI / Medicare card.",
    ],
  },
  {
    scenario: "Medicaid Loss",
    docs: [
      "Medicaid termination notice with date.",
      "MBI / Medicare card.",
      "State Medicaid contact info for verification.",
    ],
  },
  {
    scenario: "FEMA Disaster",
    docs: [
      "FEMA declaration number.",
      "Proof of residence in declared county.",
      "MBI / Medicare card.",
    ],
  },
  {
    scenario: "C-SNP Enrollment",
    docs: [
      "Physician attestation or diagnosis confirmation.",
      "MBI / Medicare card.",
      "Provider NPI in plan network.",
    ],
  },
  {
    scenario: "D-SNP Enrollment",
    docs: [
      "Medicaid ID or eligibility verification.",
      "MBI / Medicare card.",
      "Current medication list.",
    ],
  },
];

const CARRIER_NOTES = [
  {
    carrier: "Humana",
    mbi: "Required before enrollment",
    method: "Vantage portal, phone, paper",
    release: "Early Sept (AEP)",
    quirks: "Strict SEP documentation. Requires proof uploaded within 48 hours.",
  },
  {
    carrier: "UnitedHealthcare",
    mbi: "Required before enrollment",
    method: "Jarvis portal, phone, paper",
    release: "Mid Sept (AEP)",
    quirks: "MBI lookup in Jarvis. Fast electronic enrollment processing.",
  },
  {
    carrier: "Aetna",
    mbi: "Required before enrollment",
    method: "Producer World, phone, paper",
    release: "Late Sept (AEP)",
    quirks: "Plan changes process next business day. Producer World SSO required.",
  },
  {
    carrier: "Anthem / BCBS",
    mbi: "Required before enrollment",
    method: "Broker Connect, phone, paper",
    release: "Early Oct (AEP)",
    quirks: "Varies by BCBS affiliate. Verify the state-specific portal.",
  },
  {
    carrier: "Cigna",
    mbi: "Required before enrollment",
    method: "Broker portal, phone, paper",
    release: "Mid Sept (AEP)",
    quirks: "HealthSpring plans in some states. Confirm plan vs entity name.",
  },
  {
    carrier: "Devoted Health",
    mbi: "Required before enrollment",
    method: "Agent portal, phone",
    release: "Early Oct (AEP)",
    quirks: "No paper apps. Agent portal only. Strong concierge model.",
  },
  {
    carrier: "WellCare (Centene)",
    mbi: "Required before enrollment",
    method: "Broker portal, Sunfire, phone",
    release: "Late Sept (AEP)",
    quirks: "Some Ambetter crossover. Confirm the correct entity for MA vs ACA.",
  },
  {
    carrier: "Mutual of Omaha",
    mbi: "N/A (MedSup)",
    method: "Agent portal, paper",
    release: "N/A (year-round)",
    quirks: "MedSup only. No MA plans. Issue-age in most states.",
  },
];

const TIMELINE_PERIODS = [
  { label: "AEP", start: "Oct 15", end: "Dec 7", color: "#E8002D", desc: "Annual Enrollment Period for MA and PDP changes." },
  { label: "OEP", start: "Jan 1", end: "Mar 31", color: "#FFD700", desc: "Open Enrollment for MA members only, one change." },
  { label: "IEP", start: "3 mo before 65th", end: "3 mo after 65th", color: "#39FF88", desc: "Initial Enrollment Period for first-time Medicare." },
  { label: "GI", start: "6 mo window", end: "From Part B start", color: "#22D3EE", desc: "Medigap guaranteed issue with no health questions." },
];

const TOOL_GROUPS = [
  {
    id: "sales",
    label: "Sales & Objections",
    color: "#e8372c",
    tools: [
      {
        id: "objection-handler",
        title: "Objection Handler",
        description: "Live rebuttal library for common resistance and compliance-safe pivots.",
        icon: <Shield size={16} />,
      },
      {
        id: "product-decision-tree",
        title: "Product Decision Tree",
        description: "Fast routing for Medicare, ACA, U65, and MedSup fit checks.",
        icon: <Zap size={16} />,
      },
      {
        id: "ma-seps",
        title: "MA SEPs",
        description: "Internal SEP script, qualifying events, and enrollment window guidance.",
        icon: <RotateCw size={16} />,
        badge: "hot",
      },
      {
        id: "sep-guide-2026",
        title: "2026 SEP Guide",
        description: "State-by-state INT, PAP, CSNP, and DST guide with mandatory disclosures and bonus tracking.",
        icon: <BookOpen size={16} />,
        badge: "new",
        color: "#2196F3",
      },
    ],
  },
  {
    id: "reference",
    label: "Reference & Compliance",
    color: "#f5a623",
    tools: [
      {
        id: "official-references",
        title: "Official References",
        description: "Federal, CMS, and regulatory links for policy-level verification.",
        icon: <Scale size={16} />,
      },
      {
        id: "citizenship-immigration-docs",
        title: "Citizenship & Immigration Docs",
        description: "ACA enrollment document reference with sample images and field lookup help.",
        icon: <FileText size={16} />,
        badge: "new",
      },
      {
        id: "fema-disaster-sep-zones",
        title: "FEMA Disaster SEP Zones",
        description: "Disaster SEP map plus Medicaid state view for quick eligibility context.",
        icon: <Map size={16} />,
      },
    ],
  },
  {
    id: "enrollment",
    label: "Eligibility & Enrollment",
    color: "#2ecc71",
    tools: [
      {
        id: "eligibility-enrollment",
        title: "Eligibility & Enrollment",
        description: "Official enrollment, disenrollment, Medicaid, and Extra Help links.",
        icon: <UserCheck size={16} />,
      },
      {
        id: "provider-drug-checks",
        title: "Provider & Drug Checks",
        description: "Provider, NPI, exclusion, and pharmacy network references.",
        icon: <Stethoscope size={16} />,
      },
    ],
  },
  {
    id: "carrier",
    label: "Carrier Portals",
    color: "#3498db",
    tools: [
      {
        id: "carrier-portals",
        title: "Carrier Portals",
        description: "Portal launchpad for MBI lookups, enrollment platforms, and carrier access.",
        icon: <Building2 size={16} />,
      },
    ],
  },
  {
    id: "utilities",
    label: "Quick Utilities",
    color: "#9b59b6",
    tools: [
      {
        id: "quick-utilities",
        title: "Quick Utilities",
        description: "SEP calculator, doc checklist, quick copy, timeline, and carrier notes.",
        icon: <Zap size={16} />,
      },
    ],
  },
];

const TOOL_MAP = Object.fromEntries(
  TOOL_GROUPS.flatMap((group) =>
    group.tools.map((tool) => [
      tool.id,
      {
        ...tool,
        groupId: group.id,
        groupLabel: group.label,
        color: group.color,
      },
    ])
  )
);

function LinkGrid({ items }) {
  return (
    <div className="at-link-grid">
      {items.map((item) => (
        <a
          key={item.name}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="at-link-card"
        >
          <span className="at-link-name">{item.name}</span>
          <span className="at-link-desc">{item.desc}</span>
          <ExternalLink size={12} className="at-link-arrow" />
        </a>
      ))}
    </div>
  );
}

function CarrierIcon({ type }) {
  const shared = { size: 14, strokeWidth: 2 };
  const iconMap = {
    humana: <Circle {...shared} color="#fbbf24" fill="#fbbf24" />,
    uhc: <Circle {...shared} color="#60a5fa" fill="#60a5fa" />,
    sunfire: <Flame {...shared} color="#f97316" />,
    cms: <Landmark {...shared} color="#cbd5e1" />,
    aetna: <Building2 {...shared} color="#60a5fa" />,
    anthem: <Shield {...shared} color="#60a5fa" />,
    cigna: <Circle {...shared} color="#34d399" fill="#34d399" />,
    devoted: <Heart {...shared} color="#f87171" />,
    wellcare: <Circle {...shared} color="#c084fc" fill="#c084fc" />,
  };

  return iconMap[type] || <Building2 {...shared} color="#cbd5e1" />;
}

function CompliancePrompts() {
  const [copied, setCopied] = useState(null);

  const handleCopy = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div className="at-compliance-grid">
      {COMPLIANCE_PROMPTS.map((prompt) => (
        <button
          key={prompt.label}
          className="at-compliance-btn"
          onClick={() => handleCopy(prompt.text, prompt.label)}
          type="button"
        >
          <span className="at-compliance-label">{prompt.label}</span>
          <span className="at-compliance-status">
            {copied === prompt.label ? "Copied" : "Copy"}
          </span>
        </button>
      ))}
    </div>
  );
}

function SEPCalculator() {
  const [reason, setReason] = useState("");
  const selectedRule = SEP_DATE_RULES.find((rule) => rule.reason === reason);

  return (
    <div className="at-calc">
      <div className="at-calc-label">SEP Reason</div>
      <select
        className="at-calc-select"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      >
        <option value="">Select SEP type...</option>
        {SEP_DATE_RULES.map((rule) => (
          <option key={rule.reason} value={rule.reason}>
            {rule.reason}
          </option>
        ))}
      </select>
      {selectedRule ? (
        <div className="at-calc-result">
          <span className="at-calc-result-label">Effective Date Rule</span>
          <span className="at-calc-result-value">{selectedRule.effective}</span>
        </div>
      ) : null}
    </div>
  );
}

function DocChecklist() {
  const [scenario, setScenario] = useState("");
  const selectedChecklist = DOC_CHECKLISTS.find((item) => item.scenario === scenario);

  return (
    <div className="at-calc">
      <div className="at-calc-label">Enrollment Scenario</div>
      <select
        className="at-calc-select"
        value={scenario}
        onChange={(event) => setScenario(event.target.value)}
      >
        <option value="">Select scenario...</option>
        {DOC_CHECKLISTS.map((item) => (
          <option key={item.scenario} value={item.scenario}>
            {item.scenario}
          </option>
        ))}
      </select>
      {selectedChecklist ? (
        <div className="at-checklist">
          {selectedChecklist.docs.map((doc) => (
            <label key={doc} className="at-checklist-item">
              <input type="checkbox" />
              <span>{doc}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TimelineBar() {
  return (
    <div className="at-timeline">
      {TIMELINE_PERIODS.map((period) => (
        <div key={period.label} className="at-timeline-row">
          <div
            className="at-timeline-badge"
            style={{
              background: `${period.color}18`,
              border: `1px solid ${period.color}40`,
              color: period.color,
            }}
          >
            {period.label}
          </div>
          <div className="at-timeline-range">
            {period.start} - {period.end}
          </div>
          <div className="at-timeline-desc">{period.desc}</div>
        </div>
      ))}
    </div>
  );
}

function CarrierMatrix() {
  const [expandedCarrier, setExpandedCarrier] = useState(null);

  return (
    <div className="at-matrix">
      {CARRIER_NOTES.map((carrier) => (
        <div
          key={carrier.carrier}
          className="at-matrix-row"
          data-open={expandedCarrier === carrier.carrier || undefined}
          onClick={() =>
            setExpandedCarrier((current) =>
              current === carrier.carrier ? null : carrier.carrier
            )
          }
        >
          <div className="at-matrix-header">
            <span className="at-matrix-name">{carrier.carrier}</span>
            <span className="at-matrix-mbi">{carrier.mbi}</span>
          </div>
          {expandedCarrier === carrier.carrier ? (
            <div className="at-matrix-detail">
              <div>
                <span className="at-matrix-key">Enrollment Method:</span> {carrier.method}
              </div>
              <div>
                <span className="at-matrix-key">AEP Plan Release:</span> {carrier.release}
              </div>
              <div>
                <span className="at-matrix-key">Notes:</span> {carrier.quirks}
              </div>
            </div>
          ) : null}
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
          <h4>{script.title}</h4>
          <p>{script.subtitle}</p>
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
                  <ul>
                    {item.allowed_actions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </div>
                <div className="at-sep-meta">
                  <span className="at-sep-label">Enrollment window</span>
                  <p>{item.window}</p>
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

function ToolCard({ tool, onOpen }) {
  const badge = tool.badge ? BADGE_STYLES[tool.badge] : null;

  return (
    <button
      className="at-tool-card"
      onClick={() => onOpen(tool.id)}
      type="button"
    >
      {badge ? (
        <span
          className="at-card-badge"
          style={{ background: badge.background, color: badge.color }}
        >
          {badge.label}
        </span>
      ) : null}

      <span
        className="at-tool-icon-badge"
        style={{
          color: tool.color,
          background: `${tool.color}1a`,
        }}
      >
        {tool.icon}
      </span>

      <span className="at-tool-title">{tool.title}</span>
      <span className="at-tool-desc">{tool.description}</span>
    </button>
  );
}

function ToolModal({ tool, onClose, children }) {
  if (!tool) return null;

  return (
    <div
      className="at-modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="at-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={tool.title}
      >
        <button className="at-modal-close" onClick={onClose} type="button" aria-label="Close">
          <X size={18} />
        </button>

        <div className="at-modal-header">
          <span
            className="at-tool-icon-badge at-tool-icon-badge-large"
            style={{
              color: tool.color,
              background: `${tool.color}1a`,
            }}
          >
            {tool.icon}
          </span>
          <div className="at-modal-copy">
            <div className="at-modal-kicker">{tool.groupLabel}</div>
            <h3 className="at-modal-title">{tool.title}</h3>
            <p className="at-modal-desc">{tool.description}</p>
          </div>
        </div>

        <div className="at-modal-body">{children}</div>
      </div>
    </div>
  );
}

function assetLabelFromName(name) {
  const cleaned = (name || "").replace(/\.[^.]+$/, "");
  if (cleaned.includes("front")) return "Front sample";
  if (cleaned.includes("back")) return "Back sample";
  if (cleaned.includes("electronic")) return "Electronic record";
  if (cleaned.includes("paper")) return "Paper card";
  if (cleaned.includes("passport")) return "Passport sample";
  if (cleaned.includes("visa")) return "Visa sample";
  return cleaned
    .split("-")
    .map((part) => {
      if (!part) return "";
      if (part.toLowerCase() === "i94") return "I-94";
      if (part.toLowerCase() === "i551") return "I-551";
      if (part.toLowerCase() === "i766") return "I-766";
      if (part.toLowerCase() === "i571") return "I-571";
      if (part.toLowerCase() === "i327") return "I-327";
      if (part.toLowerCase() === "i797a") return "I-797A";
      if (part.toLowerCase() === "ds2019") return "DS2019";
      return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
    })
    .join(" ");
}

function buildDocumentImages(documentType) {
  const images = [];

  if (documentType.image) {
    images.push({
      src: `/assets/citizenship-docs/${documentType.image}`,
      label:
        documentType.backImage || documentType.secondaryImage
          ? "Primary sample"
          : assetLabelFromName(documentType.image),
      rawName: documentType.image,
    });
  }

  if (documentType.backImage) {
    images.push({
      src: `/assets/citizenship-docs/${documentType.backImage}`,
      label: "Back sample",
      rawName: documentType.backImage,
    });
  }

  if (documentType.secondaryImage) {
    images.push({
      src: `/assets/citizenship-docs/${documentType.secondaryImage}`,
      label: assetLabelFromName(documentType.secondaryImage),
      rawName: documentType.secondaryImage,
    });
  }

  if (Array.isArray(documentType.images)) {
    documentType.images.forEach((image) => {
      images.push({
        src: `/assets/citizenship-docs/${image}`,
        label: assetLabelFromName(image),
        rawName: image,
      });
    });
  }

  return images.filter(
    (image, index, allImages) =>
      allImages.findIndex((item) => item.src === image.src) === index
  );
}

function getOverlayFieldsForImage(fields, image) {
  const imageHint = `${image.label} ${image.rawName}`.toLowerCase();
  const matchedFields = fields.filter((field) => {
    const location = (field.location || "").toLowerCase();
    if (!location) return false;
    if (imageHint.includes("back")) return location.includes("back");
    if (imageHint.includes("front")) return location.includes("front");
    if (imageHint.includes("electronic")) return location.includes("electronic");
    if (imageHint.includes("paper")) return location.includes("paper");
    if (imageHint.includes("passport")) return location.includes("passport") || location.includes("visa");
    if (imageHint.includes("visa")) return location.includes("visa") || location.includes("passport");
    return false;
  });

  return matchedFields.length ? matchedFields : fields;
}

function CitizenshipDocsReference({
  reference,
  loading,
  loadError,
  activeStatus,
  onStatusChange,
  activeDocType,
  onSelectDocType,
  onBack,
}) {
  if (loading) {
    return <div className="at-doc-loading">Loading citizenship and immigration document reference...</div>;
  }

  if (loadError) {
    return <div className="at-doc-error">{loadError}</div>;
  }

  if (!reference?.citizenshipStatuses?.length) {
    return <div className="at-doc-error">No citizenship document reference data was found.</div>;
  }

  const statuses = reference.citizenshipStatuses;
  const currentStatus =
    statuses.find((status) => status.status === activeStatus) || statuses[0];
  const currentDoc =
    currentStatus.documentTypes.find((documentType) => documentType.type === activeDocType) ||
    null;
  const generalNotes = Object.entries(reference.generalNotes || {});

  if (currentDoc) {
    const images = buildDocumentImages(currentDoc);

    return (
      <div className="at-doc-shell">
        <div className="at-doc-detail-toolbar">
          <button className="at-doc-back" onClick={onBack} type="button">
            Back
          </button>
          <div>
            <div className="at-doc-status-kicker">{currentStatus.status}</div>
            <h4 className="at-doc-detail-title">{currentDoc.type}</h4>
          </div>
        </div>

        {currentDoc.note ? <div className="at-doc-note-card">{currentDoc.note}</div> : null}

        <div className="at-doc-image-grid">
          {images.map((image) => {
            const overlayFields = getOverlayFieldsForImage(currentDoc.fields || [], image);

            return (
              <figure key={image.src} className="at-doc-image-panel">
                <img className="at-doc-image" src={image.src} alt={image.label} />
                <figcaption className="at-doc-image-label">{image.label}</figcaption>
                <div className="at-doc-overlay">
                  {overlayFields.map((field, index) => (
                    <div key={`${image.src}-${field.field}`} className="at-doc-overlay-item">
                      <span className="at-doc-overlay-index">{index + 1}</span>
                      <span>{field.field}</span>
                    </div>
                  ))}
                </div>
              </figure>
            );
          })}
        </div>

        <div className="at-doc-field-grid">
          {(currentDoc.fields || []).map((field) => (
            <article key={field.field} className="at-doc-field-card">
              <div className="at-doc-field-name">
                {field.field}
                {field.aka ? <span className="at-doc-field-alias">{field.aka}</span> : null}
              </div>
              {field.location ? (
                <div className="at-doc-field-meta">
                  <span className="at-doc-field-label">Where to find it</span>
                  <span className="at-doc-field-value">{field.location}</span>
                </div>
              ) : null}
              {field.format ? (
                <div className="at-doc-field-meta">
                  <span className="at-doc-field-label">Format</span>
                  <span className="at-doc-field-value">{field.format}</span>
                </div>
              ) : null}
              {field.example ? (
                <div className="at-doc-field-meta">
                  <span className="at-doc-field-label">Example</span>
                  <span className="at-doc-field-value">{field.example}</span>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="at-doc-shell">
      <div className="at-doc-intro">
        <h4 className="at-doc-title">{reference.title}</h4>
        <p className="at-doc-description">{reference.description}</p>
      </div>

      <div className="at-doc-status-tabs" role="tablist" aria-label="Citizenship status">
        {statuses.map((status) => (
          <button
            key={status.status}
            className={`at-doc-status-btn${status.status === currentStatus.status ? " is-active" : ""}`}
            onClick={() => onStatusChange(status.status)}
            type="button"
          >
            {status.status}
          </button>
        ))}
      </div>

      {currentStatus.note ? <div className="at-doc-note-card">{currentStatus.note}</div> : null}

      {generalNotes.length ? (
        <div className="at-doc-note-grid">
          {generalNotes.map(([key, value]) => (
            <div key={key} className="at-doc-note-card">
              <span className="at-doc-note-label">{key.replace(/([A-Z])/g, " $1").trim()}</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="at-doc-section-head">Document Types</div>
      <div className="at-doc-grid">
        {currentStatus.documentTypes.map((documentType) => (
          <button
            key={documentType.type}
            className="at-doc-card"
            onClick={() => onSelectDocType(documentType.type)}
            type="button"
          >
            <span className="at-doc-card-title">{documentType.type}</span>
            <span className="at-doc-card-note">
              {documentType.note ||
                `${documentType.fields?.length || 0} fields tracked for enrollment entry.`}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function QuickUtilitiesPanel() {
  return (
    <div className="at-util-stack">
      <div className="at-util-block">
        <div className="at-util-header">
          <CalendarDays size={13} />
          <span>SEP Effective Date Calculator</span>
        </div>
        <SEPCalculator />
      </div>

      <div className="at-util-block">
        <div className="at-util-header">
          <CalendarDays size={13} />
          <span>OEP / AEP / IEP Timeline</span>
        </div>
        <TimelineBar />
      </div>

      <div className="at-util-block">
        <div className="at-util-header">
          <CheckSquare size={13} />
          <span>Doc Checklist by Scenario</span>
        </div>
        <DocChecklist />
      </div>

      <div className="at-util-block">
        <div className="at-util-header">
          <ClipboardCheck size={13} />
          <span>Compliance Quick Copy</span>
        </div>
        <CompliancePrompts />
      </div>

      <div className="at-util-block">
        <div className="at-util-header">
          <FileText size={13} />
          <span>Carrier Note Matrix</span>
        </div>
        <CarrierMatrix />
      </div>
    </div>
  );
}

function CarrierPortalPanel() {
  return (
    <div className="at-carrier-grid">
      {CARRIER_LINKS.map((link) => (
        <a
          key={link.name}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="at-carrier-card"
        >
          <CarrierIcon type={link.icon} />
          <span className="at-carrier-name">{link.name}</span>
          <ExternalLink size={11} className="at-link-arrow" />
        </a>
      ))}
    </div>
  );
}

function FemaDisasterPanel({ mapsLoaded, onLoadMaps }) {
  return !mapsLoaded ? (
    <div className="at-map-prompt">
      <p>Maps are large. Load them only when you need them.</p>
      <button className="at-map-load-btn" onClick={onLoadMaps} type="button">
        Load Maps
      </button>
    </div>
  ) : (
    <div className="at-map-stack">
      <h4 className="at-map-title">FEMA Disaster SEP Zones</h4>
      <iframe
        src="https://www.google.com/maps/d/embed?mid=1XUQ3Haav_eI8jD4lNnXErKMni_gyPMk&ehbc=2E312F"
        width="100%"
        height="500"
        style={{ border: 0, borderRadius: 12 }}
        loading="lazy"
        title="FEMA Disaster SEP Zones"
      />
      <h4 className="at-map-title">Medicaid Eligibility by State</h4>
      <iframe
        src="https://www.google.com/maps/d/u/0/embed?mid=14aNMdQKllgQH1P81J-0U9pIoiqjLD7g&ehbc=2E312F"
        width="100%"
        height="500"
        style={{ border: 0, borderRadius: 12 }}
        loading="lazy"
        title="Medicaid Eligibility by State"
      />
    </div>
  );
}

export default function AgentTools() {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedToolId, setSelectedToolId] = useState(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [citizenshipReference, setCitizenshipReference] = useState(null);
  const [citizenshipLoading, setCitizenshipLoading] = useState(true);
  const [citizenshipLoadError, setCitizenshipLoadError] = useState("");
  const [citizenshipStatus, setCitizenshipStatus] = useState("");
  const [citizenshipDocType, setCitizenshipDocType] = useState("");

  useEffect(() => {
    let alive = true;

    const loadReference = async () => {
      try {
        setCitizenshipLoading(true);
        setCitizenshipLoadError("");
        const response = await fetch(
          "/assets/citizenship-docs/citizenship-immigration-reference.json"
        );
        if (!response.ok) {
          throw new Error("Unable to load the citizenship document reference.");
        }
        const data = await response.json();
        if (!alive) return;
        setCitizenshipReference(data);
        setCitizenshipStatus(data.citizenshipStatuses?.[0]?.status || "");
      } catch (error) {
        if (!alive) return;
        setCitizenshipLoadError(error.message || "Unable to load the citizenship document reference.");
      } finally {
        if (alive) {
          setCitizenshipLoading(false);
        }
      }
    };

    loadReference();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedToolId) return undefined;

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setSelectedToolId(null);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [selectedToolId]);

  useEffect(() => {
    if (selectedToolId !== "citizenship-immigration-docs") {
      setCitizenshipDocType("");
    }
  }, [selectedToolId]);

  const query = search.trim().toLowerCase();
  const selectedTool = selectedToolId ? TOOL_MAP[selectedToolId] : null;

  const visibleGroups = useMemo(
    () =>
      TOOL_GROUPS.map((group) => ({
        ...group,
        tools: group.tools.filter((tool) => {
          const matchesTab = activeTab === "all" || group.id === activeTab;
          const matchesSearch = !query || tool.title.toLowerCase().includes(query);
          return matchesTab && matchesSearch;
        }),
      })).filter((group) => group.tools.length),
    [activeTab, query]
  );

  const modalContent = useMemo(() => {
    switch (selectedToolId) {
      case "objection-handler":
        return <ObjectionHandler />;
      case "product-decision-tree":
        return <DecisionTree singleCardMode embedded />;
      case "official-references":
        return <LinkGrid items={OFFICIAL_REFS} />;
      case "citizenship-immigration-docs":
        return (
          <CitizenshipDocsReference
            reference={citizenshipReference}
            loading={citizenshipLoading}
            loadError={citizenshipLoadError}
            activeStatus={citizenshipStatus}
            onStatusChange={(status) => {
              setCitizenshipStatus(status);
              setCitizenshipDocType("");
            }}
            activeDocType={citizenshipDocType}
            onSelectDocType={setCitizenshipDocType}
            onBack={() => setCitizenshipDocType("")}
          />
        );
      case "fema-disaster-sep-zones":
        return (
          <FemaDisasterPanel
            mapsLoaded={mapsLoaded}
            onLoadMaps={() => setMapsLoaded(true)}
          />
        );
      case "eligibility-enrollment":
        return <LinkGrid items={ENROLLMENT_TOOLS} />;
      case "provider-drug-checks":
        return <LinkGrid items={PROVIDER_TOOLS} />;
      case "carrier-portals":
        return <CarrierPortalPanel />;
      case "quick-utilities":
        return <QuickUtilitiesPanel />;
      case "ma-seps":
        return <SEPReference script={NGHS_SEP_SCRIPT} />;
      case "sep-guide-2026":
        return <SEPGuide2026 />;
      default:
        return null;
    }
  }, [
    selectedToolId,
    citizenshipReference,
    citizenshipLoading,
    citizenshipLoadError,
    citizenshipStatus,
    citizenshipDocType,
    mapsLoaded,
  ]);

  return (
    <div className="at-root">
      <div className="at-toolbar">
        <div className="at-tab-row" role="tablist" aria-label="Agent tool filters">
          {TOOL_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`at-filter-tab${activeTab === tab.id ? " is-active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="at-search-shell">
          <Search size={15} className="at-search-icon" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by tool title..."
            className="at-search-input"
          />
          {search ? (
            <button className="at-search-clear" onClick={() => setSearch("")} type="button">
              <X size={13} />
            </button>
          ) : null}
        </div>
      </div>

      {visibleGroups.length ? (
        visibleGroups.map((group) => (
          <section key={group.id} className="at-group">
            <div className="at-group-label">{group.label}</div>
            <div className="at-card-grid">
              {group.tools.map((tool) => (
                <ToolCard key={tool.id} tool={{ color: group.color, ...tool }} onOpen={setSelectedToolId} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="at-empty">No tools match "{search}".</div>
      )}

      <ToolModal tool={selectedTool} onClose={() => setSelectedToolId(null)}>
        {modalContent}
      </ToolModal>
    </div>
  );
}

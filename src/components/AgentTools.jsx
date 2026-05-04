import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Building2,
  Circle,
  ExternalLink,
  FileText,
  Flame,
  Heart,
  Landmark,
  RotateCw,
  Scale,
  Search,
  Shield,
  UserCheck,
  X,
} from "lucide-react";
import SEPGuide2026 from "./SEPGuide2026";
import CarrierQuickRef from "./CarrierQuickRef";
import { NGHS_SEP_SCRIPT } from "../context/SEPScript";
import "../AgentTools.css";

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

const TOOL_GROUPS = [
  {
    id: "sales",
    label: "Sales & Objections",
    color: "#e8372c",
    tools: [
      {
        id: "ma-seps",
        title: "MA SEPs",
        description: "Internal SEP script, qualifying events, and enrollment window guidance.",
        icon: <RotateCw size={16} />,
      },
      {
        id: "sep-guide-2026",
        title: "2026 SEP Guide",
        description: "State-by-state INT, PAP, CSNP, and DST guide with mandatory disclosures and bonus tracking.",
        icon: <BookOpen size={16} />,
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
      {
        id: "carrier-quick-ref",
        title: "Carrier Quick Reference",
        description: "Search NGHS carriers, plans, states, and key details mid-call.",
        icon: <Search size={16} />,
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

const TOOL_LIST = TOOL_GROUPS.flatMap((group) =>
  group.tools.map((tool) => ({
    color: group.color,
    ...tool,
  }))
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
  return (
    <button
      className="at-tool-card"
      onClick={() => onOpen(tool.id)}
      type="button"
    >
      <span className="at-tool-main">
        <span
          className="at-tool-icon-badge"
          style={{
            color: tool.color,
            background: `${tool.color}1a`,
          }}
        >
          {tool.icon}
        </span>

        <span className="at-tool-copy">
          <span className="at-tool-title-row">
            <span className="at-tool-title">{tool.title}</span>
          </span>
          <span className="at-tool-desc">{tool.description}</span>
        </span>
      </span>
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

export default function AgentTools() {
  const [selectedToolId, setSelectedToolId] = useState(null);
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

  const selectedTool = selectedToolId ? TOOL_MAP[selectedToolId] : null;

  const modalContent = useMemo(() => {
    switch (selectedToolId) {
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
      case "eligibility-enrollment":
        return <LinkGrid items={ENROLLMENT_TOOLS} />;
      case "carrier-portals":
        return <CarrierPortalPanel />;
      case "carrier-quick-ref":
        return <CarrierQuickRef />;
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
  ]);

  return (
    <div className="at-root">
      <div className="at-card-list">
        {TOOL_LIST.map((tool) => (
          <ToolCard key={tool.id} tool={tool} onOpen={setSelectedToolId} />
        ))}
      </div>

      <ToolModal tool={selectedTool} onClose={() => setSelectedToolId(null)}>
        {modalContent}
      </ToolModal>
    </div>
  );
}

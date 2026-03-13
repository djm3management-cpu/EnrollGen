import { useMemo, useState } from "react";

const STATES = [
  "AL",
  "AR",
  "AZ",
  "DE",
  "FL",
  "GA",
  "IN",
  "KS",
  "KY",
  "MI",
  "MO",
  "MS",
  "NC",
  "NJ",
  "NY",
  "OH",
  "PA",
  "SC",
  "TN",
  "TX",
];

const LINES = [
  { id: "ACA", label: "ACA", color: "#FFE45C", rgb: "234,179,8" },
  { id: "MedSup", label: "MED SUP", color: "#39FF88", rgb: "57,255,136" },
  { id: "U65", label: "U65", color: "#C084FC", rgb: "192,132,252" },
  { id: "MA", label: "MA", color: "#FF5A5A", rgb: "255,90,90" },
];

const STATE_MARKETPLACE_DATA = [
  {
    state: "AL",
    name: "Alabama",
    marketplace: "HealthCare.gov",
    carriers: ["Blue Cross and Blue Shield of Alabama", "UnitedHealthcare", "Celtic / Ambetter", "Oscar Health"],
    notes: "Oscar is new for 2026; Aetna exited after 2025.",
    source: "https://www.healthinsurance.org/aca-marketplace/alabama/",
  },
  {
    state: "AR",
    name: "Arkansas",
    marketplace: "HealthCare.gov (SBE-FP)",
    carriers: ["Celtic Insurance Company (Ambetter)", "HMO Partners (Health Advantage)", "QCA Health Plan", "QualChoice Life and Health", "USAble Mutual (AR Blue Cross & Blue Shield)", "USAble HMO (Octave)"],
    notes: "Six marketplace issuers continue for 2026.",
    source: "https://www.healthinsurance.org/aca-marketplace/arkansas/",
  },
  {
    state: "AZ",
    name: "Arizona",
    marketplace: "HealthCare.gov",
    carriers: ["Cigna HealthCare of AZ", "Blue Cross Blue Shield of Arizona HMO", "Imperial Insurance", "Arizona Complete Health", "Oscar Health Plan", "UnitedHealthcare of Arizona", "Antidote Health Plan of Arizona"],
    notes: "Aetna exited; BCBSAZ PPO ended and HMO continues.",
    source: "https://www.healthinsurance.org/aca-marketplace/arizona/",
  },
  {
    state: "DE",
    name: "Delaware",
    marketplace: "Delaware Marketplace",
    carriers: ["AmeriHealth Caritas", "Highmark BCBSD", "Celtic"],
    notes: "Aetna exited after 2025.",
    source: "https://www.healthinsurance.org/aca-marketplace/delaware/",
  },
  {
    state: "FL",
    name: "Florida",
    marketplace: "HealthCare.gov",
    carriers: ["AmeriHealth Caritas", "AvMed", "Blue Cross Blue Shield of Florida", "Capital Health Plan", "Centene Venture Company Florida (Celtic / Ambetter)", "Cigna Health & Life", "Cigna Healthcare of Florida (HMO)", "Florida Health Care Plan", "Health First Commercial Plans", "Health Options (Florida Blue HMO)", "Molina Healthcare of Florida", "Oscar Insurance Company of Florida", "Sunshine State Health Plan", "UnitedHealthcare", "Simply Healthcare Plans (Wellpoint)", "Community Care Network (22 Health)"],
    notes: "Community Care Network is new for 2026; Aetna exited.",
    source: "https://www.healthinsurance.org/aca-marketplace/florida/",
  },
  {
    state: "GA",
    name: "Georgia",
    marketplace: "Georgia Access",
    carriers: ["Alliant", "Ambetter from Peach State Health Plan", "Anthem Blue Cross and Blue Shield", "CareSource", "Cigna", "Kaiser", "Oscar", "UnitedHealthcare"],
    notes: "Aetna exited; Mending/Taro did not launch for 2026.",
    source: "https://www.healthinsurance.org/aca-marketplace/georgia/",
  },
  {
    state: "IN",
    name: "Indiana",
    marketplace: "HealthCare.gov",
    carriers: ["Anthem", "CareSource", "Coordinated Care", "Cigna", "UnitedHealthcare"],
    notes: "Aetna exited after 2025; five carriers remain.",
    source: "https://www.healthinsurance.org/aca-marketplace/indiana/",
  },
  {
    state: "KS",
    name: "Kansas",
    marketplace: "HealthCare.gov",
    carriers: ["Ambetter from Sunflower Health Plan / Celtic", "Blue Cross and Blue Shield of Kansas City", "Blue Cross and Blue Shield of Kansas", "Medica", "Oscar", "UnitedHealthcare"],
    notes: "Aetna exited after 2025.",
    source: "https://www.healthinsurance.org/aca-marketplace/kansas/",
  },
  {
    state: "KY",
    name: "Kentucky",
    marketplace: "Kynect",
    carriers: ["Anthem", "Ambetter / WellCare", "Molina"],
    notes: "CareSource exited after 2025.",
    source: "https://www.healthinsurance.org/aca-marketplace/kentucky/",
  },
  {
    state: "MI",
    name: "Michigan",
    marketplace: "HealthCare.gov",
    carriers: ["Blue Care Network of Michigan", "Blue Cross Blue Shield of Michigan", "Oscar Insurance Company", "McLaren Health Plan Community", "Meridian Health Plan of Michigan", "Priority Health", "UnitedHealthcare Community Plan"],
    notes: "UM Health/Michigan Care, HAP CareSource, and Molina exited after 2025.",
    source: "https://www.healthinsurance.org/aca-marketplace/michigan/",
  },
  {
    state: "MO",
    name: "Missouri",
    marketplace: "HealthCare.gov",
    carriers: ["Blue Cross Blue Shield of Kansas City", "Celtic Insurance Company", "Cox Health Systems Insurance Company", "Healthy Alliance Life (Anthem)", "Medica Insurance Company", "Oscar Insurance Company", "Medica WellFirst", "United Healthcare Insurance Company"],
    notes: "Aetna exited after 2025; Cigna had already left after 2023.",
    source: "https://www.healthinsurance.org/aca-marketplace/missouri/",
  },
  {
    state: "MS",
    name: "Mississippi",
    marketplace: "HealthCare.gov",
    carriers: ["Oscar Health", "Ambetter / Magnolia", "Cigna", "Molina", "UnitedHealthcare"],
    notes: "Oscar entered for 2026; Primewell exited. BCBSMS and Celtic are off-exchange only.",
    source: "https://www.healthinsurance.org/aca-marketplace/mississippi/",
  },
  {
    state: "NC",
    name: "North Carolina",
    marketplace: "HealthCare.gov",
    carriers: ["Ambetter / Centene", "AmeriHealth Caritas", "Blue Cross and Blue Shield of NC", "Cigna", "Oscar", "UnitedHealthcare"],
    notes: "Aetna, WellCare/Celtic, and CareSource exited after 2025.",
    source: "https://www.healthinsurance.org/aca-marketplace/north-carolina/",
  },
  {
    state: "NJ",
    name: "New Jersey",
    marketplace: "Get Covered NJ",
    carriers: ["AmeriHealth Insurance Company of NJ", "Horizon Healthcare Services", "Oscar Health", "WellCare / Ambetter", "UnitedHealthcare"],
    notes: "Aetna exited after 2025.",
    source: "https://www.healthinsurance.org/aca-marketplace/new-jersey/",
  },
  {
    state: "NY",
    name: "New York",
    marketplace: "NY State of Health",
    carriers: ["CDPHP", "Emblem", "Anthem HP", "Excellus", "Fidelis", "Healthfirst", "Highmark Western and Northeastern New York", "Independent Health Benefits Corporation", "MetroPlus", "MVP", "Oscar", "UnitedHealthcare of New York"],
    notes: "Twelve QHP insurers continue in 2026; county choice varies.",
    source: "https://www.healthinsurance.org/aca-marketplace/new-york/",
  },
  {
    state: "OH",
    name: "Ohio",
    marketplace: "HealthCare.gov",
    carriers: ["Buckeye Community Health Plan", "CareSource Ohio", "Community Insurance Company (Anthem BCBS)", "Medical Health Insuring Corp. (MedMutual)", "Molina Healthcare of Ohio", "Oscar Buckeye State Insurance Corp", "Oscar Insurance Corporation of Ohio", "Paramount Insurance Company", "Summa Insurance Company", "UnitedHealthcare of Ohio", "Antidote Health Plan of Ohio"],
    notes: "Aetna and AultCare exited after 2025.",
    source: "https://www.healthinsurance.org/aca-marketplace/ohio/",
  },
  {
    state: "PA",
    name: "Pennsylvania",
    marketplace: "Pennie",
    carriers: ["Capital Advantage Assurance", "Geisinger Health Plan", "Geisinger Quality Options", "Highmark", "Highmark Benefits Group", "Highmark Coverage Advantage", "Keystone Health Plan East", "QCC Insurance Company", "UPMC Health Plan", "UPMC Health Options", "Ambetter", "Oscar Health", "Jefferson Health Plans HMO", "Jefferson Health Plans PPO"],
    notes: "Pennsylvania Health & Wellness became Ambetter; UPMC branding updated for 2026.",
    source: "https://www.healthinsurance.org/aca-marketplace/pennsylvania/",
  },
  {
    state: "SC",
    name: "South Carolina",
    marketplace: "HealthCare.gov",
    carriers: ["Blue Cross Blue Shield of SC", "Ambetter / Absolute Total Care", "Molina", "Select Health", "UnitedHealthcare", "InStil Health"],
    notes: "All six carriers continue in 2026.",
    source: "https://www.healthinsurance.org/aca-marketplace/south-carolina/",
  },
  {
    state: "TN",
    name: "Tennessee",
    marketplace: "HealthCare.gov",
    carriers: ["Blue Cross Blue Shield of Tennessee", "Cigna", "Oscar", "Celtic / Ambetter", "UnitedHealthcare", "Alliant Health Plans"],
    notes: "All six 2025 carriers continue into 2026.",
    source: "https://www.healthinsurance.org/aca-marketplace/tennessee/",
  },
  {
    state: "TX",
    name: "Texas",
    marketplace: "HealthCare.gov",
    carriers: ["Celtic / Ambetter", "Superior Health Plan / Ambetter", "Blue Cross Blue Shield of Texas", "CHRISTUS", "Community First Insurance Plans", "Community Health Choice", "Moda", "Molina", "Oscar", "Sendero", "Baylor Scott & White Health Plan", "UnitedHealthcare", "Cigna", "Imperial Insurance Companies", "Wellpoint", "Harbor Health"],
    notes: "Harbor Health joined for 2026; Aetna exited after 2025.",
    source: "https://www.healthinsurance.org/aca-marketplace/texas/",
  },
];

const U65_STATE_RULES = [
  {
    id: "closed",
    title: "ACA-first / tighter STM market",
    states: ["NJ", "NY"],
    notes: [
      "Non-ACA lanes should be handled carefully here; treat ACA as the default baseline.",
      "If using supplemental or non-ACA options, disclose structure and limitations before price.",
    ],
  },
  {
    id: "restricted",
    title: "Restricted-duration examples",
    states: ["DE"],
    notes: [
      "Short-term medical rules are tighter than open-market states.",
      "Verify current duration and renewal rules before presenting STM as a bridge solution.",
    ],
  },
  {
    id: "open",
    title: "Variable off-exchange market",
    states: ["AL", "AR", "AZ", "FL", "GA", "IN", "KS", "KY", "MI", "MO", "MS", "NC", "OH", "PA", "SC", "TN", "TX"],
    notes: [
      "Off-exchange options can include STM, indemnity, cash-pay, and association-style lanes depending on underwriting and state rules.",
      "Use live quoting tools to verify what is currently sellable before positioning one lane as best.",
    ],
  },
];

const U65_PROFILES = [
  {
    name: "UnitedHealthcare Golden Rule",
    states: [],
  },
  {
    name: "Pivot Health",
    states: [],
  },
  {
    name: "Sidecar Health",
    states: [],
  },
  {
    name: "Farm Bureau Health Plans",
    states: ["AL", "IN", "KS", "MI", "MO", "OH", "TN", "TX"],
  },
  {
    name: "Philadelphia American / New Era",
    states: [],
  },
];

const TOOLS = {
  ACA: {
    default: { name: "HealthCare.gov Plan Preview", url: "https://www.healthcare.gov/see-plans/" },
    byState: {
      GA: { name: "Georgia Access", url: "https://www.georgia-access.com/" },
      KY: { name: "Kynect", url: "https://kynect.ky.gov/" },
      NY: { name: "NY State of Health", url: "https://nystateofhealth.ny.gov/" },
      NJ: { name: "Get Covered NJ", url: "https://www.getcoverednj.com/" },
      PA: { name: "Pennie", url: "https://pennie.com/" },
    },
  },
  MedSup: [
    { name: "Medicare Plan Compare", url: "https://www.medicare.gov/plan-compare/" },
    { name: "Anthem Broker Connect", url: "https://www.anthem.com/broker/" },
  ],
  U65: [
    { name: "Pivot Health STM", url: "https://www.pivothealth.com/short-term-health-insurance" },
    { name: "UHC Golden Rule", url: "https://www.uhone.com/health-insurance/short-term-health-insurance" },
    { name: "Farm Bureau", url: "https://www.fbhealthplans.com/" },
  ],
  MA: [
    { name: "CMS Plan Finder", url: "https://www.medicare.gov/plan-compare/" },
    { name: "Sunfire Matrix", url: "https://app.sunfirematrix.com" },
  ],
};

function FilterPill({ label, active, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `rgba(${color},0.12)` : "rgba(255,255,255,0.03)",
        border: active ? `1px solid rgba(${color},0.45)` : "1px solid rgba(255,255,255,0.08)",
        borderRadius: 999,
        padding: "6px 13px",
        cursor: "pointer",
        fontFamily: "'Barlow Condensed', sans-serif",
        fontWeight: 700,
        fontSize: "0.68rem",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: active ? `rgb(${color})` : "#5A5A6A",
        transition: "all 0.13s ease",
      }}
    >
      {label}
    </button>
  );
}

function getLineMeta(id) {
  return LINES.find((line) => line.id === id) || LINES[0];
}

function getMedSupSnapshot(state) {
  if (state === "NY") {
    return {
      summary: "Strong Medigap market with unusually consumer-friendly rules.",
      bullets: [
        "Standardized Medigap plans are available through private carriers.",
        "Use live quoting to compare price and carrier fit instead of assuming one carrier wins statewide.",
      ],
    };
  }

  if (state === "NJ") {
    return {
      summary: "Established Medigap market with stronger protections than many states.",
      bullets: [
        "Standardized Medigap plans are available through private carriers.",
        "Verify current rating and underwriting details carrier by carrier before recommending a switch.",
      ],
    };
  }

  return {
    summary: "Standardized Medigap market sold by private carriers.",
    bullets: [
      "Plan letters are standardized, but carrier price and underwriting vary.",
      "Outside guaranteed-issue windows, assume live underwriting and quote checks are needed.",
    ],
  };
}

function getU65Snapshot(state) {
  const rule =
    U65_STATE_RULES.find((item) => item.states.includes(state)) ||
    U65_STATE_RULES.find((item) => item.id === "open");
  const carriers = U65_PROFILES.filter(
    (item) => item.states.length === 0 || item.states.includes(state)
  ).map((item) => item.name);

  const tools = TOOLS.U65.filter((tool) => {
    if (tool.name === "Farm Bureau") {
      return ["AL", "IN", "KS", "MI", "MO", "OH", "TN", "TX"].includes(state);
    }
    return true;
  });

  return {
    summary: rule?.title || "Variable off-exchange market",
    bullets: [
      ...(rule?.notes || []),
      carriers.length
        ? `Notable off-exchange lanes: ${carriers.join(", ")}.`
        : "Use live off-exchange tools to confirm what is currently sellable in this state.",
    ],
    tools,
  };
}

function getAcaTool(state) {
  return TOOLS.ACA.byState[state] || TOOLS.ACA.default;
}

function SectorToolLink({ tool, color, rgb }) {
  return (
    <a
      href={tool.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        borderRadius: 999,
        padding: "4px 10px",
        border: `1px solid rgba(${rgb},0.26)`,
        background: `rgba(${rgb},0.08)`,
        color,
        textDecoration: "none",
        fontFamily: "'Barlow Condensed', sans-serif",
        fontWeight: 700,
        fontSize: "0.58rem",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
      }}
    >
      {tool.name}
    </a>
  );
}

function SectorRow({ sector }) {
  return (
    <div
      style={{
        borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.06)",
        background: "linear-gradient(145deg, rgba(21,21,26,0.98) 0%, rgba(10,10,12,0.99) 100%)",
        boxShadow:
          "inset 4px 4px 10px rgba(0,0,0,0.34), inset -2px -2px 6px rgba(255,255,255,0.015)",
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div>
        <div
          style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 800,
            fontSize: "0.74rem",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: sector.color,
            marginBottom: 3,
          }}
        >
          {sector.title}
        </div>
        <div style={{ fontSize: "0.8rem", color: "#D6DFE9", lineHeight: 1.45 }}>
          {sector.summary}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {sector.bullets.map((bullet) => (
          <div key={bullet} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: "0.77rem", color: "#AEB8C6", lineHeight: 1.5 }}>
            <span style={{ color: sector.color, marginTop: 2 }}>•</span>
            <span>{bullet}</span>
          </div>
        ))}
      </div>

      {sector.tools?.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
          {sector.tools.map((tool) => (
            <SectorToolLink key={tool.name} tool={tool} color={sector.color} rgb={sector.rgb} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StateMarketCard({ entry, activeLines }) {
  const medSup = getMedSupSnapshot(entry.state);
  const u65 = getU65Snapshot(entry.state);
  const acaTool = getAcaTool(entry.state);
  const maNote =
    "Use the built-in SEP Lookup / CMS landscape data for county and zip-level MA availability.";

  const sectors = [
    {
      id: "ACA",
      title: "ACA Marketplace",
      ...getLineMeta("ACA"),
      summary: `${entry.marketplace} · ${entry.carriers.length} carriers`,
      bullets: [entry.notes, `Carriers: ${entry.carriers.join(", ")}.`],
      tools: [acaTool],
    },
    {
      id: "MedSup",
      title: "Medicare Supplement",
      ...getLineMeta("MedSup"),
      summary: medSup.summary,
      bullets: medSup.bullets,
      tools: TOOLS.MedSup,
    },
    {
      id: "U65",
      title: "Off-Exchange / U65",
      ...getLineMeta("U65"),
      summary: u65.summary,
      bullets: u65.bullets,
      tools: u65.tools,
    },
    {
      id: "MA",
      title: "Medicare Advantage",
      ...getLineMeta("MA"),
      summary: "Database-backed MA landscape lives in SEP Lookup",
      bullets: [
        maNote,
        "Use carrier portals only after the SEP Lookup / landscape result narrows the market.",
      ],
      tools: TOOLS.MA,
    },
  ].filter((sector) => activeLines.size === 0 || activeLines.has(sector.id));

  return (
    <section
      className="card"
      style={{
        padding: "18px 20px",
        background: "linear-gradient(180deg, #181818 0%, #111111 50%, #0e0e0e 100%)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 800,
              fontSize: "0.58rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#4A4A5A",
              marginBottom: 4,
            }}
          >
            {entry.state}
          </div>
          <h3
            style={{
              margin: 0,
              color: "#F0F0F0",
              fontSize: "1.08rem",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}
          >
            {entry.name}
          </h3>
        </div>
        <a
          href={entry.source}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            borderRadius: 999,
            padding: "5px 11px",
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
            color: "#8E99A7",
            textDecoration: "none",
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 700,
            fontSize: "0.58rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          ACA Source
        </a>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sectors.map((sector) => (
          <SectorRow key={sector.id} sector={sector} />
        ))}
      </div>
    </section>
  );
}

export default function CarrierRef() {
  const [searchRaw, setSearchRaw] = useState("");
  const [activeStates, setActiveStates] = useState(new Set());
  const [activeLines, setActiveLines] = useState(new Set());

  const visibleStates = useMemo(() => {
    const query = searchRaw.toLowerCase().trim();

    return STATE_MARKETPLACE_DATA.filter((entry) => {
      if (activeStates.size > 0 && !activeStates.has(entry.state)) return false;

      if (!query) return true;

      const medSup = getMedSupSnapshot(entry.state);
      const u65 = getU65Snapshot(entry.state);

      return [
        entry.state,
        entry.name,
        entry.marketplace,
        entry.notes,
        ...entry.carriers,
        medSup.summary,
        ...medSup.bullets,
        u65.summary,
        ...u65.bullets,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [searchRaw, activeStates]);

  const hasFilters = searchRaw.trim() || activeStates.size > 0 || activeLines.size > 0;

  function toggleSetValue(setter, value) {
    setter((previous) => {
      const next = new Set(previous);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  return (
    <div
      style={{
        maxWidth: 1080,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <section
        className="card"
        style={{
          padding: "18px 20px",
          background: "linear-gradient(180deg, #181818 0%, #111111 50%, #0e0e0e 100%)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div>
          <h2 style={{ margin: "0 0 6px", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: "#E8002D" }}>◈</span>
            State Market Availability
          </h2>
          <p style={{ fontSize: "0.82rem", color: "#8E99A7", maxWidth: 760 }}>
            State first, sector second. Each state card shows what an agent needs to know for ACA,
            Med Supp, off-exchange, and MA without making them bounce between unrelated panels.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 10,
          }}
        >
          {[
            ["States In View", visibleStates.length, "#D6DFE9"],
            ["ACA States", visibleStates.length, "#FFE45C"],
            ["Med Supp", visibleStates.length, "#39FF88"],
            ["U65 + MA", visibleStates.length, "#C084FC"],
          ].map(([label, value, color]) => (
            <div
              key={label}
              style={{
                borderRadius: 14,
                padding: "12px 14px",
                border: "1px solid rgba(255,255,255,0.06)",
                background: "linear-gradient(145deg, rgba(21,21,26,0.98) 0%, rgba(10,10,12,0.99) 100%)",
                boxShadow:
                  "inset 4px 4px 10px rgba(0,0,0,0.34), inset -2px -2px 6px rgba(255,255,255,0.015)",
              }}
            >
              <div
                style={{
                  fontSize: "0.58rem",
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#5F6B7A",
                  fontFamily: "'Barlow Condensed', sans-serif",
                  marginBottom: 5,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: "1.2rem",
                  fontWeight: 800,
                  color,
                  fontFamily: "'IBM Plex Mono', monospace",
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ position: "relative" }}>
          <span
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "#3A3A4A",
              fontSize: 14,
              pointerEvents: "none",
              lineHeight: 1,
            }}
          >
            ⌕
          </span>
          <input
            type="text"
            value={searchRaw}
            onChange={(event) => setSearchRaw(event.target.value)}
            placeholder="Search state, carrier, market, or sector"
            style={{ width: "100%", paddingLeft: 34 }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: "0.6rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#3A3A4A",
                minWidth: 52,
              }}
            >
              State
            </span>
            {STATES.map((state) => (
              <FilterPill
                key={state}
                label={state}
                active={activeStates.has(state)}
                color="138,138,154"
                onClick={() => toggleSetValue(setActiveStates, state)}
              />
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: "0.6rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#3A3A4A",
                minWidth: 52,
              }}
            >
              Sector
            </span>
            {LINES.map((line) => (
              <FilterPill
                key={line.id}
                label={line.label}
                active={activeLines.has(line.id)}
                color={line.rgb}
                onClick={() => toggleSetValue(setActiveLines, line.id)}
              />
            ))}
          </div>
        </div>

        {hasFilters ? (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              className="copy-btn"
              onClick={() => {
                setSearchRaw("");
                setActiveStates(new Set());
                setActiveLines(new Set());
              }}
            >
              Clear Filters
            </button>
          </div>
        ) : null}
      </section>

      {visibleStates.length === 0 ? (
        <section
          className="card"
          style={{
            padding: "24px 20px",
            textAlign: "center",
            color: "#6F7D8E",
            background: "linear-gradient(180deg, #181818 0%, #111111 50%, #0e0e0e 100%)",
          }}
        >
          No state market view matches the current search or filters.
        </section>
      ) : (
        visibleStates.map((entry) => (
          <StateMarketCard key={entry.state} entry={entry} activeLines={activeLines} />
        ))
      )}
    </div>
  );
}

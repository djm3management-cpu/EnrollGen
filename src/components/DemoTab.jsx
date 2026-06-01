import { useMemo, useState } from "react";
import { ScriptProvider, useScript } from "../context/ScriptContext";
import { SECTION_LABELS } from "../context/scriptReducer";
import { getDefaultScriptSections } from "../data/defaultScriptTemplates";
import CollapsibleWidget from "./CollapsibleWidget";
import MiniLiveTranscript from "./MiniLiveTranscript";
import ProgressDots from "./ProgressDots";
import ScriptSection from "./ScriptSection";
import { ALL_INTENTS, INTENT_CATEGORIES } from "../compliance/intents";

const DEMO_FLOWS = [
  {
    id: "MA",
    label: "Medicare Advantage",
    scriptType: "ma",
    transcript: [
      {
        time: "00:00",
        speaker: "Agent",
        sentiment: "positive",
        text: "Hi Patricia, this is Alex with EnrollGen Health. I am calling about your Medicare Advantage options and this call is being recorded.",
        intents: ["call_opening", "recording_disclosure"],
        flags: [
          {
            status: "cleared",
            code: "REC-01",
            label: "Recording disclosure captured",
            detail: "Opening disclosure and purpose detected.",
          },
        ],
      },
      {
        time: "00:11",
        speaker: "Customer",
        sentiment: "neutral",
        text: "Yes, that is fine. I want to make sure my doctor and prescriptions are still covered next year.",
        intents: ["provider_need", "rx_need"],
        flags: [
          {
            status: "upcoming",
            code: "NEEDS",
            label: "Provider and Rx needs detected",
            detail: "Copilot queues provider, pharmacy, and drug checks.",
          },
        ],
      },
      {
        time: "00:23",
        speaker: "Agent",
        sentiment: "positive",
        text: "Before we review plans, I have your permission to discuss Medicare Advantage plans available in your county today.",
        intents: ["soa_verification"],
        flags: [
          {
            status: "cleared",
            code: "SOA",
            label: "Scope of appointment verified",
            detail: "MA plan type permission matched to script requirement.",
          },
        ],
      },
      {
        time: "00:39",
        speaker: "Customer",
        sentiment: "neutral",
        text: "Yes, Medicare Advantage is what I asked about. I live in Maricopa County and use Walgreens.",
        intents: ["county", "pharmacy"],
        flags: [
          {
            status: "upcoming",
            code: "GEO",
            label: "County and pharmacy captured",
            detail: "RAG context ready for service-area and pharmacy checks.",
          },
        ],
      },
      {
        time: "00:55",
        speaker: "Agent",
        sentiment: "positive",
        text: "I am checking the formulary, network, premium, maximum out of pocket, dental, vision, and hearing before I summarize anything.",
        intents: ["plan_presentation", "benefit_review"],
        flags: [
          {
            status: "due",
            code: "PLAN",
            label: "Plan presentation in progress",
            detail: "Required benefit categories are being tracked.",
          },
        ],
      },
      {
        time: "01:14",
        speaker: "Customer",
        sentiment: "negative",
        text: "Will this replace my current coverage, and could my specialist be out of network?",
        intents: ["impact_coverage", "network_risk"],
        flags: [
          {
            status: "due",
            code: "IMPACT",
            label: "Coverage impact question",
            detail: "Agent must explain replacement and network limitations.",
          },
        ],
      },
      {
        time: "01:31",
        speaker: "Agent",
        sentiment: "positive",
        text: "It may replace how you receive Parts A and B benefits. We need to verify the specialist before enrollment and review out-of-network rules.",
        intents: ["impact_coverage", "sales_conduct"],
        flags: [
          {
            status: "cleared",
            code: "IMPACT",
            label: "Impact explained",
            detail: "Replacement language and network limitation guidance detected.",
          },
        ],
      },
      {
        time: "01:51",
        speaker: "Agent",
        sentiment: "positive",
        text: "If you choose to apply, I will read the required enrollment statements and send the completed call record into CRM for follow-up.",
        intents: ["enrollment_closing", "crm_webhook"],
        flags: [
          {
            status: "cleared",
            code: "CRM",
            label: "Webhook payload staged",
            detail: "Call outcome, transcript, scorecard, and tasks are ready.",
          },
        ],
      },
    ],
  },
];

const RUNTIME_INTENTS = [
  ["ENGINE_001_DUAL_AUDIO_CHANNEL_PRESENT", "Dual audio channels captured"],
  ["ENGINE_002_SPEAKER_DIARIZATION_CONFIDENCE", "Speaker diarization confidence checked"],
  ["ENGINE_003_TIMESTAMP_COVERAGE_COMPLETE", "Transcript timestamps cover the full call"],
  ["ENGINE_004_TRANSCRIPT_REDACTION_COMPLETE", "PHI and PII redaction completed"],
  ["ENGINE_005_RAG_CONTEXT_RETRIEVED", "pgvector RAG context retrieved"],
  ["ENGINE_006_SCORECARD_TEMPLATE_APPLIED", "MA scorecard template applied"],
  ["ENGINE_007_SEQUENCE_GRAPH_VALIDATED", "Required intent sequence graph validated"],
  ["ENGINE_008_AUTO_FAIL_RULES_EVALUATED", "Auto-fail rules evaluated"],
  ["ENGINE_009_CRM_PAYLOAD_COMPLETE", "CRM payload completeness checked"],
].map(([intent_code, intent_name]) => ({
  intent_code,
  intent_name,
  category: "ENGINE_RUNTIME_CHECKS",
  failure_severity: "info",
  auto_fail: false,
}));
const ENGINE_INTENTS = [...ALL_INTENTS, ...RUNTIME_INTENTS].slice(0, 152);
const ENGINE_INTENT_CATEGORIES = {
  ...INTENT_CATEGORIES,
  ENGINE_RUNTIME_CHECKS: RUNTIME_INTENTS,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function copilotLevel(status) {
  if (status === "cleared") return "tip";
  if (status === "due") return "warn";
  return "remind";
}

function formatCategoryName(category) {
  return String(category || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getSectionNumber(section, fallback) {
  return Number(section?.section_number || fallback);
}

function DemoExperience() {
  const { state, dispatch, activeSection } = useScript();
  const [started, setStarted] = useState(false);
  const [intentPopupOpen, setIntentPopupOpen] = useState(false);
  const activeFlow = DEMO_FLOWS[0];
  const scriptSections = useMemo(
    () => getDefaultScriptSections(activeFlow.scriptType),
    [activeFlow.scriptType]
  );
  const totalStages = Math.max(scriptSections.length, activeFlow.transcript.length, 1);
  const activeIndex = Math.max(
    0,
    scriptSections.findIndex((section, index) => getSectionNumber(section, index + 1) === activeSection)
  );
  const currentScriptSection = scriptSections[activeIndex] || scriptSections[0] || null;
  const visibleCount = !started
    ? 0
    : Math.min(activeFlow.transcript.length, activeIndex + 1);
  const visibleEvents = activeFlow.transcript.slice(0, visibleCount);
  const visibleFlags = visibleEvents.flatMap((event) =>
    event.flags.map((flag) => ({ ...flag, time: event.time }))
  );
  const recentDialogueEvents = visibleEvents.slice(-2);
  const engineStep = !started
    ? 0
    : clamp(Math.round(((activeIndex + 1) / totalStages) * 152), 1, 152);
  const mergedTranscriptEntries = visibleEvents.map((event, index) => ({
    speaker: event.speaker.toLowerCase(),
    text: event.text,
    isFinal: true,
    timestamp: `${event.time}-${index}`,
  }));
  const progressSections = scriptSections
    .filter((section) => section.key !== "wrapup")
    .map((section, index) => {
      const sectionNum = getSectionNumber(section, index + 1);
      const gateDone = section.gate_field ? Boolean(state[section.gate_field]) : false;
      let status = "pending";
      if (gateDone) status = "done";
      else if (started && sectionNum === activeSection) status = "active";
      return {
        key: section.key,
        label: section.title || SECTION_LABELS[sectionNum] || `Section ${sectionNum}`,
        status,
        sectionNum,
      };
    });

  return (
    <div className="flow" aria-label="EnrollGen MA demo">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 296px) minmax(0, 1fr)",
          gap: 14,
          alignItems: "start",
          width: "100%",
        }}
      >
        <aside style={{ minWidth: 0 }}>
          <CollapsibleWidget
            title="Live Transcript"
            defaultCollapsed={false}
            headerRight={
              <span className="transcript-timer">{started ? `${visibleEvents.length}` : "0"}</span>
            }
          >
            {started ? (
              <MiniLiveTranscript
                mergedEntries={mergedTranscriptEntries}
                listening={started}
                highlightSpeakers
              />
            ) : (
              <div style={{ height: 148 }} />
            )}
          </CollapsibleWidget>

          <CollapsibleWidget
            title="Co-Pilot"
            defaultCollapsed={false}
            headerRight={
              <span className="transcript-timer">{started ? visibleFlags.length : 0}</span>
            }
          >
            <div className="copilot-feed-mini">
              <div
                className="right-rail-scroll copilot-feed-mini__scroll"
                style={{ height: "clamp(220px, 38vh, 520px)" }}
              >
                {visibleFlags.map((flag) => (
                  <div
                    key={`${flag.time}-${flag.code}-${flag.label}`}
                    className={`copilot-feed-mini__entry copilot-msg copilot-msg--${copilotLevel(flag.status)}`}
                  >
                    <span className="copilot-feed-mini__text">
                      {flag.time} {flag.code}: {flag.label}. {flag.detail}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleWidget>

          <button
            type="button"
            className="copilot-pill-button copilot-pill-button--analyze"
            onClick={() => setIntentPopupOpen(true)}
            style={{
              width: "100%",
              justifyContent: "space-between",
              marginTop: 8,
            }}
          >
            <span>152 Intent Engine</span>
            <span>{engineStep}/152</span>
          </button>
        </aside>

        <div className="flow-shell">
          <div className="flow-main">
            {!started ? (
              <section className="script-start-call-gate script-start-call-gate--manual">
                <button
                  type="button"
                  className="script-start-call-button"
                  onClick={() => {
                    setStarted(true);
                    dispatch({ type: "MARK_SECTION_START", section: 1 });
                  }}
                >
                  START
                </button>
              </section>
            ) : (
              <>
                {currentScriptSection ? <ScriptSection section={currentScriptSection} /> : null}

                <section className="card">
                  <h2 className="script-section-title">
                    <span>Call Response</span>
                  </h2>
                  {recentDialogueEvents.length ? (
                    <div className="mini-live-transcript" style={{ padding: "6px 0" }}>
                      {recentDialogueEvents.map((event) => {
                        const isCustomer = event.speaker === "Customer";
                        return (
                          <div
                            key={`${event.time}-${event.speaker}`}
                            className={`mini-live-transcript__row ${
                              isCustomer ? "is-customer" : "is-agent"
                            } is-latest`}
                            style={{
                              display: "flex",
                              gap: 5,
                              padding: "7px 9px",
                              marginBottom: 6,
                              borderBottom: "1px solid rgba(255,255,255,0.03)",
                              borderLeft: "2px solid transparent",
                              backgroundColor: isCustomer
                                ? "rgba(105, 167, 200, 0.12)"
                                : "rgba(217, 139, 69, 0.1)",
                            }}
                          >
                            <span
                              className="mini-live-transcript__text"
                              style={{
                                fontFamily: "var(--font-body)",
                                lineHeight: 1.5,
                                overflowWrap: "break-word",
                                minWidth: 0,
                              }}
                            >
                              <span
                                className="mini-live-transcript__speaker"
                                style={{
                                  marginRight: 5,
                                }}
                              >
                                {isCustomer ? "CUSTOMER" : "AGENT"}
                              </span>
                              {event.text}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </section>

                <ProgressDots sections={progressSections} />
              </>
            )}
          </div>
        </div>
      </div>

      {intentPopupOpen ? (
        <div className="top-panel-overlay top-panel-overlay--compliance" role="dialog" aria-modal="true" aria-label="152 intent engine">
          <div className="top-panel-header">
            <div className="top-panel-title">152-Intent Engine</div>
            <button
              type="button"
              className="top-panel-close"
              onClick={() => setIntentPopupOpen(false)}
              aria-label="Close intent engine"
            >
              X
            </button>
          </div>
          <div className="top-panel-body">
            <section className="operations-tab" aria-label="All 152 compliance intents">
              <div className="ops-command-line">
                <span>MA COMPLIANCE TAXONOMY</span>
                <span className="ops-command-market">{ENGINE_INTENTS.length}/152 INTENTS</span>
              </div>
              <div className="ops-terminal-tabs">
                <span className="ops-tab-amber">CATEGORY</span>
                <span className="ops-tab-red">AUTO FAIL</span>
                <span className="ops-tab-red">SEVERITY</span>
                <span className="ops-tab-blue">SEQUENCE</span>
                <span className="ops-tab-fill">Intent classifier inventory</span>
              </div>
              {Object.entries(ENGINE_INTENT_CATEGORIES).map(([category, intents]) => (
                <div key={category} className="ops-calls-panel">
                  <div className="ops-section-head">
                    <span>{formatCategoryName(category)}</span>
                    <span className="ops-section-meta">{intents.length} INTENTS</span>
                  </div>
                  <div className="ops-table-wrap">
                    <table className="ops-table">
                      <thead>
                        <tr>
                          <th className="row-n">#</th>
                          <th>Intent Code</th>
                          <th>Name</th>
                          <th>Severity</th>
                          <th>Required</th>
                          <th>Auto Fail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {intents.map((intent, index) => (
                          <tr key={intent.intent_code}>
                            <td className="row-n">{index + 1}</td>
                            <td>{intent.intent_code}</td>
                            <td>{intent.intent_name}</td>
                            <td>{String(intent.failure_severity || "info").toUpperCase()}</td>
                            <td className={intent.is_required ? "ops-out-enrolled" : "ops-out-pending"}>
                              {intent.is_required ? "YES" : "NO"}
                            </td>
                            <td className={intent.auto_fail ? "ops-out-incomplete" : "ops-out-pending"}>
                              {intent.auto_fail ? "YES" : "NO"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DemoTab() {
  return (
    <ScriptProvider>
      <DemoExperience />
    </ScriptProvider>
  );
}

export default DemoTab;

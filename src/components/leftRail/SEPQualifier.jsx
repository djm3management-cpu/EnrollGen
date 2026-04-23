import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeAlert,
  BadgeX,
  CalendarDays,
  ChevronDown,
  CloudLightning,
  FileText,
  Hospital,
  House,
  Minimize2,
  Phone,
  RotateCcw,
} from "lucide-react";
import {
  SEP_QUALIFIER_CATEGORIES,
  SEP_QUALIFIER_CATEGORY_MAP,
  SEP_QUALIFIER_QUESTIONS,
} from "../../data/sepQualifierData";
import {
  getStateSepInfo,
  resolveStateCode,
  STATE_SEP_TYPE_META,
} from "../../data/stateSepData";
import QuickNotes from "../QuickNotes";
import SNPRoutingWidget from "./SNPRoutingWidget";

const OPENER_SCRIPT =
  "Before I can help you look at plan options, I need to make sure you're eligible to make a change right now. Outside of the annual enrollment period, Medicare only allows changes during what's called a Special Enrollment Period. I'm going to ask you a few quick questions to see if you qualify - should only take about a minute.";

const VERIFICATION_SCRIPT =
  "Has anything changed in your life recently - like moving, losing other coverage, leaving an employer plan, or gaining Medicaid? Or were you affected by a recent natural disaster?";

const NO_SEP_NOTICE =
  "If none of these apply, the client does not currently have a Special Enrollment Period. They can enroll during AEP (Oct 15 - Dec 7) or OEP (Jan 1 - Mar 31 for existing MA members). Set a follow-up callback.";

const CATEGORY_ICON_MAP = {
  house: House,
  "badge-x": BadgeX,
  "badge-alert": BadgeAlert,
  "calendar-days": CalendarDays,
  hospital: Hospital,
  "cloud-lightning": CloudLightning,
  "file-text": FileText,
};

function renderCategoryIcon(iconKey, color) {
  const Icon = CATEGORY_ICON_MAP[iconKey] || FileText;
  return <Icon size={18} strokeWidth={2.2} style={{ color }} />;
}

function getFemaEndStatus(femaEnd) {
  if (!femaEnd) {
    return null;
  }

  const [monthText, dayText] = femaEnd.split("/");
  const month = Number(monthText);
  const day = Number(dayText);

  if (!month || !day) {
    return {
      label: `FEMA SEP available through ${femaEnd}`,
      isUrgent: false,
    };
  }

  const today = new Date();
  const endDate = new Date(today.getFullYear(), month - 1, day);
  const dayDiff = Math.ceil((endDate - today) / 86400000);

  return {
    label: `FEMA SEP available through ${femaEnd}`,
    isUrgent: dayDiff >= 0 && dayDiff <= 30,
  };
}

function renderStateContentField(title, items, className = "") {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div className={`sep-state-card-field${className ? ` ${className}` : ""}`}>
      <div className="sep-state-card-field-title">{title}</div>
      <ul className="sep-state-card-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function StateInfoCard({
  stateSepInfo,
  femaEndStatus,
  expandedStateSections,
  onToggleSection,
}) {
  if (!stateSepInfo) {
    return null;
  }

  return (
    <div
      className="sep-state-card"
      style={{
        "--sep-state-accent":
          STATE_SEP_TYPE_META[stateSepInfo.dominantType]?.color || "#d29922",
      }}
    >
      <div className="sep-state-card-header">
        <div className="sep-state-card-title-row">
          <span className="sep-state-card-code">{stateSepInfo.stateCode}</span>
          <div className="sep-state-card-heading-group">
            <div className="sep-state-card-title">{stateSepInfo.stateName}</div>
            <div className="sep-state-card-subtitle">SEP qualification reference</div>
          </div>
        </div>

        <div className="sep-state-card-badges">
          {stateSepInfo.sepTypes.map((sepType) => (
            <span
              key={sepType}
              className="sep-state-card-badge"
              style={{
                "--sep-state-badge-color":
                  STATE_SEP_TYPE_META[sepType]?.color || "#8b949e",
              }}
            >
              {STATE_SEP_TYPE_META[sepType]?.label || sepType}
            </span>
          ))}
        </div>
      </div>

      {femaEndStatus ? (
        <div className={`sep-state-card-fema${femaEndStatus.isUrgent ? " is-urgent" : ""}`}>
          {femaEndStatus.label}
        </div>
      ) : null}

      {stateSepInfo.notes?.length ? (
        <div className="sep-state-card-field">
          <div className="sep-state-card-field-title">State Notes</div>
          <ul className="sep-state-card-list">
            {stateSepInfo.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {stateSepInfo.sections.map((section) => {
        const isExpanded = Boolean(expandedStateSections[section.id]);
        const badgeColor = STATE_SEP_TYPE_META[section.type]?.color || "#8b949e";
        const { content } = section;

        return (
          <div key={section.id} className="sep-state-section">
            <button
              type="button"
              className="sep-state-section-trigger"
              onClick={() => onToggleSection(section.id)}
            >
              <div className="sep-state-section-trigger-copy">
                <div className="sep-state-section-title">{section.title}</div>
                <span
                  className="sep-state-section-type"
                  style={{ "--sep-state-badge-color": badgeColor }}
                >
                  {section.type}
                </span>
              </div>
              <ChevronDown
                size={15}
                className={`sep-state-section-chevron${isExpanded ? " is-open" : ""}`}
              />
            </button>

            <div className={`sep-state-section-panel${isExpanded ? " is-open" : ""}`}>
              <div className="sep-state-section-panel-inner">
                {content.play?.length ? (
                  <div
                    className="sep-state-play-box"
                    style={{ "--sep-state-play-color": badgeColor }}
                  >
                    <div className="sep-state-play-label">The Play</div>
                    <div className="sep-state-play-copy">
                      {content.play.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </div>
                  </div>
                ) : null}
                {renderStateContentField("Warnings", content.warnings, " is-warning")}
                {renderStateContentField(
                  "Eligible Carriers",
                  content.carriers?.map((carrier) => carrier)
                )}
                {renderStateContentField("Qualifications", content.qualifications)}
                {renderStateContentField("Key Details", content.restrictions)}
                {content.programs?.length ? (
                  <div className="sep-state-card-field">
                    <div className="sep-state-card-field-title">Program Details</div>
                    <div className="sep-state-program-grid">
                      {content.programs.map((program) => (
                        <div key={program.title} className="sep-state-program-card">
                          <div className="sep-state-program-title">{program.title}</div>
                          <ul className="sep-state-card-list">
                            {program.items.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {renderStateContentField("Application", content.application)}
                {content.phoneNumbers?.length ? (
                  <div className="sep-state-card-field">
                    <div className="sep-state-card-field-title">Phone Numbers</div>
                    <div className="sep-state-phone-grid">
                      {content.phoneNumbers.map((phoneEntry) => (
                        <div key={phoneEntry.label} className="sep-state-phone-card">
                          <div className="sep-state-phone-label">
                            <Phone size={14} />
                            {phoneEntry.label}
                          </div>
                          <div className="sep-state-phone-value">{phoneEntry.value}</div>
                          {phoneEntry.note ? (
                            <div className="sep-state-phone-note">{phoneEntry.note}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {renderStateContentField("Tips", content.tips)}
                {content.checklist?.length ? (
                  <div className="sep-state-card-field">
                    <div className="sep-state-card-field-title">Mandatory Questions</div>
                    <ol className="sep-state-card-checklist">
                      {content.checklist.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ol>
                  </div>
                ) : null}
                {content.disclosure ? (
                  <div className="sep-state-card-field">
                    <div className="sep-state-card-field-title">Mandatory Disclosure</div>
                    <blockquote className="sep-state-disclosure-card">
                      {content.disclosure}
                    </blockquote>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function SEPQualifier({ onMinimize }) {
  const [stageIndex, setStageIndex] = useState(0);
  const [hasPartAandB, setHasPartAandB] = useState(null);
  const [residentState, setResidentState] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [selectedSubtypeId, setSelectedSubtypeId] = useState("");
  const [expandedStateSections, setExpandedStateSections] = useState({});
  const [agentNotes, setAgentNotes] = useState("");
  const [usedQuestionShortcut, setUsedQuestionShortcut] = useState(false);
  const [showNoSepNotice, setShowNoSepNotice] = useState(false);

  const selectedCategory = selectedCategoryId
    ? SEP_QUALIFIER_CATEGORY_MAP[selectedCategoryId]
    : null;
  const selectedSubtype = useMemo(
    () =>
      selectedCategory?.subTypes.find((subType) => subType.id === selectedSubtypeId) ?? null,
    [selectedCategory, selectedSubtypeId]
  );

  const normalizedState = residentState.trim().toUpperCase();
  const resolvedStateCode = useMemo(() => resolveStateCode(residentState), [residentState]);
  const stateSepInfo = useMemo(
    () => getStateSepInfo(resolvedStateCode),
    [resolvedStateCode]
  );
  const femaEndStatus = useMemo(
    () => getFemaEndStatus(stateSepInfo?.femaEnd),
    [stateSepInfo?.femaEnd]
  );

  useEffect(() => {
    if (!stateSepInfo?.sections?.length) {
      setExpandedStateSections({});
      return;
    }

    setExpandedStateSections(
      Object.fromEntries(stateSepInfo.sections.map((section) => [section.id, false]))
    );
  }, [stateSepInfo]);

  const resetAll = () => {
    setStageIndex(0);
    setHasPartAandB(null);
    setResidentState("");
    setSelectedCategoryId("");
    setSelectedSubtypeId("");
    setExpandedStateSections({});
    setUsedQuestionShortcut(false);
    setShowNoSepNotice(false);
  };

  const handleCategorySelect = (categoryId) => {
    setUsedQuestionShortcut(false);
    setShowNoSepNotice(false);
    setSelectedCategoryId(categoryId);
    setSelectedSubtypeId("");
    setStageIndex(4);
  };

  const handleQuestionShortcut = (categoryId) => {
    setUsedQuestionShortcut(true);
    setShowNoSepNotice(false);
    setSelectedCategoryId(categoryId);
    setSelectedSubtypeId("");
    setStageIndex(4);
  };

  const handleSubtypeSelect = (subTypeId) => {
    setSelectedSubtypeId(subTypeId);
    setStageIndex(5);
  };

  const handleStateChange = (event) => {
    setShowNoSepNotice(false);
    setResidentState(event.target.value.toUpperCase());
  };

  const toggleStateSection = (sectionId) => {
    setExpandedStateSections((currentSections) => ({
      ...currentSections,
      [sectionId]: !currentSections[sectionId],
    }));
  };

  const canAdvanceToCategory = hasPartAandB === true && normalizedState.length >= 2;

  return (
    <section className="sep-qualifier">
      <div className="sep-qualifier-body">
        {stageIndex > 0 ? (
          <div className="sep-qualifier-toolbar">
            <div className="sep-qualifier-actions">
              <button type="button" className="sep-qualifier-action" onClick={resetAll}>
                <RotateCcw size={13} />
                Reset
              </button>
              <button type="button" className="sep-qualifier-action" onClick={onMinimize}>
                <Minimize2 size={13} />
                Minimize
              </button>
            </div>
          </div>
        ) : null}

        {stageIndex === 0 ? (
          <div className="sep-qualifier-stage sep-qualifier-stage--default">
            <div className="sep-qualifier-intro-card">
              <div className="sep-qualifier-start-panel">
                <button
                  type="button"
                  className="sep-qualifier-primary sep-qualifier-start-trigger"
                  onClick={() => setStageIndex(1)}
                >
                  START SEP QUALIFICATION
                </button>
                <button
                  type="button"
                  className="sep-qualifier-minimize-icon"
                  onClick={onMinimize}
                  aria-label="Minimize SEP Qualifier"
                  title="Minimize"
                >
                  <Minimize2 size={12} />
                </button>
              </div>
            </div>

            <SNPRoutingWidget />

            <QuickNotes value={agentNotes} onChange={setAgentNotes} title="Agent Notes" />
          </div>
        ) : null}

        {stageIndex === 1 ? (
          <div className="sep-qualifier-stage">
            <div className="sep-qualifier-script-card is-say">
              <div className="sep-qualifier-script-label">SAY THIS</div>
              <p>{OPENER_SCRIPT}</p>
            </div>

            <button
              type="button"
              className="sep-qualifier-primary"
              onClick={() => setStageIndex(2)}
            >
              CONTINUE - VERIFY A & B
            </button>
          </div>
        ) : null}

        {stageIndex === 2 ? (
          <div className="sep-qualifier-stage">
            <div className="sep-qualifier-question-block">
              <div className="sep-qualifier-question-label">
                Do you currently have both Medicare Part A and Part B?
              </div>
              <div className="sep-qualifier-toggle-row">
                <button
                  type="button"
                  className={`sep-qualifier-toggle${hasPartAandB === true ? " is-active" : ""}`}
                  onClick={() => {
                    setShowNoSepNotice(false);
                    setHasPartAandB(true);
                  }}
                >
                  YES
                </button>
                <button
                  type="button"
                  className={`sep-qualifier-toggle${hasPartAandB === false ? " is-active is-danger" : ""}`}
                  onClick={() => {
                    setShowNoSepNotice(false);
                    setHasPartAandB(false);
                  }}
                >
                  NO
                </button>
              </div>
            </div>

            {hasPartAandB === false ? (
              <div className="sep-qualifier-stop-card">
                STOP. Cannot enroll in MA without both A & B. If leaving employer coverage,
                check for Part B SEP.
              </div>
            ) : null}

            <div className="sep-qualifier-question-block">
              <label className="sep-qualifier-question-label" htmlFor="sep-state-input">
                And what state do you live in?
              </label>
              <input
                id="sep-state-input"
                className="sep-qualifier-input"
                type="text"
                value={residentState}
                onChange={handleStateChange}
                placeholder="Enter state"
                autoComplete="address-level1"
              />
              <div className="sep-qualifier-note">
                Confirm you are licensed in{" "}
                {resolvedStateCode || normalizedState || "[STATE]"} before proceeding.
              </div>
            </div>

            {canAdvanceToCategory ? (
              <div className="sep-qualifier-shortcut-panel">
                <div className="sep-qualifier-shortcut-header">
                  <div className="sep-qualifier-shortcut-label">ASK THESE QUESTIONS</div>
                  <p className="sep-qualifier-shortcut-intro">{VERIFICATION_SCRIPT}</p>
                  <p className="sep-qualifier-shortcut-instruction">
                    Run through these quickly. When they say yes to one, tap it.
                  </p>
                </div>

                <div className="sep-qualifier-shortcut-list">
                  {SEP_QUALIFIER_QUESTIONS.map((question, index) => {
                    const category = SEP_QUALIFIER_CATEGORY_MAP[question.categoryId];

                    return (
                      <button
                        key={question.id}
                        type="button"
                        className="sep-qualifier-shortcut-card"
                        style={{
                          "--sep-question-color": category?.color || "#8b949e",
                        }}
                        onClick={() => handleQuestionShortcut(question.categoryId)}
                      >
                        <div className="sep-qualifier-shortcut-card-head">
                          <span className="sep-qualifier-shortcut-index">Q{index + 1}</span>
                          <span className="sep-qualifier-shortcut-category">
                            {category?.label || "SEP"}
                          </span>
                        </div>
                        <span className="sep-qualifier-shortcut-text">{question.prompt}</span>
                        {question.note ? (
                          <span className="sep-qualifier-shortcut-note">{question.note}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <button
              type="button"
              className="sep-qualifier-primary"
              onClick={() => {
                setUsedQuestionShortcut(false);
                setShowNoSepNotice(false);
                setStageIndex(3);
              }}
              disabled={!canAdvanceToCategory}
            >
              SELECT SEP CATEGORY
            </button>

            {canAdvanceToCategory ? (
              <>
                <button
                  type="button"
                  className="sep-qualifier-secondary sep-qualifier-none-button"
                  onClick={() => setShowNoSepNotice((currentValue) => !currentValue)}
                >
                  NONE OF THESE APPLY
                </button>

                {showNoSepNotice ? (
                  <div className="sep-qualifier-no-sep-card">{NO_SEP_NOTICE}</div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}

        {stageIndex === 3 ? (
          <div className="sep-qualifier-stage">
            <div className="sep-qualifier-category-grid">
              {SEP_QUALIFIER_CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className="sep-qualifier-category-card"
                  style={{
                    "--sep-category-color": category.color,
                  }}
                  onClick={() => handleCategorySelect(category.id)}
                >
                  <span className="sep-qualifier-category-icon" aria-hidden="true">
                    {renderCategoryIcon(category.icon, category.color)}
                  </span>
                  <span className="sep-qualifier-category-label">{category.label}</span>
                  <span className="sep-qualifier-category-badge">
                    {category.subTypes.length}
                  </span>
                </button>
                ))}
              </div>

            </div>
          ) : null}

        {stageIndex === 4 && selectedCategory ? (
          <div className="sep-qualifier-stage">
            <div className="sep-qualifier-subtype-header">
              <button
                type="button"
                className="sep-qualifier-back"
                onClick={() => setStageIndex(usedQuestionShortcut ? 2 : 3)}
              >
                <ArrowLeft size={14} />
                Back
              </button>
              <div className="sep-qualifier-selected-category">
                <span aria-hidden="true">
                  {renderCategoryIcon(selectedCategory.icon, selectedCategory.color)}
                </span>
                <span>{selectedCategory.label}</span>
              </div>
            </div>

            <div className="sep-qualifier-subtype-list">
              {selectedCategory.subTypes.map((subType) => (
                <button
                  key={subType.id}
                  type="button"
                  className="sep-qualifier-subtype-card"
                  onClick={() => handleSubtypeSelect(subType.id)}
                >
                  <div className="sep-qualifier-subtype-title">{subType.label}</div>
                  <div className="sep-qualifier-subtype-meta">
                    <span>{subType.code}</span>
                    <span>{subType.window}</span>
                  </div>
                </button>
              ))}
            </div>

            <StateInfoCard
              stateSepInfo={stateSepInfo}
              femaEndStatus={femaEndStatus}
              expandedStateSections={expandedStateSections}
              onToggleSection={toggleStateSection}
            />
          </div>
        ) : null}

        {stageIndex === 5 && selectedSubtype ? (
          <div className="sep-qualifier-stage">
            <div className="sep-qualifier-result-header">
              <div className="sep-qualifier-result-status">SEP ELIGIBLE</div>
              <div className="sep-qualifier-result-name">{selectedSubtype.label}</div>
            </div>

            <div className="sep-qualifier-detail-grid">
              <div className="sep-qualifier-detail-card">
                <span className="sep-qualifier-detail-label">Election Code</span>
                <span className="sep-qualifier-detail-value">{selectedSubtype.code}</span>
              </div>
              <div className="sep-qualifier-detail-card">
                <span className="sep-qualifier-detail-label">Enrollment Window</span>
                <span className="sep-qualifier-detail-value">{selectedSubtype.window}</span>
              </div>
              <div className="sep-qualifier-detail-card">
                <span className="sep-qualifier-detail-label">Effective Date</span>
                <span className="sep-qualifier-detail-value">{selectedSubtype.effective}</span>
              </div>
              <div className="sep-qualifier-detail-card">
                <span className="sep-qualifier-detail-label">Documentation Needed</span>
                <span className="sep-qualifier-detail-value">{selectedSubtype.docs}</span>
              </div>
            </div>

            {selectedSubtype.note ? (
              <div className="sep-qualifier-warning-card is-inline">
                <div className="sep-qualifier-warning-title">
                  <AlertTriangle size={15} />
                  Special Restriction
                </div>
                <p>{selectedSubtype.note}</p>
              </div>
            ) : null}

            <div className="sep-qualifier-script-card is-say">
              <div className="sep-qualifier-script-label">SAY THIS TO CONFIRM</div>
              <p>
                Based on what you've told me, you do qualify for a Special Enrollment
                Period. That means we can look at Medicare Advantage plan options for you
                right now. I'll need to note the reason for your eligibility on the
                application - and you may need to provide documentation such as{" "}
                {selectedSubtype.docs}. Let me pull up the plans available in your area.
              </p>
            </div>

            <div className="sep-qualifier-result-actions">
              <button type="button" className="sep-qualifier-secondary" onClick={resetAll}>
                New Qualification
              </button>
              <button
                type="button"
                className="sep-qualifier-primary"
                onClick={onMinimize}
              >
                PROCEED TO ENROLLMENT
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * U65Flow.jsx - five-screen U65 Off-Exchange NEPQ script flow.
 *
 * Capture and navigation state intentionally stays local to this component.
 * The U65 Co-Pilot remains isolated from this workflow data.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  MessageCircleQuestion,
  X,
} from "lucide-react";
import CenterTimerBar from "../../components/CenterTimerBar";
import ProgressDots from "../../components/ProgressDots";
import { consumePendingCallContact } from "../../lib/callLaunch";
import { useScriptTemplate } from "../../hooks/useScriptTemplate";
import {
  U65_GATES,
  U65_OBJECTIONS,
  U65_OPENER_VARIANTS,
} from "./U65Data";

const LAST_SCREEN_INDEX = U65_GATES.length - 1;

function firstValue(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return null;
}

function objectFields(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function formatPremium(value) {
  if (value === null || value === undefined || value === "") return "";
  const raw = String(value).trim();
  if (!raw) return "";
  const numeric = Number(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(numeric)) return raw;
  return `$${numeric.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function deriveOpenerVariant(lead) {
  const urgency = String(
    firstValue(lead, [
      "urgency",
      "urgent",
      "asap",
      "priority",
      "requested_timeline",
      "timeframe",
      "tags",
    ]) || ""
  ).toLowerCase();
  const submittedAt = firstValue(lead, [
    "submitted_at",
    "received_at",
    "created_at",
    "lead_created_at",
  ]);
  const submittedTime = submittedAt ? new Date(submittedAt).getTime() : Number.NaN;
  const isOlderLead = Number.isFinite(submittedTime)
    ? Date.now() - submittedTime >= 24 * 60 * 60 * 1000
    : true;

  if (isOlderLead && /asap|urgent|immediate|high/.test(urgency)) return "urgent";

  const premium = firstValue(lead, [
    "premium",
    "premium_amount",
    "monthly_premium",
    "current_premium",
    "form_premium",
  ]);
  if (premium !== null) return "premium";

  const coverage = String(
    firstValue(lead, [
      "form_coverage_answer",
      "coverage_answer",
      "current_coverage",
      "current_plan",
      "current_carrier",
      "coverage",
    ]) || ""
  ).toLowerCase();
  if (!coverage || /uninsured|no coverage|none|without/.test(coverage)) return "uninsured";

  return "uninsured";
}

function scriptBodyToParts(body) {
  const script = [];
  const directions = [];

  String(body || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      if (/^(Direction|Agent note):/i.test(line)) {
        directions.push(line.replace(/^(Direction|Agent note):\s*/i, ""));
      } else {
        script.push(line);
      }
    });

  return { script, directions };
}

function useU65TemplateScreens() {
  const { sections, template } = useScriptTemplate("u65");

  return useMemo(() => {
    if (!template || !sections.length) return U65_GATES;

    const matchingSections = U65_GATES.map((screen) =>
      sections.find(
        (section) =>
          section.gate_field === screen.key ||
          section.key === screen.key
      )
    );

    // Older U65 templates use G00-G09/gate0Ok keys. Ignore those so an
    // active legacy DB template cannot replace this five-screen script.
    if (matchingSections.some((section) => !section)) return U65_GATES;

    return U65_GATES.map((screen, index) => {
      const section = matchingSections[index];
      const { script, directions } = scriptBodyToParts(section.body);
      const blocks = [
        ...script.map((text) => ({ type: "spoken", text })),
        ...directions.map((text) => ({ type: "hint", text })),
      ];

      return {
        ...screen,
        label: section.title || screen.label,
        groups: blocks.length
          ? [{ title: section.title || screen.label, blocks }]
          : screen.groups,
      };
    });
  }, [sections, template]);
}

function InterpolatedText({ text, problem, premium }) {
  const parts = String(text).split(/(\{PROBLEM\}|\[[^\]]+\])/g);

  const renderProblemToken = (value, keyPrefix) =>
    String(value)
      .split(/(\{PROBLEM\})/g)
      .map((segment, segmentIndex) =>
        segment === "{PROBLEM}" ? (
          problem ? (
            <strong
              className="u65-nepq-interpolation"
              key={`${keyPrefix}-problem-${segmentIndex}`}
            >
              {problem}
            </strong>
          ) : (
            <span
              className="u65-nepq-placeholder"
              key={`${keyPrefix}-problem-${segmentIndex}`}
            >
              {segment}
            </span>
          )
        ) : (
          segment
        )
      );

  return parts.map((part, index) => {
    if (part === "{PROBLEM}") {
      return problem ? (
        <strong className="u65-nepq-interpolation" key={`${part}-${index}`}>
          {problem}
        </strong>
      ) : (
        <span className="u65-nepq-placeholder" key={`${part}-${index}`}>
          {part}
        </span>
      );
    }

    if (part === "[amount]" && premium) {
      return (
        <strong className="u65-nepq-interpolation" key={`${part}-${index}`}>
          {premium}
        </strong>
      );
    }

    if (part.startsWith("[") && part.endsWith("]")) {
      return (
        <span className="u65-nepq-agent-cue" key={`${part}-${index}`}>
          {renderProblemToken(part, `${part}-${index}`)}
        </span>
      );
    }

    return part;
  });
}

function TalkTrack({ text, problem, premium }) {
  return (
    <div className="flow-script-line u65-nepq-spoken">
      <div className="flow-script-text">
        <InterpolatedText text={text} problem={problem} premium={premium} />
      </div>
    </div>
  );
}

function StageDirection({ text, tone = "default" }) {
  return (
    <div className={`flow-stage-direction u65-nepq-hint is-${tone}`}>
      <div className="flow-stage-text">{text}</div>
    </div>
  );
}

function CaptureField({ block, value, onChange }) {
  return (
    <label className="u65-nepq-capture">
      <span className="u65-nepq-capture__label">
        {block.label}
        <span className="u65-nepq-capture__status">
          {block.required ? "REQUIRED" : "OPTIONAL"}
        </span>
      </span>
      <textarea
        id={`u65-${block.field}`}
        name={block.field}
        className="u65-nepq-capture__input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        aria-required={block.required}
        aria-label={block.label}
      />
    </label>
  );
}

function OpenerSelector({ selected, suggested, premium, onSelect }) {
  const selectedVariant =
    U65_OPENER_VARIANTS.find((variant) => variant.id === selected) ||
    U65_OPENER_VARIANTS[0];

  return (
    <div className="u65-nepq-opener">
      <div className="u65-nepq-opener__label">SELECT FROM LEAD FORM</div>
      <div className="u65-nepq-opener__choices" role="group" aria-label="Opener variant">
        {U65_OPENER_VARIANTS.map((variant) => (
          <button
            type="button"
            className={`u65-nepq-choice${selected === variant.id ? " is-selected" : ""}`}
            key={variant.id}
            onClick={() => onSelect(variant.id)}
            aria-pressed={selected === variant.id}
          >
            <span>{variant.label}</span>
            {suggested === variant.id ? <small>FORM MATCH</small> : null}
          </button>
        ))}
      </div>
      <TalkTrack text={selectedVariant.text} premium={premium} />
    </div>
  );
}

function switchToMedSupp() {
  if (typeof window === "undefined") return;
  window.history.pushState(null, "", "/script/medsup");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function ConditionalCallout({
  block,
  captures,
  problem,
  premium,
  openerVariant,
  suggestedOpener,
  onCapture,
  onOpenerSelect,
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`u65-nepq-callout is-${block.tone || "default"}${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="u65-nepq-callout__toggle"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <span>{block.label}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className="u65-nepq-callout__body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16 }}
          >
            <RenderBlocks
              blocks={block.items || []}
              captures={captures}
              problem={problem}
              premium={premium}
              openerVariant={openerVariant}
              suggestedOpener={suggestedOpener}
              onCapture={onCapture}
              onOpenerSelect={onOpenerSelect}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function BranchSet({
  block,
  captures,
  problem,
  premium,
  openerVariant,
  suggestedOpener,
  onCapture,
  onOpenerSelect,
}) {
  const [openBranch, setOpenBranch] = useState(null);

  return (
    <div className="u65-nepq-branches">
      {block.branches.map((branch) => {
        const open = openBranch === branch.label;
        return (
          <div
            className={`u65-nepq-branch is-${branch.tone || "default"}${open ? " is-open" : ""}`}
            key={branch.label}
          >
            <button
              type="button"
              className="u65-nepq-branch__header"
              onClick={() => setOpenBranch(open ? null : branch.label)}
              aria-expanded={open}
            >
              <span>{branch.label}</span>
              <span className="u65-nepq-branch__meta">
                {branch.badge ? <strong>{branch.badge}</strong> : null}
                <ChevronDown size={13} aria-hidden="true" />
              </span>
            </button>
            <AnimatePresence initial={false}>
              {open ? (
                <motion.div
                  className="u65-nepq-branch__body"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.16 }}
                >
                  <RenderBlocks
                    blocks={branch.items || []}
                    captures={captures}
                    problem={problem}
                    premium={premium}
                    openerVariant={openerVariant}
                    suggestedOpener={suggestedOpener}
                    onCapture={onCapture}
                    onOpenerSelect={onOpenerSelect}
                  />
                  {branch.action === "medsup" ? (
                    <button
                      type="button"
                      className="u65-nepq-switch"
                      onClick={switchToMedSupp}
                    >
                      Switch to Med Supp script
                      <ArrowRight size={13} aria-hidden="true" />
                    </button>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

function RenderBlocks({
  blocks,
  captures,
  problem,
  premium,
  openerVariant,
  suggestedOpener,
  onCapture,
  onOpenerSelect,
}) {
  return blocks.map((block, index) => {
    const blockKey = `${block.type}-${block.label || block.field || index}-${index}`;

    if (block.type === "spoken") {
      return (
        <TalkTrack
          key={blockKey}
          text={block.text}
          problem={problem}
          premium={premium}
        />
      );
    }

    if (block.type === "hint") {
      return <StageDirection key={blockKey} text={block.text} tone={block.tone} />;
    }

    if (block.type === "capture") {
      return (
        <CaptureField
          key={blockKey}
          block={block}
          value={captures[block.field] || ""}
          onChange={(value) => onCapture(block.field, value)}
        />
      );
    }

    if (block.type === "opener-selector") {
      return (
        <OpenerSelector
          key={blockKey}
          selected={openerVariant}
          suggested={suggestedOpener}
          premium={premium}
          onSelect={onOpenerSelect}
        />
      );
    }

    if (block.type === "callout") {
      return (
        <ConditionalCallout
          key={blockKey}
          block={block}
          captures={captures}
          problem={problem}
          premium={premium}
          openerVariant={openerVariant}
          suggestedOpener={suggestedOpener}
          onCapture={onCapture}
          onOpenerSelect={onOpenerSelect}
        />
      );
    }

    if (block.type === "branch-set") {
      return (
        <BranchSet
          key={blockKey}
          block={block}
          captures={captures}
          problem={problem}
          premium={premium}
          openerVariant={openerVariant}
          suggestedOpener={suggestedOpener}
          onCapture={onCapture}
          onOpenerSelect={onOpenerSelect}
        />
      );
    }

    return null;
  });
}

function ScreenSection({
  group,
  sectionIndex,
  open,
  onToggle,
  captures,
  problem,
  premium,
  openerVariant,
  suggestedOpener,
  onCapture,
  onOpenerSelect,
}) {
  const bodyId = `u65-screen-section-${sectionIndex}`;

  return (
    <section className={`u65-nepq-group${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="u65-nepq-group__toggle"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
      >
        <span className="u65-nepq-group__number">
          {String(sectionIndex + 1).padStart(2, "0")}
        </span>
        <strong>{group.title}</strong>
        <span className="u65-nepq-group__state">
          {open ? "OPEN" : "SELECT"}
          <ChevronDown size={14} aria-hidden="true" />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={bodyId}
            className="u65-nepq-group__body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <RenderBlocks
              blocks={group.blocks}
              captures={captures}
              problem={problem}
              premium={premium}
              openerVariant={openerVariant}
              suggestedOpener={suggestedOpener}
              onCapture={onCapture}
              onOpenerSelect={onOpenerSelect}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function ObjectionOverlay({ open, onClose, returnFocusRef }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  const closeAndRestore = () => {
    onClose();
    requestAnimationFrame(() => returnFocusRef.current?.focus());
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="u65-nepq-objection-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAndRestore();
          }}
        >
          <motion.section
            className="u65-nepq-objection-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="u65-objections-title"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
          >
            <div className="u65-nepq-objection-modal__header">
              <div>
                <span>AVAILABLE ON EVERY SCREEN</span>
                <h2 id="u65-objections-title">Objections</h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="u65-nepq-objection-modal__close"
                onClick={closeAndRestore}
                aria-label="Close objections"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="u65-nepq-objection-modal__body">
              {U65_OBJECTIONS.map((objection) => (
                <div className="u65-nepq-objection-step" key={objection.step}>
                  <div className="u65-nepq-objection-step__label">
                    <span>{objection.step}</span>
                    {objection.label}
                  </div>
                  <TalkTrack text={objection.text} />
                </div>
              ))}
              <StageDirection
                tone="danger"
                text={'Never open with "but," "actually," or "well, most people."'}
              />
            </div>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export default function U65Flow() {
  const screens = useU65TemplateScreens();
  const [pendingLead] = useState(() => consumePendingCallContact());
  const leadData = useMemo(
    () => ({
      ...(pendingLead || {}),
      ...objectFields(pendingLead?.lead_intel),
      ...objectFields(pendingLead?.form_data),
    }),
    [pendingLead]
  );
  const suggestedOpener = useMemo(() => deriveOpenerVariant(leadData), [leadData]);
  const premium = useMemo(
    () =>
      formatPremium(
        firstValue(leadData, [
          "premium",
          "premium_amount",
          "monthly_premium",
          "current_premium",
          "form_premium",
        ])
      ),
    [leadData]
  );
  const [currentScreenIndex, setCurrentScreenIndex] = useState(0);
  const [captures, setCaptures] = useState({
    problem: "",
    consequence: "",
    why_bought: "",
  });
  const [openerVariant, setOpenerVariant] = useState(suggestedOpener);
  const [objectionsOpen, setObjectionsOpen] = useState(false);
  const [complete, setComplete] = useState(false);
  const [openSectionByScreen, setOpenSectionByScreen] = useState({});
  const openerWasSelectedRef = useRef(false);
  const objectionButtonRef = useRef(null);
  const flowTopRef = useRef(null);

  useEffect(() => {
    if (!openerWasSelectedRef.current) setOpenerVariant(suggestedOpener);
  }, [suggestedOpener]);

  useEffect(() => {
    flowTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [complete, currentScreenIndex]);

  const problem = captures.problem.trim();
  const currentScreen = screens[currentScreenIndex] || U65_GATES[currentScreenIndex];
  const openSectionIndex = Object.prototype.hasOwnProperty.call(
    openSectionByScreen,
    currentScreen.id
  )
    ? openSectionByScreen[currentScreen.id]
    : 0;

  const updateCapture = (field, value) => {
    setCaptures((current) => ({ ...current, [field]: value }));
  };

  const goBack = () => {
    setCurrentScreenIndex((current) => Math.max(0, current - 1));
  };

  const goNext = () => {
    const nextIndex = currentScreenIndex + 1;
    if (currentScreenIndex === LAST_SCREEN_INDEX) {
      setComplete(true);
      return;
    }
    setCurrentScreenIndex(nextIndex);
  };

  const resetFlow = () => {
    setCurrentScreenIndex(0);
    setCaptures({ problem: "", consequence: "", why_bought: "" });
    setOpenerVariant(suggestedOpener);
    setComplete(false);
    setOpenSectionByScreen({});
    openerWasSelectedRef.current = false;
  };

  return (
    <motion.div
      className="flow u65-nepq-flow"
      ref={flowTopRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <CenterTimerBar />

      <ObjectionOverlay
        open={objectionsOpen}
        onClose={() => setObjectionsOpen(false)}
        returnFocusRef={objectionButtonRef}
      />

      {!complete ? (
        <motion.section
          className="flow-script-card active-card u65-nepq-screen"
          key={currentScreen.id}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="u65-nepq-screen__header">
            <div className="u65-nepq-screen__title">
              <span>{currentScreen.code}</span>
              <strong>{currentScreen.label}</strong>
            </div>
            <button
              ref={objectionButtonRef}
              type="button"
              className="u65-nepq-objection-trigger"
              onClick={() => setObjectionsOpen(true)}
            >
              <MessageCircleQuestion size={14} aria-hidden="true" />
              Objections
            </button>
          </div>

          <div className="u65-nepq-screen__body">
            {currentScreen.groups.map((group, index) => (
              <ScreenSection
                key={group.title}
                group={group}
                sectionIndex={index}
                open={openSectionIndex === index}
                onToggle={() =>
                  setOpenSectionByScreen((current) => ({
                    ...current,
                    [currentScreen.id]: openSectionIndex === index ? null : index,
                  }))
                }
                captures={captures}
                problem={problem}
                premium={premium}
                openerVariant={openerVariant}
                suggestedOpener={suggestedOpener}
                onCapture={updateCapture}
                onOpenerSelect={(variant) => {
                  openerWasSelectedRef.current = true;
                  setOpenerVariant(variant);
                }}
              />
            ))}
          </div>

          <div className="u65-nepq-nav">
            <button
              type="button"
              className="u65-nepq-nav__button is-back"
              onClick={goBack}
              disabled={currentScreenIndex === 0}
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Back
            </button>
            <span className="u65-nepq-nav__count">
              {currentScreenIndex + 1} / {screens.length}
            </span>
            <button
              type="button"
              className="u65-nepq-nav__button is-next"
              onClick={goNext}
            >
              {currentScreenIndex === LAST_SCREEN_INDEX ? "Complete" : "Next"}
              {currentScreenIndex === LAST_SCREEN_INDEX ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <ArrowRight size={14} aria-hidden="true" />
              )}
            </button>
          </div>
        </motion.section>
      ) : (
        <motion.section
          className="u65-nepq-complete"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Check size={24} aria-hidden="true" />
          <h2>U65 Flow Complete</h2>
          <p>All five NEPQ screens are complete.</p>
          <div className="u65-nepq-complete__actions">
            <button
              type="button"
              onClick={() => {
                setComplete(false);
                setCurrentScreenIndex(LAST_SCREEN_INDEX);
              }}
            >
              Back to Screen 5
            </button>
            <button type="button" onClick={resetFlow}>New Call</button>
          </div>
        </motion.section>
      )}

      <ProgressDots
        sections={screens.map((screen, index) => ({
          key: screen.key,
          label: screen.shortLabel || screen.label,
          status:
            complete || index < currentScreenIndex
              ? "done"
              : index === currentScreenIndex
                ? "active"
                : "pending",
        }))}
      />
    </motion.div>
  );
}

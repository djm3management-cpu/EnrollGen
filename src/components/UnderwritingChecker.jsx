import { useMemo, useState } from "react";
import { AlertTriangle, RotateCcw, ShieldCheck } from "lucide-react";
import { PRIVATE_PLAN_UNDERWRITING } from "../data/privatePlans";

const CHECK_IDS = [
  ...PRIVATE_PLAN_UNDERWRITING.sharedQuestions.map((question) => question.id),
  PRIVATE_PLAN_UNDERWRITING.q4.medMax.id,
  PRIVATE_PLAN_UNDERWRITING.q4.medPerformance.id,
  PRIVATE_PLAN_UNDERWRITING.mvpBasic.id,
];

function AnswerToggle({ value, onChange }) {
  return (
    <div className="uw-toggle" role="group" aria-label="Answer">
      <button
        type="button"
        className={`uw-toggle__btn${value === true ? " is-yes" : ""}`}
        onClick={() => onChange(true)}
      >
        Yes
      </button>
      <button
        type="button"
        className={`uw-toggle__btn${value === false ? " is-no" : ""}`}
        onClick={() => onChange(false)}
      >
        No
      </button>
    </div>
  );
}

function QuestionRow({ question, value, onChange, variant = "default" }) {
  return (
    <div className={`uw-question uw-question--${variant}`}>
      <div className="uw-question__copy">
        <div className="uw-question__label">
          {question.label}
          {question.lookback ? <span>{question.lookback}</span> : null}
        </div>
        <p>{question.text}</p>
      </div>
      <AnswerToggle value={value} onChange={onChange} />
    </div>
  );
}

function buildRecommendation(answers) {
  const yesShared = PRIVATE_PLAN_UNDERWRITING.sharedQuestions.filter(
    (question) => answers[question.id] === true
  );
  const allSharedAnswered = PRIVATE_PLAN_UNDERWRITING.sharedQuestions.every(
    (question) => answers[question.id] !== undefined
  );
  const q4Max = answers[PRIVATE_PLAN_UNDERWRITING.q4.medMax.id];
  const q4Performance = answers[PRIVATE_PLAN_UNDERWRITING.q4.medPerformance.id];
  const mvpBasic = answers[PRIVATE_PLAN_UNDERWRITING.mvpBasic.id];

  if (mvpBasic === true) {
    return {
      tone: "danger",
      title: "MVP Basic likely unavailable",
      body:
        "The Basic one-question screen is yes. Do not force a private plan path. Review ACA or another guaranteed issue route.",
    };
  }

  if (yesShared.length > 0) {
    return {
      tone: "danger",
      title: "Simplified issue products decline",
      body:
        "Yes on a shared question blocks MedMax, MedPerformance, and MVP Pro. If the MVP Basic question is no, check MVP Basic.",
    };
  }

  if (q4Performance === true) {
    return {
      tone: "warning",
      title: "Do not route to MedPerformance",
      body:
        q4Max === false
          ? "Lifetime Q4 is yes, but the 12-month Q4 is no. Compare MedMax or MVP Pro if all shared questions are no."
          : "Lifetime Q4 is yes. Try MedAccess MVP Basic, or MedMax only if the 12-month Q4 is accurate as no.",
    };
  }

  if (q4Max === true) {
    return {
      tone: "warning",
      title: "MedMax and MVP Pro are blocked",
      body:
        "The 12-month Q4 is yes. Check MedAccess MVP Basic if its pending test or pending service question is no.",
    };
  }

  if (
    allSharedAnswered &&
    q4Max === false &&
    q4Performance === false &&
    mvpBasic === false
  ) {
    return {
      tone: "ready",
      title: "Private plan options remain open",
      body:
        "All quick-check answers are no. Compare by budget, network preference, maternity need, and benefit structure.",
    };
  }

  return {
    tone: "idle",
    title: "Complete the quick-check",
    body:
      "Ask shared Q1, Q2, Q3, Q5, both Q4 versions, and the MVP Basic pending item before routing.",
  };
}

export default function UnderwritingChecker({ highlighted = false, onAcknowledgeHighlight }) {
  const [answers, setAnswers] = useState({});
  const recommendation = useMemo(() => buildRecommendation(answers), [answers]);

  const setAnswer = (id, value) => {
    setAnswers((current) => ({ ...current, [id]: value }));
    onAcknowledgeHighlight?.();
  };

  const answeredCount = CHECK_IDS.filter((id) => answers[id] !== undefined).length;

  return (
    <section className={`uw-checker${highlighted ? " is-highlighted" : ""}`}>
      <div className="private-plan-section-head">
        <div>
          <span className="private-plan-kicker">Underwriting</span>
          <h3>Quick-Check</h3>
        </div>
        <div className="uw-checker__status">
          {highlighted ? <span className="uw-checker__badge">Check Now</span> : null}
          <span>{answeredCount}/{CHECK_IDS.length}</span>
        </div>
      </div>

      <div className="uw-question-list">
        {PRIVATE_PLAN_UNDERWRITING.sharedQuestions.map((question) => (
          <QuestionRow
            key={question.id}
            question={question}
            value={answers[question.id]}
            onChange={(value) => setAnswer(question.id, value)}
          />
        ))}
      </div>

      <div className="uw-split">
        <QuestionRow
          question={PRIVATE_PLAN_UNDERWRITING.q4.medMax}
          value={answers[PRIVATE_PLAN_UNDERWRITING.q4.medMax.id]}
          onChange={(value) => setAnswer(PRIVATE_PLAN_UNDERWRITING.q4.medMax.id, value)}
          variant="medmax"
        />
        <QuestionRow
          question={PRIVATE_PLAN_UNDERWRITING.q4.medPerformance}
          value={answers[PRIVATE_PLAN_UNDERWRITING.q4.medPerformance.id]}
          onChange={(value) =>
            setAnswer(PRIVATE_PLAN_UNDERWRITING.q4.medPerformance.id, value)
          }
          variant="medperformance"
        />
      </div>

      <QuestionRow
        question={PRIVATE_PLAN_UNDERWRITING.mvpBasic}
        value={answers[PRIVATE_PLAN_UNDERWRITING.mvpBasic.id]}
        onChange={(value) => setAnswer(PRIVATE_PLAN_UNDERWRITING.mvpBasic.id, value)}
        variant="mvp"
      />

      <div className={`uw-recommendation uw-recommendation--${recommendation.tone}`}>
        {recommendation.tone === "ready" ? (
          <ShieldCheck size={16} aria-hidden="true" />
        ) : (
          <AlertTriangle size={16} aria-hidden="true" />
        )}
        <div>
          <div className="uw-recommendation__title">{recommendation.title}</div>
          <p>{recommendation.body}</p>
        </div>
      </div>

      <button
        type="button"
        className="private-plan-reset"
        onClick={() => setAnswers({})}
      >
        <RotateCcw size={13} />
        Reset Check
      </button>
    </section>
  );
}

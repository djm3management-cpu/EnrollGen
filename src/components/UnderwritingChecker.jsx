import { useMemo, useState } from "react";
import { AlertTriangle, RotateCcw, ShieldCheck } from "lucide-react";
import { PRIVATE_PLAN_UNDERWRITING } from "../data/privatePlans";

const MVP_PRO_Q4 = {
  ...PRIVATE_PLAN_UNDERWRITING.q4.medMax,
  label: "MVP Pro Q4",
};

const SHARED_Q1_TO_Q3 = PRIVATE_PLAN_UNDERWRITING.sharedQuestions.filter(
  (question) => question.id !== "q5"
);
const SHARED_Q5 = PRIVATE_PLAN_UNDERWRITING.sharedQuestions.find(
  (question) => question.id === "q5"
);

function orderedPlanQuestions(q4Question) {
  return [
    ...SHARED_Q1_TO_Q3,
    q4Question,
    ...(SHARED_Q5 ? [SHARED_Q5] : []),
  ];
}

function getPlanQuestions(selectedProductId) {
  if (selectedProductId === "medperformance") {
    return {
      label: "MedPerformance",
      questions: orderedPlanQuestions(PRIVATE_PLAN_UNDERWRITING.q4.medPerformance),
    };
  }

  if (selectedProductId === "medaccess") {
    return {
      label: "MedAccess MVP",
      questions: [
        PRIVATE_PLAN_UNDERWRITING.mvpBasic,
        ...orderedPlanQuestions(MVP_PRO_Q4),
      ],
    };
  }

  return {
    label: "MedMax",
    questions: orderedPlanQuestions(PRIVATE_PLAN_UNDERWRITING.q4.medMax),
  };
}

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

function buildRecommendation(answers, selectedProductId, visibleQuestions) {
  const yesShared = PRIVATE_PLAN_UNDERWRITING.sharedQuestions.filter(
    (question) => answers[question.id] === true
  );
  const visibleIds = visibleQuestions.map((question) => question.id);
  const allVisibleAnswered = visibleIds.every((id) => answers[id] !== undefined);
  const q4Max = answers[PRIVATE_PLAN_UNDERWRITING.q4.medMax.id];
  const q4Performance = answers[PRIVATE_PLAN_UNDERWRITING.q4.medPerformance.id];
  const mvpBasic = answers[PRIVATE_PLAN_UNDERWRITING.mvpBasic.id];

  if (selectedProductId === "medperformance") {
    if (yesShared.length > 0 || q4Performance === true) {
      return {
        tone: "danger",
        title: "MedPerformance likely unavailable",
        body:
          "A yes answer on the MedPerformance screen blocks this product. Compare another route before quoting it.",
      };
    }

    if (allVisibleAnswered) {
      return {
        tone: "ready",
        title: "MedPerformance remains open",
        body:
          "All MedPerformance quick-check answers are no. Continue with network, deductible, and premium fit.",
      };
    }

    return {
      tone: "idle",
      title: "Complete MedPerformance quick-check",
      body: "Ask the shared questions and the lifetime Q4 before routing to MedPerformance.",
    };
  }

  if (selectedProductId === "medaccess") {
    if (mvpBasic === true && (yesShared.length > 0 || q4Max === true)) {
      return {
        tone: "danger",
        title: "MedAccess MVP likely unavailable",
        body:
          "Basic is blocked by the pending item, and Pro is blocked by the simplified issue answers. Review ACA or another guaranteed issue route.",
      };
    }

    if (mvpBasic === false) {
      return {
        tone: "ready",
        title: "MVP Basic remains open",
        body:
          "The Basic pending test/service question is no. Continue checking MVP Pro only if the client needs the stronger Pro benefits.",
      };
    }

    if (yesShared.length > 0 || q4Max === true) {
      return {
        tone: "warning",
        title: "MVP Pro is blocked",
        body:
          "A yes answer on the Pro screen blocks MVP Pro. Check the Basic pending item if it has not been answered.",
      };
    }

    if (allVisibleAnswered) {
      return {
        tone: "ready",
        title: "MedAccess MVP remains open",
        body:
          "Basic and Pro quick-check answers are no. Compare Basic versus Pro by premium and benefit need.",
      };
    }

    return {
      tone: "idle",
      title: "Complete MedAccess MVP quick-check",
      body:
        "Ask the Basic pending item and the Pro simplified issue questions before choosing the MVP variant.",
    };
  }

  if (yesShared.length > 0 || q4Max === true) {
    return {
      tone: "danger",
      title: "MedMax likely unavailable",
      body:
        "A yes answer on the MedMax screen blocks this product. Check MedAccess MVP Basic or another route.",
    };
  }

  if (allVisibleAnswered) {
    return {
      tone: "ready",
      title: "MedMax remains open",
      body:
        "All MedMax quick-check answers are no. Continue with network, deductible, and premium fit.",
    };
  }

  return {
    tone: "idle",
    title: "Complete MedMax quick-check",
    body: "Ask the shared questions and the 12-month Q4 before routing to MedMax.",
  };
}

function getQuestionVariant(question) {
  if (question.id === PRIVATE_PLAN_UNDERWRITING.q4.medMax.id) return "medmax";
  if (question.id === PRIVATE_PLAN_UNDERWRITING.q4.medPerformance.id) {
    return "medperformance";
  }
  if (question.id === PRIVATE_PLAN_UNDERWRITING.mvpBasic.id) return "mvp";
  return "default";
}

export default function UnderwritingChecker({
  selectedProductId = "medperformance",
  highlighted = false,
  onAcknowledgeHighlight,
}) {
  const [answers, setAnswers] = useState({});
  const planQuestions = useMemo(
    () => getPlanQuestions(selectedProductId),
    [selectedProductId]
  );
  const visibleQuestionIds = useMemo(
    () => planQuestions.questions.map((question) => question.id),
    [planQuestions]
  );
  const recommendation = useMemo(
    () => buildRecommendation(answers, selectedProductId, planQuestions.questions),
    [answers, selectedProductId, planQuestions]
  );

  const setAnswer = (id, value) => {
    setAnswers((current) => ({ ...current, [id]: value }));
    onAcknowledgeHighlight?.();
  };

  const answeredCount = visibleQuestionIds.filter((id) => answers[id] !== undefined)
    .length;

  return (
    <section className={`uw-checker${highlighted ? " is-highlighted" : ""}`}>
      <div className="private-plan-section-head">
        <div>
          <span className="private-plan-kicker">Underwriting</span>
          <h3>{planQuestions.label} Quick-Check</h3>
        </div>
        <div className="uw-checker__status">
          {highlighted ? <span className="uw-checker__badge">Check Now</span> : null}
          <span>{answeredCount}/{visibleQuestionIds.length}</span>
        </div>
      </div>

      <div className="uw-question-list">
        {planQuestions.questions.map((question) => (
          <QuestionRow
            key={`${selectedProductId}-${question.id}`}
            question={question}
            value={answers[question.id]}
            onChange={(value) => setAnswer(question.id, value)}
            variant={getQuestionVariant(question)}
          />
        ))}
      </div>

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

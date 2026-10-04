import { useMemo, useState } from "react";
import { CheckCircle, RotateCw, XCircle } from "lucide-react";

import { U65_QUIZ, U65_MEDMAX_QUIZ } from '../data/u65Guidance.js';
const QUESTIONS = U65_QUIZ;
const MEDMAX_QUESTIONS = U65_MEDMAX_QUIZ;
const PASSING_SCORE = Math.ceil(QUESTIONS.length * 0.8);

function getChoiceText(question, choiceId) {
  return question.choices.find(([id]) => id === choiceId)?.[1] || "";
}

export function AgentToolsMedMaxScenarioQuiz() {
  return (
    <AgentToolsProductQuiz
      questions={MEDMAX_QUESTIONS}
      passingScore={MEDMAX_QUESTIONS.length}
      perfectText="Perfect - MedMax source guidance complete"
      passText="Passing - MedMax source guidance"
    />
  );
}

export default function AgentToolsProductQuiz({
  questions = QUESTIONS,
  passingScore = PASSING_SCORE,
  perfectText = "Perfect - Source guidance complete",
  passText = "Passed - Source guidance",
  failText = "Does Not Pass",
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [complete, setComplete] = useState(false);

  const currentQuestion = questions[currentIndex];
  const currentAnswer = answers.find((answer) => answer.questionId === currentQuestion?.id);
  const score = useMemo(
    () => answers.filter((answer) => answer.correct).length,
    [answers]
  );
  const missed = useMemo(
    () =>
      answers
        .filter((answer) => !answer.correct)
        .map((answer) => ({
          ...answer,
          question: questions.find((item) => item.id === answer.questionId),
        }))
        .filter((answer) => answer.question),
    [answers, questions]
  );
  const answeredCount = answers.length;
  const scorePct = Math.round((score / questions.length) * 100);
  const progressPct = Math.round((answeredCount / questions.length) * 100);
  const passed = score >= passingScore;
  const statusText = score === questions.length ? perfectText : passed ? passText : failText;

  const resetQuiz = () => {
    setCurrentIndex(0);
    setAnswers([]);
    setComplete(false);
  };

  const answerQuestion = (choiceId) => {
    if (currentAnswer || complete) return;

    setAnswers((existing) => [
      ...existing,
      {
        questionId: currentQuestion.id,
        selected: choiceId,
        correct: choiceId === currentQuestion.answer,
      },
    ]);
  };

  const goNext = () => {
    if (currentIndex >= questions.length - 1) {
      setComplete(true);
      return;
    }

    setCurrentIndex((index) => index + 1);
  };

  if (complete) {
    return (
      <div className="at-quiz-shell">
        <div className={`at-quiz-final-card${passed ? " is-pass" : " is-fail"}`}>
          <div className="at-quiz-final-main">
            <span className="at-quiz-final-kicker">Final Score</span>
            <strong>{score}/{questions.length}</strong>
            <span>{scorePct}%</span>
          </div>
          <div className="at-quiz-final-status">
            {passed ? <CheckCircle size={18} /> : <XCircle size={18} />}
            <span>{statusText}</span>
            <small>Passing threshold: {passingScore}/{questions.length}</small>
          </div>
        </div>

        <div className="at-quiz-actions">
          <button className="at-quiz-secondary-btn" type="button" onClick={resetQuiz}>
            <RotateCw size={13} />
            Retake Quiz
          </button>
        </div>

        <section className="at-quiz-review">
          <div className="at-quiz-section-title">
            Missed Questions
            <span>{missed.length ? `${missed.length} missed` : "None"}</span>
          </div>

          {missed.length ? (
            <div className="at-quiz-missed-list">
              {missed.map(({ question, selected }) => (
                <article key={question.id} className="at-quiz-missed-card">
                  <div className="at-quiz-missed-question">
                    Q{question.id}. {question.question}
                  </div>
                  <div className="at-quiz-missed-meta">
                    <span>Your answer: {selected}) {getChoiceText(question, selected)}</span>
                    <span>Correct answer: {question.answer}) {getChoiceText(question, question.answer)}</span>
                  </div>
                  <p>{question.explanation}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="at-quiz-perfect">No missed questions. Perfect score.</div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="at-quiz-shell">
      <div className="at-quiz-status-row">
        <div className="at-quiz-stat">
          <span>Question</span>
          <strong>{currentIndex + 1}/{questions.length}</strong>
        </div>
        <div className="at-quiz-stat">
          <span>Score</span>
          <strong>{score}/{answeredCount}</strong>
        </div>
        <div className="at-quiz-stat">
          <span>Pass Mark</span>
          <strong>{passingScore}/{questions.length}</strong>
        </div>
      </div>

      <div className="at-quiz-progress" aria-label={`Quiz progress ${progressPct}%`}>
        <span style={{ width: `${progressPct}%` }} />
      </div>

      <section className="at-quiz-question-card">
        <div className="at-quiz-question-kicker">Question {currentQuestion.id}</div>
        <h4>{currentQuestion.question}</h4>

        <div className="at-quiz-choice-list">
          {currentQuestion.choices.map(([choiceId, choiceText]) => {
            const isCorrectChoice = choiceId === currentQuestion.answer;
            const isSelectedChoice = currentAnswer?.selected === choiceId;
            const stateClass =
              currentAnswer && isCorrectChoice
                ? " is-correct"
                : currentAnswer && isSelectedChoice
                  ? " is-wrong"
                  : currentAnswer
                    ? " is-muted"
                    : "";

            return (
              <button
                key={choiceId}
                className={`at-quiz-choice${stateClass}`}
                type="button"
                disabled={Boolean(currentAnswer)}
                onClick={() => answerQuestion(choiceId)}
              >
                <span className="at-quiz-choice-letter">{choiceId}</span>
                <span>{choiceText}</span>
              </button>
            );
          })}
        </div>
      </section>

      {currentAnswer ? (
        <section className={`at-quiz-feedback${currentAnswer.correct ? " is-correct" : " is-wrong"}`}>
          <div className="at-quiz-feedback-title">
            {currentAnswer.correct ? <CheckCircle size={15} /> : <XCircle size={15} />}
            <span>{currentAnswer.correct ? "Correct" : "Incorrect"}</span>
          </div>
          <div className="at-quiz-correct-answer">
            Correct answer: {currentQuestion.answer}) {getChoiceText(currentQuestion, currentQuestion.answer)}
          </div>
          <p>{currentQuestion.explanation}</p>
          <button className="at-quiz-next-btn" type="button" onClick={goNext}>
            {currentIndex >= questions.length - 1 ? "Finish Quiz" : "Next Question"}
          </button>
        </section>
      ) : null}
    </div>
  );
}

import { useState } from "react";
import { X } from "lucide-react";

const QUICK_SCRIPT_OPTIONS = [
  {
    id: "disenrolled",
    label: "Disenrolled",
  },
  {
    id: "check-in",
    label: "Follow Up",
  },
];

const QUICK_SCRIPTS = {
  ma: {
    disenrolled: {
      title: "MA — Disenrolled Client Reach-Out",
      sections: [
        {
          label: "Opener",
          lines: [
            "Hey [Name], this is [Agent] with New Gen Health Solutions. I saw your Medicare Advantage plan showed a disenrollment and wanted to check in, is now an okay time?",
          ],
        },
        {
          label: "Discovery",
          lines: [
            "Were you aware you'd been disenrolled, or did that catch you off guard?",
            "What happened on your end, did something change or did you make a switch?",
            "Do you have coverage in place right now, or are you without a plan?",
          ],
        },
        {
          label: "If uncovered",
          hint: "Use SEP finder",
          lines: [
            "Based on what happened, you may qualify for a special enrollment period to get back on a plan. Want me to check what you qualify for?",
          ],
        },
        {
          label: "New Plan Check",
          lines: [
            "Now that we've confirmed you have a new plan, are you happy with the coverage and benefits, or is there anything that doesn't feel right?",
          ],
        },
      ],
      branches: [
        {
          id: "happy",
          buttonLabel: "Happy With Plan",
          label: "If Happy With New Plan",
          hint: "Follow up October 15",
          lines: [
            "I'm glad the new plan is working for you. We'll contact you when Medicare's Annual Enrollment Period, often called Open Enrollment, begins on October 15 so we can complete a full benefit review and make sure your coverage still fits your needs for the coming year.",
          ],
        },
        {
          id: "unhappy",
          buttonLabel: "Unhappy / Unexpected Switch",
          label: "If Unhappy or Switch Was Unexpected",
          hint: "Review now",
          lines: [
            "If you're unhappy with the plan, or you did not knowingly authorize the change, let's complete a full benefit review now. We'll verify your current coverage, look for any unauthorized or concerning changes, and go over the options available to you.",
          ],
        },
      ],
    },
    "check-in": {
      title: "MA — Current Client Check-In / Ancillary",
      sections: [
        {
          label: "Opener",
          lines: [
            "Hey [Name], this is [Agent] with New Gen Health Solutions, just calling to say thanks for trusting us with your Medicare coverage.",
          ],
        },
        {
          label: "Check-In",
          lines: [
            "How have you been?",
            "How's the plan been treating you, any issues with doctors or prescriptions?",
            "Good to hear. While I've got you, we also help members with things like dental, vision, or hospital indemnity coverage since Medicare doesn't cover a lot of that. Is that something you'd want to hear more about?",
          ],
        },
        {
          label: "Close",
          lines: [
            "No pressure, just wanted to check in and let you know it's available if you ever want it.",
          ],
        },
      ],
    },
  },
  aca: {
    disenrolled: {
      title: "ACA — Disenrolled Client Reach-Out",
      sections: [
        {
          label: "Opener",
          lines: [
            "Hi [Name], this is [Agent] with New Gen Health Solutions. Your marketplace plan showed as disenrolled and I wanted to reach out, got a minute?",
          ],
        },
        {
          label: "Discovery",
          lines: [
            "Were you aware your ACA plan ended, or is this news to you?",
            "What happened, did income or household change, or was it something with the exchange?",
            "Do you have coverage now, or has there been a gap?",
          ],
        },
        {
          label: "If uncovered",
          hint: "Use SEP finder",
          lines: [
            "Depending on what caused it, you may qualify for a special enrollment period. Want me to look into that for you?",
          ],
        },
        {
          label: "Close",
          lines: [
            "Happy to check eligibility, only takes a few minutes.",
          ],
        },
      ],
    },
    "check-in": {
      title: "ACA — Current Client Check-In / Ancillary",
      sections: [
        {
          label: "Opener",
          lines: [
            "Hi [Name], this is [Agent] with New Gen Health Solutions, wanted to say thanks for letting us help with your health plan.",
          ],
        },
        {
          label: "Check-In",
          lines: [
            "How have things been going?",
            "How's the plan working out, any trouble with claims or providers?",
            "One other thing, we also offer options like dental, vision, accident, or cancer policies to fill in gaps your ACA plan doesn't cover. Would you want to hear more about those?",
          ],
        },
        {
          label: "Close",
          lines: [
            "Totally fine if not, just wanted you to know it's there if it'd help.",
          ],
        },
      ],
    },
  },
};

export default function ClientQuickScripts({ flowType }) {
  const [activeScriptId, setActiveScriptId] = useState(null);
  const [activeBranchId, setActiveBranchId] = useState(null);
  const flowScripts = QUICK_SCRIPTS[flowType];
  const activeScript = activeScriptId ? flowScripts?.[activeScriptId] : null;
  const activeBranch = activeScript?.branches?.find(
    (branch) => branch.id === activeBranchId,
  );
  const panelId = `${flowType}-client-quick-script`;

  if (!flowScripts) return null;

  const handleSelect = (scriptId) => {
    setActiveBranchId(null);
    setActiveScriptId((current) => (current === scriptId ? null : scriptId));
  };

  const handleClose = () => {
    setActiveBranchId(null);
    setActiveScriptId(null);
  };

  return (
    <div className={`client-quick-scripts client-quick-scripts--${flowType}`}>
      <div className="client-quick-scripts__buttons" aria-label={`${flowType.toUpperCase()} client scripts`}>
        {QUICK_SCRIPT_OPTIONS.map((option) => {
          const active = activeScriptId === option.id;

          return (
            <button
              key={option.id}
              type="button"
              className={`client-quick-scripts__button${active ? " is-active" : ""}`}
              aria-controls={panelId}
              aria-expanded={active}
              onClick={() => handleSelect(option.id)}
            >
              <span className="client-quick-scripts__beacon" aria-hidden="true" />
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>

      {activeScript ? (
        <section id={panelId} className="client-quick-script-panel">
          <header className="client-quick-script-panel__header">
            <div>
              <span>Quick Script</span>
              <h2>{activeScript.title}</h2>
            </div>
            <button
              type="button"
              className="client-quick-script-panel__close"
              onClick={handleClose}
              aria-label={`Close ${activeScript.title}`}
              title="Close quick script"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </header>

          <div className="client-quick-script-panel__body">
            {activeScript.sections.map((section) => (
              <div className="client-quick-script-section" key={section.label}>
                <div className="client-quick-script-section__label">
                  {section.label}
                  {section.hint ? (
                    <span className="client-quick-script-section__hint">
                      ({section.hint})
                    </span>
                  ) : null}
                </div>
                <div className="client-quick-script-section__lines">
                  {section.lines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </div>
            ))}

            {activeScript.branches ? (
              <div className="client-quick-script-branches">
                <span className="client-quick-script-branches__prompt">
                  Choose the client's response
                </span>
                <div
                  className="client-quick-script-branches__choices"
                  role="group"
                  aria-label="New plan satisfaction"
                >
                  {activeScript.branches.map((branch) => (
                    <button
                      key={branch.id}
                      type="button"
                      className={`client-quick-script-branch-button client-quick-script-branch-button--${branch.id}${
                        activeBranchId === branch.id ? " is-active" : ""
                      }`}
                      aria-pressed={activeBranchId === branch.id}
                      onClick={() => setActiveBranchId(branch.id)}
                    >
                      {branch.buttonLabel}
                    </button>
                  ))}
                </div>

                {activeBranch ? (
                  <div className="client-quick-script-section client-quick-script-branch-result">
                    <div className="client-quick-script-section__label">
                      {activeBranch.label}
                      <span className="client-quick-script-section__hint">
                        ({activeBranch.hint})
                      </span>
                    </div>
                    <div className="client-quick-script-section__lines">
                      {activeBranch.lines.map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

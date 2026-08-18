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
          label: "Close",
          lines: [
            "I can pull that up in a couple minutes, no pressure either way.",
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
  const flowScripts = QUICK_SCRIPTS[flowType];
  const activeScript = activeScriptId ? flowScripts?.[activeScriptId] : null;
  const panelId = `${flowType}-client-quick-script`;

  if (!flowScripts) return null;

  const handleSelect = (scriptId) => {
    setActiveScriptId((current) => (current === scriptId ? null : scriptId));
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
              onClick={() => setActiveScriptId(null)}
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
          </div>
        </section>
      ) : null}
    </div>
  );
}

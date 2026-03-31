import React from "react";
import { useScript } from "../context/ScriptContext";
import { ScriptBox, LockText, SectionToast } from "./SharedUI";
import SectionCoach from "./SectionCoach";

/* ---- Optional Product Sub-section ---- */
function OptionalProduct({
  title,
  buttonLabel,
  isActive,
  consentOk,
  discussed,
  onActivate,
  onConsent,
  onDiscussed,
  consentScript,
  detailScript,
  discussedLabel,
}) {
  return (
    <>
      {!isActive && (
        <div className="optional-product-trigger">
          <button className="btn-clay" onClick={onActivate}>
            {buttonLabel}
          </button>
        </div>
      )}

      {isActive && (
        <div className="optional-product">
          <ScriptBox verbatim>{consentScript}</ScriptBox>

          <label className="check">
            <input
              type="checkbox"
              checked={consentOk}
              onChange={(e) => onConsent(e.target.checked)}
            />
            Permission granted to discuss non-Medicare product
          </label>

          {consentOk && (
            <>
              <ScriptBox verbatim>{detailScript}</ScriptBox>

              <label className="check">
                <input
                  type="checkbox"
                  checked={discussed}
                  onChange={(e) => onDiscussed(e.target.checked)}
                />
                {discussedLabel}
              </label>
            </>
          )}

          {!consentOk && (
            <LockText>
              Permission is required before discussing optional coverage.
            </LockText>
          )}
        </div>
      )}
    </>
  );
}

export default React.memo(function SectionWrapUp() {
  const { state, dispatch, activeSection, unlocked } = useScript();
  const {
    enrollOk,
    hiActive,
    hiConsentOk,
    hiDiscussed,
    dvActive,
    dvConsentOk,
    dvDiscussed,
    feActive,
    feConsentOk,
    feDiscussed,
    notes,
  } = state;
  const isActive = activeSection === 8;

  return (
    <section
      className={`card ${isActive ? "active-card" : ""} ${
        unlocked.s8 ? "" : "disabled"
      }`}
    >
      <SectionToast sectionNum={8} timestamps={state.sectionTimestamps} />
      <h2>
        8) Wrap-Up
      </h2>

      {unlocked.s8 && (
        <>
          <ScriptBox verbatim>
            {`"You will receive an Evidence of Coverage (EOC) document that explains all of the plan's benefits, costs, and rules in detail."
"You have the right to cancel this plan before it becomes effective if you change your mind."
"Once you are a member, you have the right to appeal plan decisions about payment of benefits or coverage of services if you disagree. This is explained in the Evidence of Coverage."
"Medicare evaluates plans yearly using a 5-Star rating system. You can review the plan's Star Rating and Summary of Benefits on Medicare.gov or the plan's website."`}
          </ScriptBox>

          <ScriptBox verbatim>
            {`"The plan's proposed effective date is [effective date], subject to approval by Medicare."
"If you have any questions about your plan or if your needs change and you want to look at other plan options, please give me a call at [877-909-1995]."

"Great news, your Medicare enrollment is all set. Now, you mentioned earlier you might be interested in [dental/vision/hearing/hospital coverage/life coverage]. These are separate from Medicare and completely optional, but I can give you a quick overview if you'd like. Want me to go over that now or would you prefer I call you back another time?"

Call closing: "It's been a pleasure speaking with you today. If you have any family members or friends that would benefit by speaking with me, please give them my number and I would be happy to assist them too."
End the call: "Thank you for [calling/choosing] [Carrier name] and have a great day!"`}
          </ScriptBox>

          {/* Agent reminder */}
          <ScriptBox>
            <strong className="agent-reminder-label">
              AGENT REMINDER (NOT READ VERBATIM):
            </strong>
            {"\n"}After enrollment, complete the HRA with the customer on the
            phone (if applicable for the plan) before ending the call. Enter
            Enrollment Code & Customer Info in NGHS Digital Sales Google Sheet.
            Set status as a sale on EnrollHere.
          </ScriptBox>

          {/* ===== OPTIONAL HOSPITAL INDEMNITY ===== */}
          <OptionalProduct
            title="Hospital Indemnity"
            buttonLabel="Optional Hospital Indemnity"
            isActive={hiActive}
            consentOk={hiConsentOk}
            discussed={hiDiscussed}
            onActivate={() =>
              dispatch({ type: "SET_GATE", field: "hiActive", value: true })
            }
            onConsent={(v) =>
              dispatch({ type: "SET_GATE", field: "hiConsentOk", value: v })
            }
            onDiscussed={(v) =>
              dispatch({ type: "SET_GATE", field: "hiDiscussed", value: v })
            }
            consentScript={`"Before we end the call, I want to be very clear that what we are discussing next is NOT a Medicare plan and is NOT affiliated with Medicare. Your Medicare Advantage enrollment is complete and will not change. This is a separate, optional insurance product that provides cash benefits directly to you. Would it be okay if I briefly explain how it works?"`}
            detailScript={`"This is called hospital indemnity insurance.
It does not replace Medicare and it does not pay doctors or hospitals.
If you are admitted to the hospital for a covered stay, it pays a fixed cash benefit directly to you.
That money can be used however you choose, such as deductibles, copays, prescriptions, rent, or household expenses.
Coverage, benefit amounts, and eligibility depend on the policy terms."`}
            discussedLabel="Hospital indemnity explained (non-Medicare)"
          />

          {/* ===== OPTIONAL DENTAL & VISION ===== */}
          <OptionalProduct
            title="Dental & Vision"
            buttonLabel="Optional Dental & Vision"
            isActive={dvActive}
            consentOk={dvConsentOk}
            discussed={dvDiscussed}
            onActivate={() =>
              dispatch({ type: "SET_GATE", field: "dvActive", value: true })
            }
            onConsent={(v) =>
              dispatch({ type: "SET_GATE", field: "dvConsentOk", value: v })
            }
            onDiscussed={(v) =>
              dispatch({ type: "SET_GATE", field: "dvDiscussed", value: v })
            }
            consentScript={`"Before we finish, I want to be clear that what we are discussing next is NOT a Medicare plan and is NOT affiliated with Medicare.
Your Medicare Advantage enrollment is complete and will not change.
This is a separate, optional dental and vision insurance product.
Would it be okay if I briefly explain how it works?"`}
            detailScript={`"This dental and vision coverage is separate from Medicare.
It may help with routine dental and vision expenses such as exams, cleanings, fillings, glasses, or contacts, depending on the plan selected. Coverage details, limitations, and waiting periods depend on the policy terms."`}
            discussedLabel="Dental & vision explained (non-Medicare)"
          />

          {/* ===== OPTIONAL FINAL EXPENSE ===== */}
          <OptionalProduct
            title="Final Expense"
            buttonLabel="Optional Final Expense"
            isActive={feActive}
            consentOk={feConsentOk}
            discussed={feDiscussed}
            onActivate={() =>
              dispatch({ type: "SET_GATE", field: "feActive", value: true })
            }
            onConsent={(v) =>
              dispatch({ type: "SET_GATE", field: "feConsentOk", value: v })
            }
            onDiscussed={(v) =>
              dispatch({ type: "SET_GATE", field: "feDiscussed", value: v })
            }
            consentScript={`"Before we finish, I want to be very clear that what we are discussing next is NOT a Medicare plan and is NOT affiliated with Medicare. Your Medicare Advantage enrollment is complete and will not change.
This is a separate, optional life insurance product often referred to as final expense coverage.
Would it be okay if I briefly explain how it works?"`}
            detailScript={`"Final expense insurance is a form of life insurance.
It is designed to provide a cash benefit to a beneficiary when you pass away.
That money can be used for funeral costs, medical bills, or other end-of-life expenses.
Coverage amounts, premiums, and underwriting requirements depend on the policy selected."`}
            discussedLabel="Final expense explained (non-Medicare)"
          />

          <SectionCoach stepName="Wrap-Up" sectionNum={8} />
        </>
      )}

      <label>
        Confirmation Number (local note)
        <input
          disabled={!enrollOk}
          value={notes.confirmation}
          onChange={(e) =>
            dispatch({
              type: "SET_NOTE",
              field: "confirmation",
              value: e.target.value,
            })
          }
          placeholder="Confirmation / reference #"
        />
      </label>

      {!enrollOk && (
        <LockText>Locked until Enrollment is marked submitted.</LockText>
      )}
      {enrollOk && (
        <p className="ok">
          ✅ Flow complete. (No data saved — local session only.)
        </p>
      )}
    </section>
  );
});

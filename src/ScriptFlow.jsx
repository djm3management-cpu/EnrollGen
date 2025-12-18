import { useMemo, useState, useEffect } from "react";

/* ===================== TIMER HELPERS ===================== */
function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function useSectionTimer(active) {
  const [start, setStart] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let i;
    if (active) {
      const now = Date.now();
      setStart((s) => s ?? now);
      i = setInterval(() => {
        setElapsed(Date.now() - (start ?? now));
      }, 500);
    }
    return () => clearInterval(i);
  }, [active, start]);

  return formatTime(elapsed);
}

/* ===================== SCRIPT BOX ===================== */
function ScriptBox({ children, verbatim }) {
  return (
    <div
      style={{
        background: "#1e1f23",
        border: verbatim ? "2px solid #f1c40f" : "1px solid #3a3d45",
        padding: "10px",
        borderRadius: 4,
        maxHeight: 220,
        overflowY: "auto",
        fontSize: 13,
        lineHeight: 1.45,
        margin: "10px 0 12px",
        whiteSpace: "pre-wrap",
      }}
    >
      {verbatim && (
        <div
          style={{
            fontWeight: 800,
            color: "#f1c40f",
            marginBottom: 6,
            fontSize: 12,
            letterSpacing: 0.3,
          }}
        >
          READ VERBATIM
        </div>
      )}
      {children}
    </div>
  );
}

/* ===================== MAIN FLOW ===================== */
export default function ScriptFlow() {
  // ====== SECTION GATES ======
  const [recordingOk, setRecordingOk] = useState(false);
  const [tpmoOk, setTpmoOk] = useState(false);
  const [soaOk, setSoaOk] = useState(false);
  const [neadsOk, setNeadsOk] = useState(false);
  const [sobOk, setSobOk] = useState(false);
  const [enrollOk, setEnrollOk] = useState(false);

  // ====== ACTIVE SECTION ======
  const activeSection = !recordingOk
    ? 1
    : !tpmoOk
    ? 2
    : !soaOk
    ? 3
    : !neadsOk
    ? 4
    : !sobOk
    ? 5
    : !enrollOk
    ? 6
    : 7;

  // ====== SECTION TIMERS ======
  const t1 = useSectionTimer(activeSection === 1);
  const t2 = useSectionTimer(activeSection === 2);
  const t3 = useSectionTimer(activeSection === 3);
  const t4 = useSectionTimer(activeSection === 4);
  const t5 = useSectionTimer(activeSection === 5);
  const t6 = useSectionTimer(activeSection === 6);
  const t7 = useSectionTimer(activeSection === 7);

  // ====== MAIN TPMO TIMER (MANUAL) ======
  const [tpmoRunning, setTpmoRunning] = useState(false);
  const [tpmoStart, setTpmoStart] = useState(null);
  const [tpmoElapsed, setTpmoElapsed] = useState(0);

  useEffect(() => {
    if (!tpmoRunning || tpmoOk) return;
    const i = setInterval(() => {
      setTpmoElapsed(Date.now() - tpmoStart);
    }, 500);
    return () => clearInterval(i);
  }, [tpmoRunning, tpmoStart, tpmoOk]);

  const startMainTimer = () => {
    setTpmoStart(Date.now());
    setTpmoElapsed(0);
    setTpmoRunning(true);
  };

  const resetMainTimer = () => {
    setTpmoRunning(false);
    setTpmoStart(null);
    setTpmoElapsed(0);
  };

  const mainTimer = formatTime(tpmoElapsed);

  // ====== LOCAL NOTES ======
  const [notes, setNotes] = useState({
    planName: "",
    effectiveDate: "",
    enrollmentCode: "",
    confirmation: "",
  });

  // ====== CHECKLISTS (RESTORED FULL) ======
  const [preEnrollChecks, setPreEnrollChecks] = useState({
    providers: false,
    rx: false,
    costs: false,
    moop: false,
    rules: false,
    coverageImpact: false,
  });

  const [sobChecks, setSobChecks] = useState({
    premium: false,
    deductible: false,
    moop: false,
    network: false,
    rx: false,
    referralsPA: false,
    extras: false,
    limitations: false,
  });

  const [enrollChecks, setEnrollChecks] = useState({
    epConfirmed: false,
    piiConsent: false,
    planConfirm: false,
    submitConsent: false,
  });

  const preEnrollAllDone = useMemo(
    () => Object.values(preEnrollChecks).every(Boolean),
    [preEnrollChecks]
  );

  const sobAllDone = useMemo(
    () => Object.values(sobChecks).every(Boolean),
    [sobChecks]
  );

  const enrollAllDone = useMemo(
    () => Object.values(enrollChecks).every(Boolean),
    [enrollChecks]
  );

  const lockText = (msg) => <p className="lock">{msg}</p>;
  const card = (n) => `card ${activeSection === n ? "active-card" : ""}`;
  const unlocked = {
    s1: true,
    s2: recordingOk,
    s3: tpmoOk,
    s4: soaOk,
    s5: neadsOk,
    s6: sobOk,
    s7: enrollOk,
  };

  const enrollmentCodeOk = (notes.enrollmentCode || "").trim().length >= 4;

  return (
    <div className="flow">
      {/* ===================== MAIN TPMO TIMER ===================== */}
      <section className="card">
        <h2 style={{ justifyContent: "center" }}>
          <span className="digital">{mainTimer}</span>
        </h2>

        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button className="primary" onClick={startMainTimer}>
            Start Timer
          </button>
          <button className="primary" onClick={resetMainTimer}>
            Reset Timer
          </button>
        </div>

        <p
          className="muted"
          style={{ textAlign: "center", fontWeight: 800, marginTop: 8 }}
        >
          TPMO REQUIRED WITHIN 60 SECONDS 🕰️
        </p>
      </section>

      {/* ===================== 1) RECORDING ===================== */}
      <section className={card(1)}>
        <h2>
          1) Recording Disclosure <span className="timer">{t1}</span>
        </h2>

        {unlocked.s1 && (
          <ScriptBox verbatim>
            {`“Thank you for calling New Gen Health Solutions. My name is [First and Last Name]. I am a licensed sales agent on a recorded line. Who do I have the pleasure of speaking with?”
(Agent to wait for caller to respond).

“Please know our call will be recorded for quality and training purposes; is it ok if I continue?”`}
          </ScriptBox>
        )}

        <label className="check">
          <input
            type="checkbox"
            checked={recordingOk}
            onChange={(e) => setRecordingOk(e.target.checked)}
          />
          Recording disclosure read (verbatim)
        </label>

        {!recordingOk && lockText("Complete Recording Disclosure to continue.")}
      </section>

      {/* ===================== 2) TPMO ===================== */}
      <section className={`${card(2)} ${recordingOk ? "" : "disabled"}`}>
        <h2>
          2) TPMO Disclaimer <span className="timer">{t2}</span>
        </h2>

        {unlocked.s2 && (
          <ScriptBox verbatim>
            {`
“We do not offer every plan available in your area. Currently we represent [insert number of organizations] organizations which offer [insert number of plans] products in your area. Please contact Medicare.gov, 1-800-MEDICARE, or your local State Health Insurance Program (SHIP) to get information on all of your options.”

“Plans are insured or covered by a Medicare Advantage (HMO, PPO, PFFS) organization with a Medicare contract and/or a Medicare-approved Part D sponsor. Enrollment in the plan depends on the plan’s contract renewal with Medicare.”`}
          </ScriptBox>
        )}

        <label className="check">
          <input
            type="checkbox"
            disabled={!recordingOk}
            checked={tpmoOk}
            onChange={(e) => setTpmoOk(e.target.checked)}
          />
          TPMO disclaimer read (verbatim)
        </label>

        {!recordingOk &&
          lockText("Locked until Recording Disclosure is complete.")}
        {recordingOk && !tpmoOk && lockText("Complete TPMO to continue.")}
      </section>

      {/* ===================== 3) SOA ===================== */}
      <section className={`${card(3)} ${tpmoOk ? "" : "disabled"}`}>
        <h2>
          3) Scope of Appointment <span className="timer">{t3}</span>
        </h2>

        {unlocked.s3 && (
          <ScriptBox verbatim>
            {`“I work for New Gen Health Solutions, and in your area, we have a wide variety of plans such as”
(Agent to list out all product types available). [Medicare Advantage plans, Medicare Advantage Prescription Drug plans].
“Would you like to discuss all of these options or are you only interested in certain ones?”
(Must wait for an affirmative response)

“I can give you a brief overview of each of these plans, then you can decide which plan might be best for you based on your needs. Would that be ok?”
(Agent to wait for response).

“This conversation has no effect on your current or future health coverage unless you enroll in a plan today. Talking to me does not obligate you to enroll or automatically enroll you in a plan.”
(An affirmative response is required).`}
          </ScriptBox>
        )}

        <label className="check">
          <input
            type="checkbox"
            disabled={!tpmoOk}
            checked={soaOk}
            onChange={(e) => setSoaOk(e.target.checked)}
          />
          SOA completed / permission confirmed
        </label>

        {!tpmoOk && lockText("Locked until TPMO is complete.")}
        {tpmoOk && !soaOk && lockText("SOA required before Needs Assessment.")}
      </section>

      {/* ===================== 4) NEADS ===================== */}
      <section className={`${card(4)} ${soaOk ? "" : "disabled"}`}>
        <h2>
          4) NEADS Assessment <span className="timer">{t4}</span>
        </h2>

        {unlocked.s4 && (
          <ScriptBox verbatim>
            {`“I am going to ask you some optional questions to help determine the plans best suited for your needs.”
“What is your current coverage for health? RX, dental, and vision?”
“Who is your current primary care physician?”
“Do you see any specialists? If so, who?”
Is there a particular hospital or any other preferred facilities we should check network status for?
“What medications do you take regularly?”
“What do you pay for each?”
“Which Pharmacy do you use to fill your prescriptions?”

CMS regulations require that agents ensure that, prior to an enrollment, CMS’ required questions and topics regarding beneficiary needs in a health plan choice are fully discussed. Topics include:
- Information regarding primary care providers and specialists (whether or not the beneficiary’s current providers are in the plan’s network)
- Prescription drug coverage and costs (including whether or not the beneficiary’s current prescriptions are covered)
- Costs of health care services
- Premiums (Plan premium amount monthly, quarterly, annually and Part B premium)
- Benefits
- Specific health care needs such as durable medical equipment or physical therapy

Agent to provide recap/Summary:
“I’ll summarize my notes for you. Did we get it all? Do you have any other health care needs?”`}
          </ScriptBox>
        )}

        <h3>Pre-Enrollment Checklist</h3>
        <div className="checklist">
          {renderCheck(
            preEnrollChecks.providers,
            "Provider network reviewed",
            (v) => setPreEnrollChecks((s) => ({ ...s, providers: v })),
            !soaOk
          )}
          {renderCheck(
            preEnrollChecks.rx,
            "Prescription coverage reviewed",
            (v) => setPreEnrollChecks((s) => ({ ...s, rx: v })),
            !soaOk
          )}
          {renderCheck(
            preEnrollChecks.costs,
            "Copays / cost sharing reviewed",
            (v) => setPreEnrollChecks((s) => ({ ...s, costs: v })),
            !soaOk
          )}
          {renderCheck(
            preEnrollChecks.moop,
            "MOOP explained",
            (v) => setPreEnrollChecks((s) => ({ ...s, moop: v })),
            !soaOk
          )}
          {renderCheck(
            preEnrollChecks.rules,
            "Plan rules (HMO/PPO) explained",
            (v) => setPreEnrollChecks((s) => ({ ...s, rules: v })),
            !soaOk
          )}
          {renderCheck(
            preEnrollChecks.coverageImpact,
            "Effect on current coverage explained",
            (v) => setPreEnrollChecks((s) => ({ ...s, coverageImpact: v })),
            !soaOk
          )}
        </div>

        <button
          className="primary"
          disabled={!soaOk || !preEnrollAllDone}
          onClick={() => setNeadsOk(true)}
        >
          Mark NEADS Complete
        </button>

        {!soaOk && lockText("Locked until SOA is complete.")}
        {soaOk &&
          !preEnrollAllDone &&
          lockText("Complete the Pre-Enrollment Checklist to proceed.")}
      </section>

      {/* ===================== 5) SOB ===================== */}
      <section className={`${card(5)} ${neadsOk ? "" : "disabled"}`}>
        <h2>
          5) Summary of Benefits <span className="timer">{t5}</span>
        </h2>

        {unlocked.s5 && (
          <ScriptBox verbatim>
            {`“Before making an enrollment decision, it is important that you fully understand the plan’s benefits and rules. I will cover the plan requirements (disclosures), review the Pre-enrollment checklist and the Summary of Benefits and answer any questions you have. The pre-enrollment checklist, can also be reviewed on [carrier’s name] website.”

“Do you understand the benefits we discussed earlier or have any other questions before we get started?”
(agent to wait for response)`}
          </ScriptBox>
        )}

        <div className="checklist">
          {renderCheck(
            sobChecks.premium,
            "Premium reviewed",
            (v) => setSobChecks((s) => ({ ...s, premium: v })),
            !neadsOk
          )}
          {renderCheck(
            sobChecks.deductible,
            "Deductible reviewed",
            (v) => setSobChecks((s) => ({ ...s, deductible: v })),
            !neadsOk
          )}
          {renderCheck(
            sobChecks.moop,
            "Maximum Out-of-Pocket (MOOP) reviewed",
            (v) => setSobChecks((s) => ({ ...s, moop: v })),
            !neadsOk
          )}
          {renderCheck(
            sobChecks.network,
            "Provider network rules reviewed",
            (v) => setSobChecks((s) => ({ ...s, network: v })),
            !neadsOk
          )}
          {renderCheck(
            sobChecks.rx,
            "Prescription drug coverage reviewed",
            (v) => setSobChecks((s) => ({ ...s, rx: v })),
            !neadsOk
          )}
          {renderCheck(
            sobChecks.referralsPA,
            "Referrals / prior authorization discussed (if applicable)",
            (v) => setSobChecks((s) => ({ ...s, referralsPA: v })),
            !neadsOk
          )}
          {renderCheck(
            sobChecks.extras,
            "Extra benefits reviewed (if applicable)",
            (v) => setSobChecks((s) => ({ ...s, extras: v })),
            !neadsOk
          )}
          {renderCheck(
            sobChecks.limitations,
            "Limitations / restrictions reviewed",
            (v) => setSobChecks((s) => ({ ...s, limitations: v })),
            !neadsOk
          )}
        </div>

        <button
          className="primary"
          disabled={!neadsOk || !sobAllDone}
          onClick={() => setSobOk(true)}
        >
          Mark SOB Review Complete
        </button>

        {!neadsOk && lockText("Locked until NEADS is complete.")}
        {neadsOk &&
          !sobAllDone &&
          lockText("Complete the SOB checklist to proceed.")}
      </section>

      {/* ===================== 6) ENROLLMENT ===================== */}
      <section className={`${card(6)} ${sobOk ? "" : "disabled"}`}>
        <h2>
          6) Enrollment <span className="timer">{t6}</span>
        </h2>

        {unlocked.s6 && (
          <ScriptBox verbatim>
            {`Section 7: Transition to Enrollment.
“Mr./Ms. , if you are ready to enroll today, we will now move to the enrollment process.”

7.1 Transition to Enrollment: Inbound call.
“For Inbound Calls read: “I can enroll you today over the telephone in this [specific plan name] Enrolling in this plan today will replace the current [clarify existing coverage type] coverage that you have today. Once approved by Medicare, your new [clarify new plan coverage type] plan coverage will begin on [effective date]. Would you like to proceed with enrollment in the selected plan?”
(agent to wait for beneficiary response)

Section 8: Telephonic Enrollment.
“Based on what we have discussed, it sounds like you are interested in [plan name, type and contract number with PBP]. Is that correct?”`}
          </ScriptBox>
        )}

        <div className="grid">
          <label>
            Plan Name (local note)
            <input
              disabled={!sobOk}
              value={notes.planName}
              onChange={(e) =>
                setNotes((s) => ({ ...s, planName: e.target.value }))
              }
              placeholder="Plan name"
            />
          </label>

          <label>
            Effective Date (local note)
            <input
              disabled={!sobOk}
              value={notes.effectiveDate}
              onChange={(e) =>
                setNotes((s) => ({ ...s, effectiveDate: e.target.value }))
              }
              placeholder="MM/DD/YYYY"
            />
          </label>
        </div>

        <h3>Enrollment Confirmations</h3>
        <div className="checklist">
          {renderCheck(
            enrollChecks.epConfirmed,
            "Election period / eligibility confirmed",
            (v) => setEnrollChecks((s) => ({ ...s, epConfirmed: v })),
            !sobOk
          )}
          {renderCheck(
            enrollChecks.piiConsent,
            "Consent to collect necessary information (PII) confirmed",
            (v) => setEnrollChecks((s) => ({ ...s, piiConsent: v })),
            !sobOk
          )}
          {renderCheck(
            enrollChecks.planConfirm,
            "Beneficiary confirmed plan selection",
            (v) => setEnrollChecks((s) => ({ ...s, planConfirm: v })),
            !sobOk
          )}
          {renderCheck(
            enrollChecks.submitConsent,
            "Beneficiary authorized submission of enrollment",
            (v) => setEnrollChecks((s) => ({ ...s, submitConsent: v })),
            !sobOk
          )}
        </div>

        <button
          className="primary"
          disabled={!sobOk || !enrollAllDone}
          onClick={() => setEnrollOk(true)}
        >
          Mark Enrollment Submitted
        </button>

        {/* Enrollment Code + Green Check (requested) */}
        <div style={{ marginTop: 12 }}>
          <label>
            Enrollment / Application ID (enter after submission)
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                disabled={!enrollOk}
                value={notes.enrollmentCode}
                onChange={(e) =>
                  setNotes((s) => ({ ...s, enrollmentCode: e.target.value }))
                }
                placeholder="Enrollment / Application #"
                style={{ flex: 1 }}
              />
              <span
                style={{
                  fontWeight: 900,
                  fontSize: 18,
                  opacity: enrollOk && enrollmentCodeOk ? 1 : 0.2,
                  color: "#2ecc71",
                }}
                title="Entered"
              >
                ✅
              </span>
            </div>
          </label>
          {!enrollOk &&
            lockText(
              "Enter Enrollment/Application ID after Enrollment is submitted."
            )}
        </div>

        {!sobOk && lockText("Locked until SOB Review is complete.")}
        {sobOk &&
          !enrollAllDone &&
          lockText("Complete all enrollment confirmations to proceed.")}
      </section>

      {/* ===================== 7) WRAP ===================== */}
      <section className={`${card(7)} ${enrollOk ? "" : "disabled"}`}>
        <h2>
          7) Wrap-Up <span className="timer">{t7}</span>
        </h2>

        {unlocked.s7 && (
          <>
            <ScriptBox verbatim>
              {`“Do you understand the benefits and conditions of enrollment as they have been explained for the[specific plan name] (eg”Generic Medicare Sunshine PPO). ?”
“Do you understand that we will release information to Medicare and other plans as is necessary for treatment, payment and healthcare operations?”
“Do you understand that you are enrolling in the plan [specific plan name] (eg”Generic Medicare Sunshine PPO). for a monthly premium of no more than [$ amount]?”
“The plan’s proposed effective date is [effective date], subject to approval by Medicare.”
“You will receive a notice in the mail acknowledging receipt of the enrollment.”
“You should receive plan information from [carrier name] including your member ID card in the mail within [7-10] business days of enrollment, but no later than within [ten] days of the plan effective date. You may also access plan materials online at [carrier’s URL address].”
“If you have any questions about your plan or if your needs change and you want to look at other plan options, please give me a call at [877-909-1995].”

Section 9: Call closing.
“It’s been a pleasure speaking with you today. If you have any family members or friends that would benefit by speaking with me, please give them my number and I would be happy to assist them too.”
End the call: “Thank you for [calling/choosing] [Carrier name] and have a great day!”`}
            </ScriptBox>

            {/* Extra agent reminder (requested) */}
            <ScriptBox>
              <strong style={{ color: "#a78bfa" }}>
                AGENT REMINDER (NOT READ VERBATIM):
              </strong>
              {"\n"}After enrollment, complete the HRA with the customer on the
              phone (if applicable for the plan) before ending the call.
            </ScriptBox>
          </>
        )}

        <label>
          Confirmation Number (local note)
          <input
            disabled={!enrollOk}
            value={notes.confirmation}
            onChange={(e) =>
              setNotes((s) => ({ ...s, confirmation: e.target.value }))
            }
            placeholder="Confirmation / reference #"
          />
        </label>

        {!enrollOk && lockText("Locked until Enrollment is marked submitted.")}
        {enrollOk && (
          <p className="ok">
            ✅ Flow complete. (No data saved — local session only.)
          </p>
        )}
      </section>
    </div>
  );
}

/* ===================== CHECK HELPER ===================== */
function renderCheck(value, label, onChange, disabled) {
  return (
    <label className={`check ${disabled ? "disabledRow" : ""}`}>
      <input
        type="checkbox"
        checked={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

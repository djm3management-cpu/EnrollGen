import { useMemo, useState, useEffect } from "react";

/* ===================== TIMER HELPERS ===================== */
function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}
function countWords(text) {
  if (!text) return 0;
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

function calcWpm(words, ms) {
  if (ms < 6000) return 0; // warm-up period
  const minutes = ms / 60000;
  return Math.round(words / minutes);
}

function paceLevel(wpm) {
  if (wpm === 0) return "idle";
  if (wpm < 105) return "slow";
  if (wpm <= 175) return "good";
  if (wpm <= 195) return "fast";
  return "too-fast";
}

function useSectionTimer(active) {
  const [start, setStart] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  function useSectionTimer(active) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
      if (!active) {
        setElapsed(0);
        return;
      }

      const start = Date.now();
      const i = setInterval(() => {
        setElapsed(Date.now() - start);
      }, 500);

      return () => clearInterval(i);
    }, [active]);

    return formatTime(elapsed);
  }

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
        background:
          "linear-gradient(180deg, rgba(5,5,10,0.98), rgba(25,20,60,0.85))",
        backdropFilter: "blur(8px)",
        boxShadow: "inset 0 0 0 1px rgba(140,110,255,0.4)",

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
  // ====== SNP BRANCHING ======
  const [snpType, setSnpType] = useState(null); // "DSNP" | "CSNP" | null
  const [snpOk, setSnpOk] = useState(false);
  // ===== OPTIONAL HOSPITAL INDEMNITY (WRAP-UP) =====
  const [hiActive, setHiActive] = useState(false);
  const [hiConsentOk, setHiConsentOk] = useState(false);
  const [hiDiscussed, setHiDiscussed] = useState(false);
  // ===== OPTIONAL FINAL EXPENSE (WRAP-UP) =====
  const [feActive, setFeActive] = useState(false);
  const [feConsentOk, setFeConsentOk] = useState(false);
  const [feDiscussed, setFeDiscussed] = useState(false);
  // ===== OPTIONAL DENTAL & VISION (WRAP-UP) =====
  const [dvActive, setDvActive] = useState(false);
  const [dvConsentOk, setDvConsentOk] = useState(false);
  const [dvDiscussed, setDvDiscussed] = useState(false);

  const [tpmoZip, setTpmoZip] = useState("");

  const [soaOk, setSoaOk] = useState(false);
  const [neadsOk, setNeadsOk] = useState(false);
  const [sobOk, setSobOk] = useState(false);
  const [enrollOk, setEnrollOk] = useState(false);
  const [partBReduction, setPartBReduction] = useState(false);

  // ====== QUALIFICATIONS ======
  const [qualOk, setQualOk] = useState(false);

  // ====== ACTIVE SECTION ======
  const activeSection = !recordingOk
    ? 1
    : !tpmoOk
    ? 2
    : !soaOk
    ? 3
    : !qualOk
    ? 4
    : !neadsOk
    ? 5
    : !sobOk
    ? 6
    : !enrollOk
    ? 7
    : 8;

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
  // ====== AGENT NAME (used in verbatim scripts) ======
  const [agentName, setAgentName] = useState("");
  // ====== TPMO DYNAMIC FIELDS ======
  const [tpmoOrgs, setTpmoOrgs] = useState("");
  const [tpmoPlans, setTpmoPlans] = useState("");

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
    s1: true, // Recording
    s2: recordingOk, // TPMO
    s3: tpmoOk, // POA & SOA
    s4: soaOk, // Qualifications
    s5: qualOk, // NEADS
    s6: neadsOk, // SOB
    s7: sobOk, // Enrollment
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
        <div style={{ marginTop: 10, marginBottom: 6 }}>
          <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>
            Agent Name (auto-fills disclosure)
          </label>
          <input
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder="First and Last Name"
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: 6,
              border: "1px solid #3a3d45",
              background: "#15161a",
              color: "white",
              outline: "none",
            }}
          />
        </div>

        {unlocked.s1 && (
          <ScriptBox verbatim>
            {`“Thank you for calling New Gen Health Solutions. My name is ${
              agentName || "[First and Last Name]"
            }.
I am a licensed sales agent on a recorded line. Who do I have the pleasure of speaking with?”
“Please know our call will be recorded for quality and training purposes; is it ok if I continue?”

So (Client’s Name), we are reaching out because it is Open Enrollment and unfortunately a lot
of people made changes to their Medicare Advantage plans during the Annual Enrollment
Period and were misinformed about their doctors being covered, prescription cost, and the
benefits of the plan. I want to make sure you are receiving all of the benefits you are ENTITLED
to like the grocery card & part B giveback as well as making sure you can see ALL of your doctors. 
`}
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
          2) TPMO Disclaimer & Federal Contracting Statement{" "}
          <span className="timer">{t2}</span>
        </h2>
        <div style={{ marginTop: 10, marginBottom: 6 }}>
          <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>
            TPMO Counts (auto-fills disclosure)
          </label>

          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={tpmoZip}
              onChange={(e) => setTpmoZip(e.target.value)}
              placeholder="ZIP"
              maxLength={5}
              style={{
                width: 80, // smaller than orgs/plans
                padding: "8px",
                borderRadius: 6,
                border: "1px solid #3a3d45",
                background: "#15161a",
                color: "white",
                outline: "none",
                textAlign: "center",
              }}
            />

            <input
              value={tpmoOrgs}
              onChange={(e) => setTpmoOrgs(e.target.value)}
              placeholder="# of Organizations"
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: 6,
                border: "1px solid #3a3d45",
                background: "#15161a",
                color: "white",
                outline: "none",
              }}
            />

            <input
              value={tpmoPlans}
              onChange={(e) => setTpmoPlans(e.target.value)}
              placeholder="# of Plans"
              style={{
                flex: 1,
                padding: "10px",
                borderRadius: 6,
                border: "1px solid #3a3d45",
                background: "#15161a",
                color: "white",
                outline: "none",
              }}
            />
          </div>
        </div>

        {unlocked.s2 && (
          <ScriptBox verbatim>
            {`"Can I please have your Zipcode?" "May I have your First and Last Name" "May I have a phone number to call you back in case we get disconnected?”

“We do not offer every plan available in your area. Currently we represent ${
              tpmoOrgs || "[number of organizations]"
            } organizations which offer ${
              tpmoPlans || "[number of plans]"
            } products in your area.
Please contact Medicare.gov, 1-800-MEDICARE, or your local State Health Insurance Program (SHIP) to get information on all of your options.”
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
      {/* ===================== 2.5) SNP DISCLOSURE ===================== */}
      {tpmoOk && (
        <section className={card(2.5)}>
          <h2>Special Needs Plan Disclosure</h2>

          {!snpType && (
            <div style={{ display: "flex", gap: 10 }}>
              <button className="primary" onClick={() => setSnpType("DSNP")}>
                Dual Eligible (D-SNP)
              </button>
              <button className="primary" onClick={() => setSnpType("CSNP")}>
                Chronic Condition (C-SNP)
              </button>
            </div>
          )}

          {/* ===== D-SNP ===== */}
          {snpType === "DSNP" && (
            <ScriptBox verbatim>
              {`“In your area we do offer Dual Eligible Special Needs Plans. These are plans specifically designed for individuals who have both Medicare and Medicaid. Would you like to hear more about this plan?”

(If yes)

“Your ability to enroll in this special needs plan is based on verification that you are entitled to both Medicare and the qualifying level of Medicaid.”`}
            </ScriptBox>
          )}

          {/* ===== C-SNP ===== */}
          {snpType === "CSNP" && (
            <ScriptBox verbatim>
              {`“In your area we do offer Chronic Care Special Needs Plans. These are plans specifically designed for individuals who have been diagnosed with certain chronic conditions such as diabetes or cardiovascular disease. Would you like to hear more about this plan?”

(If yes)

“There is a physician verification process required to confirm your chronic condition by the end of the first month of enrollment in the new plan. You are responsible for ensuring that the form is completed and returned. If not completed, your enrollment in the C-SNP will be voided. The process may vary by carrier. Please see your new member materials.”`}
            </ScriptBox>
          )}

          {snpType && (
            <label className="check">
              <input
                type="checkbox"
                checked={snpOk}
                onChange={(e) => setSnpOk(e.target.checked)}
              />
              SNP disclosure read (verbatim)
            </label>
          )}

          {snpType && !snpOk && (
            <p className="lock">Complete SNP disclosure to continue.</p>
          )}
        </section>
      )}

      {/* ===================== 3) SOA ===================== */}
      <section className={`${card(3)} ${tpmoOk ? "" : "disabled"}`}>
        <h2>
          3) Power of Attorney & Scope of Appointment{" "}
          <span className="timer">{t3}</span>
        </h2>

        {activeSection === 3 && (
          <ScriptBox verbatim>
            {` POA: “Are you interested in discussing Medicare options for yourself or for someone else, such as a family member, guardian or someone that you are authorized to make decisions for?”  (IF YES): “Are they available now or should we discuss at a later time when they are available?”`}
          </ScriptBox>
        )}

        {activeSection === 3 && (
          <ScriptBox verbatim>
            {` SCOPE OF APPOINTMENT:
“I work for New Gen Health Solutions, and in your area, we have a wide variety of plans such as” (Agent to list product types seen in Sunfire).
“Would you like to discuss all of these options or are you only interested in certain ones?”
“I can give you a brief overview of each of these plans, then you can decide which plan might be best for you based on your needs. Would that be ok?”
“This conversation has no effect on your current or future health coverage unless you enroll in a plan today. Talking to me does not obligate you to enroll or automatically enroll you in a plan.” `}
          </ScriptBox>
        )}

        <label className="check">
          <input
            type="checkbox"
            disabled={!tpmoOk}
            checked={soaOk}
            onChange={(e) => setSoaOk(e.target.checked)}
          />
          POA & SOA completed / permission confirmed
        </label>

        {!tpmoOk && lockText("Locked until TPMO is complete.")}
        {tpmoOk && !soaOk && lockText("SOA required before Needs Assessment.")}
      </section>
      {/* ===================== 4) QUALIFICATIONS ===================== */}
      <section className={`${card(4)} ${soaOk ? "" : "disabled"}`}>
        <h2>
          4) Qualifications <span className="timer">{t4}</span>
        </h2>
        {soaOk && (
          <>
            <ScriptBox verbatim>
              {`“Do you have or will soon have Medicare Parts A and B?”
If yes: “Can you please grab your Red, White and Blue Medicare card so I can confirm your MBI?”
If not available: Verify full legal name, date of birth, and Social Security Number.
(Agent note: Send to MARx check.)

“Can you tell me what it says on your card for the Part A and Part B effective dates?” (Read back effective dates)

Medicaid / Extra Help: “Are you currently receiving any assistance with your Part B premium through Medicaid, or Extra Help that helps pay for prescription coverage?”

Permanent Residence: “Do you mind confirming your permanent home address?”
(Agent note: If the caller does not want to provide it, proceed without it. If unsure, confirm the address on file with Social Security, tax records, or voter registration.)

Permission to Contact (TCPA):
“Would you like to provide your phone number so we can contact you in the future? This is optional.”
“Does New Gen Health Solutions have permission to have a licensed sales agent contact you in the future about plan information and your Medicare enrollment options? Your consent is voluntary and allows us to contact you via text messaging or automatic dialing. You may change your preferences at any time. This will not affect your eligibility for enrollment or benefits. Message and data rates may apply.”
“Would you like to provide an email address that we can use to contact you? This is optional and can be used to send plan information or updates.”

“Are you a veteran?”
(If yes: Thank them for their service!)

“Do you currently have other coverage such as employer coverage, retiree benefits, VA benefits, TRICARE for Life, or CHAMPVA?”
(Agent note: If present, politely end the call. Basic VA coverage alone may proceed.)

“In the last twelve months, have you gone to an emergency room or an urgent care center for medical care?” (IF YES): “Was that one or two times, or more than that?”`}
            </ScriptBox>
            <ScriptBox verbatim>
              {`(If):Annual Election Period (AEP)
“The Annual Election Period runs from October 15 through December 7. We are currently within this period, so you may make a Medicare plan change.”             
(If):Open Enrollment (OE / MA-OEP)
“Medicare Open Enrollment runs from January 1 through March 31. Since we are within this period, you may make a one-time plan change.”             
(If):Special Election Period (SEP)
“You qualify for a Special Election Period, which allows you to make a Medicare plan change outside of the standard enrollment periods.”`}
            </ScriptBox>
            <ScriptBox verbatim>
              {` Required Privacy Statement:
“Please be aware that you are not required to give any health-related information unless it will be used to determine your enrollment eligibility. If you choose not to provide required health information, you may not be able to enroll.”`}
            </ScriptBox>{" "}
          </>
        )}

        <label className="check">
          <input
            type="checkbox"
            disabled={!soaOk}
            checked={qualOk}
            onChange={(e) => setQualOk(e.target.checked)}
          />
          Qualifications completed
        </label>

        {!qualOk && (
          <p className="lock">
            Qualifications must be completed before proceeding to Needs
            Assessment.
          </p>
        )}
        {!soaOk &&
          lockText(
            "Locked until Power of Attorney & Scope of Appointment are completed."
          )}
      </section>

      {/* ===================== 5) NEADS ===================== */}
      <section className={`${card(5)} ${qualOk ? "" : "disabled"}`}>
        <h2>
          5) NEADS Assessment <span className="timer">{t5}</span>
        </h2>
        {unlocked.s5 && (
          <ScriptBox verbatim>
            {`NEADS Analysis Questions.

“I am going to ask you some optional questions to help determine the plans best suited for your needs.”

Review current coverage and carrier. Open and review plan benefits for comparison.

“Who is your current primary care physician?” Confirm location.

“Do you see any specialists? If so, who?” Confirm location.

“Is there a particular hospital or any other preferred facilities we should check network status for?” Confirm location.

“What medications do you take regularly?” Confirm medications if already populated in Sunfire. Confirm full name and spelling, dosage, form, and quantity. How many times per day they take it and whether it is refilled monthly or every three months.

Remove any medications listed that the beneficiary is not currently taking and correct any wrong dosages.

“What do you usually pay for each medication?” Quantify per month and per year.

“Which pharmacy do you use to fill your prescriptions? Do you use mail order?”

Recommend a preferred pharmacy with the carrier for lower medication costs.

“What do you enjoy about your current coverage? Any benefits, doctors, hospitals, cost, or other feature preferences?”

“What would you add or alter to have coverage you would like even more?”

“Some people also ask about dental or vision coverage that’s separate from Medicare. We’ll finish your Medicare first, and I can touch on that at the end if you’d like.” (CHECK DENTAL BOX AFTER ENROLLMENT)

“What are you hoping to gain by changing your coverage arrangement?”

“Is anything more important to you, such as health benefits versus prescription drug benefits?”

“Do you have any preference for plan types, such as HMO or PPO?”

“Is travel or living elsewhere at times part of your lifestyle?”

5.2 NEADS Analysis: Pre-Enrollment Checklist.
*Current coverage and doctors.
*Primary care providers and specialists, providers are in the plan’s network.
*Prescription drug coverage and costs, beneficiary’s current prescriptions are covered.
*Costs of health care services.
*Premiums, plan premium amount monthly, quarterly, annually, Medicare Part B premium.
*Durable medical equipment, physical therapy, extra benefits

Agent recap and summary statement:

“I’ll summarize my notes for you. Did we get it all?"

 "Do you have any other health care needs?”
 “Some people also like to make sure their family isn’t left with expenses later on. That’s not part of Medicare, but I can mention it briefly at the end if it’s ever something you want to hear about.” (CHECK FINAL EXPENSE BUTTON AFTER ENROLLMENT)`}
          </ScriptBox>
        )}

        <h3>Pre-Enrollment Checklist</h3>

        <div className="checklist">
          {renderCheck(
            preEnrollChecks.providers,
            "Provider network reviewed",
            (v) => setPreEnrollChecks((s) => ({ ...s, providers: v })),
            !qualOk
          )}
          {renderCheck(
            preEnrollChecks.rx,
            "Prescription coverage reviewed",
            (v) => setPreEnrollChecks((s) => ({ ...s, rx: v })),
            !qualOk
          )}
          {renderCheck(
            preEnrollChecks.costs,
            "Copays / cost sharing reviewed",
            (v) => setPreEnrollChecks((s) => ({ ...s, costs: v })),
            !qualOk
          )}
          {renderCheck(
            preEnrollChecks.moop,
            "MOOP explained",
            (v) => setPreEnrollChecks((s) => ({ ...s, moop: v })),
            !qualOk
          )}
          {renderCheck(
            preEnrollChecks.rules,
            "Plan rules (HMO/PPO) explained",
            (v) => setPreEnrollChecks((s) => ({ ...s, rules: v })),
            !qualOk
          )}
          {renderCheck(
            preEnrollChecks.coverageImpact,
            "Effect on current coverage explained",
            (v) => setPreEnrollChecks((s) => ({ ...s, coverageImpact: v })),
            !qualOk
          )}
        </div>

        <button
          className="primary"
          disabled={!qualOk || !preEnrollAllDone}
          onClick={() => setNeadsOk(true)}
        >
          Mark NEADS Complete
        </button>

        {!qualOk && lockText("Locked until Qualifications are complete.")}

        {soaOk &&
          !preEnrollAllDone &&
          lockText("Complete the Pre-Enrollment Checklist to proceed.")}
      </section>

      {/* ===================== 6) SOB ===================== */}
      <section className={`${card(6)} ${neadsOk ? "" : "disabled"}`}>
        <h2>
          6) Plan Selection & Summary of Benefits{" "}
          <span className="timer">{t6}</span>
        </h2>
        {unlocked.s5 && (
          <ScriptBox verbatim>
            {`“Based on everything we discussed during your NEADS assessment, including your doctors, prescriptions, coverage preferences, and costs, [plan name] appears to be a good option for you. I’m recommending this plan is because it aligns with what you told me was most important, such as your coverage needs, provider access, prescription costs, or overall out-of-pocket expenses.”

“Before I go into the full benefit details, does this plan sound like something that could work for you?”
AGENT NOTE: State the dollar amounts for the current plan and the new plan when comparing benefits (Sunfire: Current Plan Summary of Benefits)

"This plan will have a monthly premium of [AMOUNT]."
"If applicable, this plan will have a medical deductible of [AMOUNT], and the Medicare Part B deductible is [AMOUNT]."

"For prescription drugs, this plan will have a Part D deductible of [AMOUNT], which applies to [TIERS]. Your prescription drugs will have copays or coinsurance of [AMOUNTS] based on their tier. Some medications may have requirements such as prior authorization, quantity limits, or step therapy, and those requirements have been reviewed. Any medications not covered on the formulary have been disclosed."

"Medicare prescription drug plans have different coverage stages throughout the year. The catastrophic coverage limit for this plan is [DOLLAR AMOUNT]. Once that amount is reached, your prescription drug costs will be significantly reduced for the remainder of the year."

"In-network inpatient hospital care will have a cost of [AMOUNT]."
"In-network outpatient hospital services will have a cost of [AMOUNT]."

“Even with Medicare Advantage, hospital stays are usually where most out-of-pocket costs happen. We’ll finish your Medicare enrollment first, and I can mention an optional way some people prepare for that later if you want.” (CHECK HOSPITAL INDEMNITY BOX IN WRAP UP AFTER ENROLLMENT)

"Primary care provider visits will have a cost of [AMOUNT]."
"Specialist visits will have a cost of [AMOUNT]."

"Inpatient and outpatient mental health services will have a cost of [AMOUNT]."
"Preventive services will have a cost of [AMOUNT]."

"Emergency room services will have a cost of [AMOUNT]."
"Urgently needed services will have a cost of [AMOUNT] when you are temporarily away from home."

"If this plan allows out-of-network coverage, out-of-network services will have a cost of [AMOUNT], which may be higher than in-network costs."

"This plan may include additional benefits such as dental, vision, hearing, or other benefits. Dental services will have a cost of [AMOUNT], vision services will have a cost of [AMOUNT], and hearing services will have a cost of [AMOUNT]. Access to these services must be through the plan’s required network, vendor, or provider."

"Medicare generally does not cover care outside the United States. If this plan offers coverage outside the country, that coverage will have a cost of [AMOUNT].”`}
          </ScriptBox>
        )}

        {unlocked.s6 && (
          <ScriptBox verbatim>
            {`“Before making an enrollment decision, it is important that you fully understand the plan’s benefits and rules. I will cover the plan requirements (disclosures), review the Pre-enrollment checklist and the Summary of Benefits and answer any questions you have. The pre-enrollment checklist, can also be reviewed on [carrier’s name] website.”

“Do you understand the benefits we discussed earlier or have any other questions before we get started?”
“You will be receiving your Summary of Benefits and your Evidence of Coverage in the mail or by email if chosen during enrollment.
"The Evidence of Coverage is a detailed explanation of the services provided by the carrier.”
“You also have the right to cancel your plan at any time before the plan’s effective date by calling the carrier directly. I will provide the carrier’s member service number at the end of this call.”
“Mr./Ms., if you are ready to enroll today, we will now move to the enrollment process.”
`}
          </ScriptBox>
        )}
        {unlocked.s5 && (
          <div style={{ marginBottom: 12 }}>
            <button
              className="secondary"
              onClick={() => setPartBReduction((v) => !v)}
            >
              Part B Premium Reduction Applies
            </button>

            {partBReduction && (
              <ScriptBox verbatim>
                {`“This plan includes a Part B premium reduction. There may be a delay in the application of the Part B premium reduction.”

“The reduction is not immediate and may take one or more payment cycles to take effect.”

“If your Part B premium is deducted from your Social Security check, the reduction will appear as an increase in your Social Security payment.”

“If your Part B premium is paid directly, you will receive a credit on your premium statement.”

“For this plan, your Part B premium reduction is [amount], however this amount may change based on the amount you pay for Part B.”`}
              </ScriptBox>
            )}
          </div>
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

      {/* ===================== 7) ENROLLMENT ===================== */}
      <section className={`${card(7)} ${sobOk ? "" : "disabled"}`}>
        <h2>
          7) Enrollment <span className="timer">{t7}</span>
        </h2>
        {unlocked.s7 && (
          <ScriptBox verbatim>
            {`INBOUND: "I can enroll you today over the telephone in this [specific plan name]. Enrolling in this plan today will replace your current coverage. Once approved by Medicare, your new coverage will begin on [effective date]. Would you like to proceed?”

“Based on what we have discussed, it sounds like you are interested in [plan name, type, and contract number with PBP]. Is that correct?”

"If you are currently enrolled in a Medicare Advantage plan, your current coverage will end once your new coverage starts."
"If you have Tricare, your coverage may be affected."
"If you have a Medigap plan, you may want to drop it once MA coverage begins."

"If you are ready to enroll, we will complete the application and process your signature.
Once completed, I will provide your application number and explain when to expect materials."

"[Carrier Name] is a Medicare Advantage organization with a Medicare contract.
Enrollment depends on contract renewal."
"[Plan Name] serves a specific service area. When the plan begins you must obtain benefits from [Carrier Name] as described in the Evidence of Coverage document. No payment will be issued for services that are not covered.”

"You must keep Medicare Part A and Part B and continue paying your Part B premium."
"You can only be enrolled in one Medicare Advantage plan at a time."

MAPD Part D Statement:
This plan includes Part D prescription drug coverage. Network pharmacies must be used except in non-routine circumstances.

“If you have not had Medicare prescription drug coverage, or creditable coverage as good as Medicare’s, you may have to pay a late enrollment penalty in addition to your premium for Medicare prescription drug coverage.”

"Benefits, premiums, and cost-sharing may change on January 1."
"This is not a complete description of benefits. Refer to the Evidence of Coverage."
"Coverage outside the U.S. is limited." 

PRIVACY ACT STATEMENT:
"CMS collects information to track enrollment, improve care, and make payments. Your response is voluntary, but failure to respond may affect enrollment."

“Do you understand how the plan works?”
“If you receive help from a sales agent, broker, or other person employed by or contracted with [Carrier Name], they may be paid based on your enrollment.”
“Do you understand and agree with the statements you have heard so far?”
“Do you understand that enrollment in this plan will disenroll you from your current plan?
“Are you ready to enroll in [plan name, type and contract number with PBP]?”

“Your enrollment application has been successfully submitted and the application number is[application ID]. [Plan name]’s Customer service number is [phone and TTY].”
`}
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

      {/* ===================== 8) WRAP ===================== */}
      <section className={`${card(8)} ${enrollOk ? "" : "disabled"}`}>
        <h2>
          8) Wrap-Up <span className="timer">{t7}</span>
        </h2>

        {unlocked.s7 && (
          <>
            <ScriptBox verbatim>
              {`“You will receive an Evidence of Coverage (EOC) document that explains all of the plan’s benefits, costs, and rules in detail.”

“You have the right to cancel this plan before it becomes effective if you change your mind.”

“Once you are a member, you have the right to appeal plan decisions about payment of benefits or coverage of services if you disagree. This is explained in the Evidence of Coverage.”

“Medicare evaluates plans yearly using a 5-Star rating system. You can review the plan’s Star Rating and Summary of Benefits on Medicare.gov or the plan’s website.”`}
            </ScriptBox>

            <ScriptBox verbatim>
              {`“Do you understand the benefits and conditions of enrollment as they have been explained for the[specific plan name] (eg”Generic Medicare Sunshine PPO). ?”
“Do you understand that we will release information to Medicare and other plans as is necessary for treatment, payment and healthcare operations?”
“Do you understand that you are enrolling in the plan [specific plan name] (eg”Generic Medicare Sunshine PPO). for a monthly premium of no more than [$ amount]?”
“The plan’s proposed effective date is [effective date], subject to approval by Medicare.”
“You will receive a notice in the mail acknowledging receipt of the enrollment.”
“You should receive plan information from [carrier name] including your member ID card in the mail within [7-10] business days of enrollment, but no later than within [ten] days of the plan effective date. You may also access plan materials online at [carrier’s URL address].”
“If you have any questions about your plan or if your needs change and you want to look at other plan options, please give me a call at [877-909-1995].”

Call closing. “It’s been a pleasure speaking with you today. If you have any family members or friends that would benefit by speaking with me, please give them my number and I would be happy to assist them too.”
End the call: “Thank you for [calling/choosing] [Carrier name] and have a great day!”
AGENT NOTE (IMPORTANT):
Optional non-Medicare products must only be discussed after Medicare enrollment is complete.
Use the buttons below to initiate discussion only if the client expressed interest earlier.`}
            </ScriptBox>

            {/* Extra agent reminder (requested) */}
            <ScriptBox>
              <strong style={{ color: "#a78bfa" }}>
                AGENT REMINDER (NOT READ VERBATIM):
              </strong>
              {"\n"}After enrollment, complete the HRA with the customer on the
              phone (if applicable for the plan) before ending the call. Enter
              Enrollment Code & Customer Info in NGHS Digital Sales Google
              Sheet. Set status as a sale on EnrollHere.
            </ScriptBox>
            {/* ===== OPTIONAL HOSPITAL INDEMNITY BUTTON (WRAP-UP ONLY) ===== */}
            {enrollOk && !hiActive && (
              <div style={{ marginTop: 16 }}>
                <button className="primary" onClick={() => setHiActive(true)}>
                  Optional Hospital Indemnity
                </button>
              </div>
            )}

            {/* ===== HOSPITAL INDEMNITY DISCLOSURE FLOW ===== */}
            {hiActive && (
              <div style={{ marginTop: 14 }}>
                <ScriptBox verbatim>
                  {`“Before we end the call, I want to be very clear that what we are discussing next is NOT a Medicare plan and is NOT affiliated with Medicare.

Your Medicare Advantage enrollment is complete and will not change.

This is a separate, optional insurance product that provides cash benefits directly to you.

Would it be okay if I briefly explain how it works?”`}
                </ScriptBox>

                <label className="check">
                  <input
                    type="checkbox"
                    checked={hiConsentOk}
                    onChange={(e) => setHiConsentOk(e.target.checked)}
                  />
                  Permission granted to discuss non-Medicare product
                </label>

                {hiConsentOk && (
                  <>
                    <ScriptBox verbatim>
                      {`“This is called hospital indemnity insurance.

It does not replace Medicare and it does not pay doctors or hospitals.

If you are admitted to the hospital for a covered stay, it pays a fixed cash benefit directly to you.

That money can be used however you choose, such as deductibles, copays, prescriptions, rent, or household expenses.

Coverage, benefit amounts, and eligibility depend on the policy terms.”`}
                    </ScriptBox>

                    <label className="check">
                      <input
                        type="checkbox"
                        checked={hiDiscussed}
                        onChange={(e) => setHiDiscussed(e.target.checked)}
                      />
                      Hospital indemnity explained (non-Medicare)
                    </label>
                  </>
                )}

                {!hiConsentOk && (
                  <p className="lock">
                    Permission is required before discussing optional coverage.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* ===== OPTIONAL DENTAL & VISION BUTTON ===== */}
        {enrollOk && !dvActive && (
          <div style={{ marginTop: 12 }}>
            <button className="primary" onClick={() => setDvActive(true)}>
              Optional Dental & Vision
            </button>
          </div>
        )}

        {/* ===== DENTAL & VISION DISCLOSURE FLOW ===== */}
        {dvActive && (
          <div style={{ marginTop: 14 }}>
            <ScriptBox verbatim>
              {`“Before we finish, I want to be clear that what we are discussing next is NOT a Medicare plan and is NOT affiliated with Medicare.

Your Medicare Advantage enrollment is complete and will not change.

This is a separate, optional dental and vision insurance product.

Would it be okay if I briefly explain how it works?”`}
            </ScriptBox>

            <label className="check">
              <input
                type="checkbox"
                checked={dvConsentOk}
                onChange={(e) => setDvConsentOk(e.target.checked)}
              />
              Permission granted to discuss non-Medicare product
            </label>

            {dvConsentOk && (
              <>
                <ScriptBox verbatim>
                  {`“This dental and vision coverage is separate from Medicare.

It may help with routine dental and vision expenses such as exams, cleanings, fillings, glasses, or contacts, depending on the plan selected.

Coverage details, limitations, and waiting periods depend on the policy terms.”`}
                </ScriptBox>

                <label className="check">
                  <input
                    type="checkbox"
                    checked={dvDiscussed}
                    onChange={(e) => setDvDiscussed(e.target.checked)}
                  />
                  Dental & vision explained (non-Medicare)
                </label>
              </>
            )}

            {!dvConsentOk && (
              <p className="lock">
                Permission is required before discussing optional coverage.
              </p>
            )}
          </div>
        )}

        {/* ===== OPTIONAL FINAL EXPENSE BUTTON ===== */}
        {enrollOk && !feActive && (
          <div style={{ marginTop: 12 }}>
            <button className="primary" onClick={() => setFeActive(true)}>
              Optional Final Expense
            </button>
          </div>
        )}

        {/* ===== FINAL EXPENSE DISCLOSURE FLOW ===== */}
        {feActive && (
          <div style={{ marginTop: 14 }}>
            <ScriptBox verbatim>
              {`“Before we finish, I want to be very clear that what we are discussing next is NOT a Medicare plan and is NOT affiliated with Medicare.

Your Medicare Advantage enrollment is complete and will not change.

This is a separate, optional life insurance product often referred to as final expense coverage.

Would it be okay if I briefly explain how it works?”`}
            </ScriptBox>

            <label className="check">
              <input
                type="checkbox"
                checked={feConsentOk}
                onChange={(e) => setFeConsentOk(e.target.checked)}
              />
              Permission granted to discuss non-Medicare product
            </label>

            {feConsentOk && (
              <>
                <ScriptBox verbatim>
                  {`“Final expense insurance is a form of life insurance.

It is designed to provide a cash benefit to a beneficiary when you pass away.

That money can be used for funeral costs, medical bills, or other end-of-life expenses.

Coverage amounts, premiums, and underwriting requirements depend on the policy selected.”`}
                </ScriptBox>

                <label className="check">
                  <input
                    type="checkbox"
                    checked={feDiscussed}
                    onChange={(e) => setFeDiscussed(e.target.checked)}
                  />
                  Final expense explained (non-Medicare)
                </label>
              </>
            )}

            {!feConsentOk && (
              <p className="lock">
                Permission is required before discussing optional coverage.
              </p>
            )}
          </div>
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

import { useState, memo, useCallback } from "react";

/**
 * SectionCoach — AI Coach with deep, section-specific compliance knowledge.
 *
 * Props:
 *   stepName  — string label of the current section
 *   context   — optional extra context (e.g. agent name, plan name, etc.)
 */

/* ─── Section-specific compliance rules ─── */
const SECTION_KNOWLEDGE = {
  "Recording Disclosure": `
SECTION: Recording Disclosure (Section 1)
SCRIPT REQUIREMENTS:
- Agent MUST state their full name and company name ("New Gen Health Solutions")
- Agent MUST disclose they are a "licensed sales agent on a recorded line"
- Agent MUST get explicit verbal consent to continue on a recorded line — cannot proceed without "yes"
- Agent MUST ask "Who do I have the pleasure of speaking with?" to confirm caller identity
- After consent, agent transitions into the enrollment pitch about Open Enrollment / Medicare Advantage changes

COMMON MISTAKES:
- Rushing through the disclosure without pausing for consent
- Forgetting to state full name clearly
- Not waiting for explicit "yes" before continuing
- Skipping the "recorded line" disclosure entirely
- Not confirming the caller's name before proceeding

COMPLIANCE TIPS:
- Speak slowly and clearly during the disclosure — this is audited
- Pause after asking for consent — silence is okay, don't fill it
- If the caller says "no" to recording, you cannot proceed — end the call politely
- Document the exact time the disclosure was read for QA purposes
`,

  "TPMO Disclaimer": `
SECTION: TPMO Disclaimer & Federal Contracting Statement (Section 2)
SCRIPT REQUIREMENTS:
- MUST be read within 60 seconds of the call starting — timing is monitored
- MUST collect ZIP code to determine plan availability
- MUST collect first and last name
- MUST ask for callback phone number in case of disconnection
- MUST state: "We do not offer every plan available in your area"
- MUST state exact number of organizations and plans represented in the caller's area
- MUST direct caller to Medicare.gov, 1-800-MEDICARE, or SHIP for full options
- MUST read the Federal Contracting Statement about Medicare Advantage organizations verbatim

COMMON MISTAKES:
- Reading TPMO after the 60-second mark — this is a compliance violation
- Saying "we offer all plans" or implying comprehensive coverage
- Not filling in the correct number of organizations/plans for the ZIP
- Rushing through the Federal Contracting Statement
- Forgetting to mention SHIP (State Health Insurance Program)

COMPLIANCE TIPS:
- Start TPMO immediately after Recording Disclosure — don't get sidetracked
- Have Sunfire open and ready so you can quickly look up org/plan counts by ZIP
- Read the contracting statement word-for-word — don't paraphrase
- If caller interrupts, politely say you need to finish a required disclosure first
`,

  "SNP Disclosure (DSNP)": `
SECTION: Dual Eligible Special Needs Plan (D-SNP) Disclosure
SCRIPT REQUIREMENTS:
- MUST explain plans are "specifically designed for individuals who have both Medicare and Medicaid"
- MUST state that enrollment eligibility is based on verification of both Medicare AND qualifying Medicaid level
- MUST read verbatim

COMMON MISTAKES:
- Assuming all Medicaid qualifies — must be the qualifying LEVEL of Medicaid
- Not confirming the beneficiary actually has both Medicare and Medicaid before discussing
- Confusing DSNP with CSNP disclosures

COMPLIANCE TIPS:
- Verify Medicaid status before reading DSNP disclosure
- LIS (Low Income Subsidy) does NOT equal Medicaid — these are different programs
- If unsure about Medicaid level, verify through state Medicaid agency
`,

  "SNP Disclosure (CSNP)": `
SECTION: Chronic Condition Special Needs Plan (C-SNP) Disclosure
SCRIPT REQUIREMENTS:
- MUST explain plans are for individuals "diagnosed with certain chronic conditions such as diabetes or cardiovascular disease"
- MUST disclose physician verification process required by end of first month of enrollment
- MUST state beneficiary is responsible for ensuring form completion and return
- MUST warn that enrollment will be VOIDED if physician verification is not completed

COMMON MISTAKES:
- Not emphasizing the voiding consequence clearly enough
- Forgetting to mention the deadline (end of first month)
- Not explaining that the process varies by carrier

COMPLIANCE TIPS:
- Make sure the beneficiary understands THEY are responsible for the physician form — not the agent
- Emphasize the voiding consequence — this catches many beneficiaries off guard
- Suggest they contact their doctor immediately after enrollment
`,

  "POA & Scope of Appointment": `
SECTION: Power of Attorney & Scope of Appointment (Section 3)
SCRIPT REQUIREMENTS:
- POA: MUST ask if discussing Medicare for themselves or someone else (family member, guardian, authorized representative)
- If for someone else: MUST ask if that person is available now or should reschedule
- SOA: MUST state agent works for "New Gen Health Solutions"
- MUST list product types available in the caller's area (from Sunfire)
- MUST ask which options they want to discuss or if they want an overview of all
- MUST state: "This conversation has no effect on your current or future health coverage unless you enroll"
- MUST state: "Talking to me does not obligate you to enroll or automatically enroll you in a plan"

COMMON MISTAKES:
- Skipping the POA question entirely
- Not confirming if an authorized representative is actually authorized
- Proceeding without establishing scope — discussing products not agreed upon
- Making the conversation feel like a sales pitch rather than an informational overview
- Forgetting the "no obligation" statement

COMPLIANCE TIPS:
- If they're calling on behalf of someone else and that person isn't available, you MUST reschedule
- The SOA establishes what products you're permitted to discuss — don't go outside scope
- Document the scope clearly — if audited, you need to show what was agreed upon
- Keep tone consultative, not salesy — "Would that be ok?" is important
`,

  Qualifications: `
SECTION: Qualifications (Section 4)
SCRIPT REQUIREMENTS:
- MUST verify Medicare Parts A and B enrollment or pending enrollment
- MUST request Red White and Blue Medicare card for MBI verification
- MUST verify Part A and Part B effective dates by reading them back
- MUST ask about Medicaid / Extra Help status
- MUST confirm permanent home address
- MUST read TCPA permission to contact disclosure — emphasize it's VOLUNTARY
- MUST ask about veteran status (and thank them if yes)
- MUST ask about other coverage (employer, retiree, VA, TRICARE, CHAMPVA)
- If employer/retiree/TRICARE for Life/CHAMPVA coverage exists — MUST end call politely
- Basic VA coverage alone may proceed
- MUST ask about ER/urgent care visits in last 12 months
- MUST identify correct enrollment period (AEP, OEP/MA-OEP, or SEP) and read the corresponding script
- MUST read Required Privacy Statement verbatim

COMMON MISTAKES:
- Not verifying both Part A AND Part B — both are required
- Proceeding when beneficiary has disqualifying coverage (employer, TRICARE for Life)
- Not reading effective dates back to the caller for confirmation
- Making TCPA consent sound required instead of voluntary
- Forgetting the Privacy Statement
- Not identifying the correct enrollment period

COMPLIANCE TIPS:
- If they can't find their Medicare card, use name + DOB + SSN and send to MARx check
- TCPA consent is VOLUNTARY — emphasize this, don't pressure
- If they have VA benefits, clarify if it's basic VA or TRICARE — basic VA is okay to proceed
- Always read the Privacy Statement — it's required even though it feels redundant
- Document the enrollment period clearly — wrong period = voided enrollment
`,

  "NEADS Assessment": `
SECTION: NEADS Assessment (Section 5)
SCRIPT REQUIREMENTS:
- MUST state questions are "optional" to determine best-suited plans
- MUST review: current coverage/carrier, PCP (confirm location), specialists (confirm location), preferred hospitals/facilities
- MUST collect full medication details: name, spelling, dosage, form, quantity, frequency, refill schedule
- MUST remove medications no longer taken, correct wrong dosages
- MUST ask current medication costs (monthly and yearly)
- MUST ask about pharmacy preference and mail order usage
- MUST recommend preferred pharmacy with carrier for lower costs
- MUST ask about coverage likes, desired changes, goals for new coverage
- MUST ask about benefit priorities (health vs prescription)
- MUST ask about plan type preference (HMO vs PPO)
- MUST ask about travel/living elsewhere
- MUST do agent recap: "I'll summarize my notes for you. Did we get it all?"
- Pre-Enrollment Checklist must cover: providers in network, Rx covered, costs, premiums, MOOP, plan rules, coverage impact

COMMON MISTAKES:
- Rushing through medication collection — missing dosages or frequencies
- Not confirming provider locations (providers can have multiple locations, some in-network, some not)
- Forgetting to check if medications are on the plan's formulary
- Not explaining MOOP (Maximum Out of Pocket) clearly
- Skipping the recap — this is your chance to catch errors
- Not mentioning dental/vision and final expense teasers for wrap-up

COMPLIANCE TIPS:
- Take your time with medications — errors here cause the most post-enrollment complaints
- Always verify provider network status in Sunfire DURING the call, not after
- The recap is critical — it demonstrates you did a thorough needs assessment if audited
- Plant the dental/vision and final expense seeds naturally — don't push, just mention
- If a provider is out of network, disclose this NOW, not during enrollment
`,

  "Plan Selection & SOB": `
SECTION: Plan Selection & Summary of Benefits (Section 6)
SCRIPT REQUIREMENTS:
- MUST explain WHY you're recommending this specific plan based on NEADS findings
- MUST state dollar amounts for BOTH current plan and new plan when comparing (use Sunfire)
- MUST review: monthly premium, medical deductible, Part B deductible, Part D deductible (and which tiers), Rx copays/coinsurance by tier, PA/quantity limits/step therapy, catastrophic coverage limit
- MUST review: inpatient hospital costs, outpatient hospital costs, PCP visit costs, specialist costs, mental health costs, preventive services costs, ER costs, urgent care costs
- MUST review: out-of-network costs (if applicable), dental/vision/hearing costs, coverage outside US
- MUST read pre-enrollment disclosure about plan requirements
- MUST confirm beneficiary understanding before proceeding
- MUST mention Evidence of Coverage will be sent by mail/email
- MUST mention right to cancel before effective date
- If Part B reduction applies: MUST read the Part B reduction script including delay notice

COMMON MISTAKES:
- Not stating specific dollar amounts — saying "low cost" instead of actual numbers
- Not comparing to current plan costs side by side
- Skipping the catastrophic coverage explanation
- Not disclosing medications NOT on formulary
- Forgetting to mention PA/step therapy requirements
- Not reading the Part B reduction delay notice when applicable
- Rushing through benefits to get to enrollment

COMPLIANCE TIPS:
- This section is the most audited — take your time with every dollar amount
- If a medication isn't covered, you MUST disclose this even if it might lose the sale
- Always pull up Sunfire's Current Plan Summary of Benefits for side-by-side comparison
- The beneficiary should feel educated, not sold to — ask "Do you have any questions?" frequently
- Part B reduction delay is a common complaint source — make sure they understand it's not immediate
`,

  Enrollment: `
SECTION: Enrollment (Section 7)
SCRIPT REQUIREMENTS:
- MUST state specific plan name and that it will replace current coverage
- MUST state effective date and that it's subject to Medicare approval
- MUST confirm beneficiary understands plan selection with plan name, type, and contract number with PBP
- MUST disclose impact on existing coverage (current MA plan ends, Tricare affected, Medigap should be dropped)
- MUST read Federal Contracting Statement for the specific carrier
- MUST state: keep Parts A and B, continue paying Part B premium, can only be in one MA plan at a time
- MUST read MAPD Part D statement about network pharmacies
- MUST disclose potential late enrollment penalty for Part D
- MUST state benefits/premiums may change January 1
- MUST read Privacy Act Statement
- MUST get explicit verbal confirmations: understands plan, agrees to statements, understands disenrollment from current plan, ready to enroll
- MUST provide application/enrollment ID number after submission
- MUST provide carrier's customer service number and TTY

COMMON MISTAKES:
- Not using the specific plan name, type, and contract number — being vague
- Forgetting to mention the effective date is subject to Medicare approval
- Not disclosing Medigap implications
- Rushing through the Privacy Act Statement
- Not getting each individual verbal confirmation — bunching them together
- Forgetting to provide the application ID and carrier service number

COMPLIANCE TIPS:
- Each verbal confirmation should be a separate, clear "yes" — don't combine them
- Read the plan name, type, and contract number exactly as shown in Sunfire
- If the beneficiary hesitates on any confirmation, pause and re-explain — never pressure
- The application ID is critical — read it back slowly and clearly
- Always end with the carrier service number — they may need it before materials arrive
`,

  "Wrap-Up": `
SECTION: Wrap-Up (Section 8)
SCRIPT REQUIREMENTS:
- MUST mention Evidence of Coverage (EOC) document
- MUST state right to cancel before effective date
- MUST mention appeal rights for plan decisions
- MUST mention Medicare 5-Star rating system and where to find it
- MUST get final confirmations: understands benefits/conditions, understands information sharing, understands plan name and premium amount, understands proposed effective date
- MUST mention enrollment acknowledgment notice by mail
- MUST state member ID card timeline (7-10 business days, no later than 10 days from effective date)
- MUST provide callback number (877-909-1995)
- MUST offer to help family/friends
- Optional products (Hospital Indemnity, Dental & Vision, Final Expense) may ONLY be discussed AFTER Medicare enrollment is complete
- MUST clearly state each optional product is NOT Medicare and NOT affiliated with Medicare
- MUST get separate consent before discussing each optional product
- Agent reminder: Complete HRA on phone if applicable, enter info in NGHS Digital Sales Google Sheet, set status in EnrollHere

COMMON MISTAKES:
- Discussing optional products BEFORE Medicare enrollment is complete — this is a serious violation
- Not clearly separating Medicare enrollment from non-Medicare products
- Not getting explicit consent before each optional product discussion
- Forgetting to complete HRA on the call
- Not providing the callback number

COMPLIANCE TIPS:
- The Medicare/non-Medicare wall is absolute — make the transition crystal clear
- Each optional product needs its own consent — don't bundle them
- Keep optional product discussions brief and informational — don't hard sell
- Complete the HRA while still on the phone — don't plan to do it later
- Always end on a positive, warm note — this is the beneficiary's last impression
`,
};

const SectionCoach = memo(function SectionCoach({ stepName, context = "" }) {
  const [tip, setTip] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const askCoach = useCallback(async () => {
    setLoading(true);
    setExpanded(true);

    const sectionKnowledge = SECTION_KNOWLEDGE[stepName] || "";

    const systemPrompt = `You are an expert Medicare enrollment compliance coach with deep knowledge of CMS regulations, TPMO requirements, and carrier-specific enrollment procedures.

${sectionKnowledge}

${context ? `ADDITIONAL CONTEXT:\n${context}\n` : ""}

INSTRUCTIONS:
- Give ONE specific, actionable coaching tip for this exact section.
- Reference the actual script language or specific compliance requirement — don't be generic.
- If there's a common mistake for this section, warn about it specifically.
- Include the actual wording or phrasing the agent should use when relevant.
- Be concise (2-3 sentences max) but highly specific.
- Never give generic advice like "stay on script" — always reference the specific compliance point.`;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `Give me a specific, high-detail compliance tip for the "${stepName}" step. Reference actual script language or CMS requirements.`,
            },
          ],
        }),
      });
      const data = await response.json();
      const text =
        data.content
          ?.map((b) => (b.type === "text" ? b.text : ""))
          .filter(Boolean)
          .join("") ||
        "Review the script requirements for this section carefully.";
      setTip(text);
    } catch (err) {
      console.error("SectionCoach error:", err);
      setTip(
        "Unable to reach AI coach. Review the verbatim script and ensure all required disclosures are read completely."
      );
    } finally {
      setLoading(false);
    }
  }, [stepName, context]);

  return (
    <div className="section-coach">
      <div className="section-coach-header">
        <button
          className="section-coach-btn"
          onClick={askCoach}
          disabled={loading}
          title="Get a compliance tip for this section from AI"
        >
          {loading ? "⏳ Thinking…" : "🛠 AI Assist"}
        </button>
        {tip && (
          <button
            className="section-coach-toggle"
            onClick={() => setExpanded((p) => !p)}
          >
            {expanded ? "▲" : "▼"}
          </button>
        )}
      </div>

      {expanded && tip && <div className="section-coach-tip">{tip}</div>}
    </div>
  );
});

export default SectionCoach;

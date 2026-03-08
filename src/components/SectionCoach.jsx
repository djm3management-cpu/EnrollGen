import { useState, useEffect, useRef, memo, useCallback } from "react";
import { Sparkles, Loader2, ChevronUp, ChevronDown, MessageSquare, CheckCircle2, XCircle } from "lucide-react";
import { useAppAuth } from "../context/AuthContext";
import { useCopilotLog, LOG_TYPES } from "../context/CopilotTranscriptLog";
import { fetchWithClerk } from "../lib/clerkFetch";
import { useScript } from "../context/ScriptContext";

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
WHAT ACTUALLY HAPPENS: The client is often caught off guard or suspicious. They may say "how did you get my number?", "I didn't call you", or "I'm not interested." The agent must quickly build rapport, get their name, use it, and earn permission to continue.

REAL IN-THE-MOMENT TIPS:
- The moment they say their name, use it immediately: "Great, [First Name], I'm glad I caught you."
- Write down their phone number RIGHT NOW — ask: "What's the best number to reach you at in case we get disconnected?"
- If they say "I didn't sign up for anything" → "That's fine, I'm not here to sign you up. I just want to make sure you're getting all the benefits you're entitled to."
- If they say "I'm not interested" → don't hang up. Say: "I understand — can I ask, are you happy with your current Medicare coverage?" This reopens the conversation.
- If they ask "how did you get my number?" → "You were identified as someone who may qualify for additional Medicare benefits in your area."
- Do NOT rush into the pitch before confirming their name and getting verbal consent.

OBJECTION RESPONSES:
- "I already have insurance" → "Great! I just want to make sure it's still the best fit for you this year."
- "Is this a sales call?" → "I'm a licensed Medicare agent here to review your current benefits."
- "I don't have time" → "This only takes a few minutes and could save you money on your coverage."
`,

  "TPMO Disclaimer": `
WHAT ACTUALLY HAPPENS: You need their ZIP, full name, and callback number fast. Clients often try to skip ahead or ask "what plans do you have?" before you've collected the basics.

REAL IN-THE-MOMENT TIPS:
- Get their ZIP code first — you can't look up plans without it. Pull up Sunfire immediately while they're talking.
- Confirm the spelling of their full name: "And can I get your first and last name? How do you spell that?"
- Get a callback number before anything else: "What's the best number to reach you at if we get disconnected?"
- When you fill in the org/plan count, look it up in Sunfire for their ZIP — never guess or use a generic number.
- If they ask "do you have [specific plan]?" — say "Let me pull up what's available in your ZIP code right now." Don't answer until Sunfire loads.
- If they seem impatient during the disclaimer, say: "I just need to read you a quick required disclosure, then we'll get right into your benefits."

OBJECTION RESPONSES:
- "I already know what I want" → "Perfect, I just need 30 seconds to cover a required disclosure, then we'll go straight there."
- "Can you just tell me the plans?" → "Absolutely, I'm pulling them up right now — I just need your ZIP first."
- "Why do you need my phone number?" → "Just in case we get disconnected so I can call you right back."
`,

  "SNP Disclosure (DSNP)": `
WHAT ACTUALLY HAPPENS: Clients with both Medicare and Medicaid often don't fully understand what they have. They may say "I think I have Medicaid" without being sure. You need to confirm before proceeding.

REAL IN-THE-MOMENT TIPS:
- Ask directly: "Do you currently receive full Medicaid benefits — not just Extra Help for prescriptions, but full state Medicaid?" LIS/Extra Help is NOT Medicaid.
- If they're unsure, ask: "Do you pay anything for your doctor visits or hospital stays?" If no, they likely have full Medicaid.
- If they have a Medicaid card, ask them to read you the plan name on it — this confirms the level.
- D-SNP plans have $0 premiums and extra benefits. Lead with that once eligibility is confirmed: "Because you have both Medicare and Medicaid, you qualify for plans with $0 premium and added benefits like dental, vision, and grocery cards."
- If they say "my Medicaid pays for everything already" — explain the D-SNP adds Medicare Advantage benefits ON TOP of Medicaid.

OBJECTION RESPONSES:
- "I don't want to lose my Medicaid" → "This plan works WITH your Medicaid, it doesn't replace it."
- "I didn't know I qualified for special plans" → "Most people don't — that's exactly why I'm calling."
`,

  "SNP Disclosure (CSNP)": `
WHAT ACTUALLY HAPPENS: Clients qualify due to a chronic condition like diabetes, heart disease, or COPD. They often don't realize their condition is what gets them into a special plan with better benefits for managing that condition.

REAL IN-THE-MOMENT TIPS:
- Connect the plan to their condition: "Because you have diabetes, this plan is specifically built for you — it covers things like diabetic supplies, foot care, and eye exams at a lower cost."
- Make the physician verification feel easy: "Your doctor just needs to sign a simple form confirming your diagnosis. Most offices do this within a week."
- Emphasize the deadline clearly: "This needs to be completed by the end of your first month — if it's not returned, the enrollment gets voided. So we want to call your doctor's office as soon as you're enrolled."
- Ask who their doctor is right now so you can note it: "Who's your primary doctor? We'll want to make sure they're in network before we finalize anything."
- If they're worried about the form: "I can send you the form directly and walk you through exactly what to give your doctor's office."

OBJECTION RESPONSES:
- "What if my doctor doesn't send it in?" → "That's why I'd suggest calling their office the same week. It's a short form and most offices are familiar with it."
- "What happens if it gets voided?" → "You'd go back to your current coverage, but we'd want to avoid that — so let's make a plan right now."
`,

  "POA & Scope of Appointment": `
WHAT ACTUALLY HAPPENS: This is where you establish what you're allowed to discuss AND where many agents get in trouble by jumping straight to one plan. You MUST list all available product types — clients often don't know dental, vision, hearing, and Med Supp exist as options.

REAL IN-THE-MOMENT TIPS:
- List ALL product types available in their area, one by one: "In your area I can discuss Medicare Advantage plans, Medicare Supplement plans, standalone Part D prescription drug plans, and ancillary products like dental, vision, and hearing coverage. Which of those would you like to go over, or would you like an overview of all of them?"
- Never skip Med Supp — even if you think they won't want it. Scope requires you to offer it.
- If they're calling on behalf of a spouse or parent who isn't on the line, you MUST reschedule: "I'd love to help — can we set up a time when [Name] can be on the call with us?"
- If they say "just tell me about [one specific plan]" — you still need to read the full scope. Say: "Absolutely, we'll definitely cover that. I just need to read you a quick required disclosure first."
- Write down exactly which products they consented to discuss — if audited, vague scope = violation.
- Use a warm, consultative tone here: "I'm not here to sell you anything today. I just want to make sure you know all your options."

OBJECTION RESPONSES:
- "I only want Medicare Advantage" → Still list all products in scope, note their preference, then focus there.
- "What's the difference between all those?" → "Great question — that's exactly what we're going to go through together."
`,

  Qualifications: `
WHAT ACTUALLY HAPPENS: This is the most information-dense section. Clients may not have their Medicare card handy, may not know their Part A/B dates, may be confused about what VA benefits they have, or may have employer coverage that disqualifies them.

REAL IN-THE-MOMENT TIPS:
- If they can't find their Medicare card: "No problem — can you give me your full name, date of birth, and the last 4 of your Social? I can work with that."
- Always read back their Part A and Part B effective dates: "So your Part A started January 1st, 2010, and your Part B started March 1st, 2010 — does that sound right to you?"
- For Medicaid/Extra Help: "Do you get any help from the state paying for your Medicare costs? Some people get a card from the state that helps with premiums or copays."
- For VA benefits: Ask specifically — "Is it basic VA coverage or do you have TRICARE or CHAMPVA?" Basic VA = OK to proceed. TRICARE for Life or CHAMPVA = you must end the call.
- For employer coverage: "Do you currently have health insurance through a job, a union, or a spouse's employer?" If yes, stop and end politely.
- TCPA must sound optional: "I do want to mention — and this is completely optional — you have the right to be contacted by us about your benefits. Would that be okay?"
- For veterans: Always thank them for their service before moving on.
- For enrollment period: Know which one applies before this call — AEP (Oct 15–Dec 7), OEP (Jan 1–Mar 31), or SEP (triggered by specific life event).

OBJECTION RESPONSES:
- "I don't want to give my Social Security number" → "That's completely fine — your Medicare ID number works too."
- "I have VA coverage, does that disqualify me?" → "Basic VA doesn't — it actually works alongside Medicare Advantage."
`,

  "NEADS Assessment": `
WHAT ACTUALLY HAPPENS: This is the discovery phase. Clients reveal what they actually care about — their doctors, their meds, their pharmacy. This is where you win or lose the sale based on how well you listen and respond.

REAL IN-THE-MOMENT TIPS:
- When they give a doctor's name, look them up in Sunfire immediately: "Let me pull up Dr. [Name] right now to confirm they're in network." Do NOT wait until after the call.
- For medications, get the full picture: name, dosage, how many times a day, how many pills per fill, brand or generic. A wrong dosage = wrong formulary check.
- If a provider is NOT in network, say it now: "I do want to flag that Dr. [Name] isn't in network on that plan — let me check if there's another plan that covers them, or if there's a similar provider nearby."
- Ask about specialty pharmacies: "Do you use a specialty pharmacy for any of your medications, like for injectables or infusion drugs?"
- Ask about travel: "Do you spend time in another state — like for the winter?" This matters for HMO vs PPO.
- Do the recap before moving on: "Let me read back what I have so far — I want to make sure I didn't miss anything."
- Plant the seed for dental/vision naturally: "Once we finish with your Medicare plan, I'd also love to show you some dental and vision options — would that be okay?"

OBJECTION RESPONSES:
- "I don't remember all my medications" → "No problem, let's go through it slowly. What do you take in the morning?"
- "I've had the same doctor for 20 years" → "That's great — let me make sure he/she stays in network so nothing changes for you."
`,

  "Plan Selection & SOB": `
WHAT ACTUALLY HAPPENS: The client is evaluating whether this plan is actually better than what they have. They will push back with "my current plan covers that too" or "what does this cost me if I go to the ER?" You need real numbers, side by side.

REAL IN-THE-MOMENT TIPS:
- Pull up their current plan in Sunfire and present the comparison side by side: "Right now on your current plan, your PCP copay is $X. On this new plan it's $Y."
- Always state the MOOP (Maximum Out of Pocket): "The most you would ever pay out of pocket in a year on this plan is $[amount]. After that, everything is covered 100%."
- For Part B reduction plans: "This plan reduces your Part B premium — but the reduction doesn't start until the month after your enrollment is approved, so your first month you'll still pay the full amount."
- For medications not on formulary: "I need to let you know that [medication] isn't covered on this plan's formulary. We can look at an exception, a different plan, or discuss alternatives with your doctor."
- For HMO plans: "Just to be clear — this is an HMO, which means you need referrals to see specialists, and out-of-network care isn't covered except in emergencies."
- Ask frequently: "Does that make sense? Do you have any questions about that before we move on?"
- Don't rush to enrollment — a client who feels informed is far less likely to cancel or complain.

OBJECTION RESPONSES:
- "My current plan seems fine" → "Let's compare it line by line — you might be surprised where you could save."
- "What if I need to go out of network?" → "Great question — let me show you exactly what that would cost on this plan."
`,

  Enrollment: `
WHAT ACTUALLY HAPPENS: The client is committing. They may get nervous, ask last-minute questions, or hesitate on confirmations. This is the most legally sensitive part of the call — every verbal confirmation must be separate and clear.

REAL IN-THE-MOMENT TIPS:
- State the full plan name, type, and contract number from Sunfire exactly as shown: "The plan we're enrolling you in today is [Full Plan Name], a Medicare Advantage [HMO/PPO] plan, contract number [H####], Plan [###]."
- The effective date is NOT guaranteed: "Your effective date will be [date], subject to approval by Medicare — you'll receive a confirmation in the mail."
- If they have a Medigap/Med Supp plan: "Once your Medicare Advantage plan is active, you'll want to cancel your Medigap plan since you can't use both at the same time."
- Get confirmations ONE at a time — never bundle them: "Do you understand this plan will replace your current coverage? ... And do you understand you can only be in one Medicare Advantage plan at a time? ... And are you ready to enroll today?"
- After submitting: Read the application/confirmation ID number slowly and clearly. Then say: "I'd write that down — that's your proof of enrollment."
- Give the carrier's member services number: "If you have any questions before your card arrives, you can call [carrier] directly at [number]."

OBJECTION RESPONSES:
- "Can I think about it?" → "Absolutely. I just want to make sure — is there anything you're still unsure about that I can clarify right now?"
- "What if I change my mind?" → "You can cancel before your effective date and your current coverage stays in place."
`,

  "Wrap-Up": `
WHAT ACTUALLY HAPPENS: Enrollment is done but the call isn't over. This is where you protect the enrollment from cancellation, set expectations so the client doesn't panic when things arrive in the mail, and open doors for referrals and ancillary products.

REAL IN-THE-MOMENT TIPS:
- Set expectations for what arrives in the mail: "You'll receive an enrollment acknowledgment letter first, then your member ID card within 7-10 business days, and finally your full Evidence of Coverage booklet. Don't cancel your old plan until your new card arrives."
- Reinforce their decision: "You made a great choice today, [First Name]. This plan is going to save you money and give you better coverage."
- Cancel anxiety: "If for any reason you change your mind before [effective date], you can cancel and your current coverage stays in place — just call me at 877-909-1995."
- For optional products — ONLY after Medicare enrollment is fully complete: "Now that we've finished your Medicare enrollment, I want to mention — completely separate from Medicare — there are some dental and vision plans available to you. Would you like to hear about those? I want to be clear these are not Medicare plans."
- Ask for referrals naturally: "If you have a spouse, family member, or friend who might also benefit from a review of their Medicare coverage, I'd love to help them too."
- Complete the HRA on the phone before hanging up — do not plan to do it later.
- Log the enrollment in the NGHS Google Sheet and update EnrollHere status before the next call.

OBJECTION RESPONSES:
- "I'm worried I made the wrong choice" → "I understand — let me go over what you're getting one more time so you feel confident."
- "My friend said Medicare Advantage is bad" → "Some people have had bad experiences when they weren't fully informed. That's exactly why we went through everything in detail today."
`,
};

const SectionCoach = memo(function SectionCoach({ stepName, context = "", sectionNum }) {
  const [tip, setTip] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { logEntry } = useCopilotLog();
  const { getToken } = useAppAuth();
  const { activeSection } = useScript();
  const hasAutoFiredRef = useRef(false);

  const askCoach = useCallback(async () => {
    setLoading(true);
    setExpanded(true);
    setTip(null);

    const sectionKnowledge = SECTION_KNOWLEDGE[stepName] || "";

    const systemPrompt = `You are a live call coach for Medicare insurance agents at New Gen Health Solutions. You give fast, specific, practical tips based on what actually happens during a call in this section — not generic compliance reminders.

${sectionKnowledge}

${context ? `ADDITIONAL CONTEXT:\n${context}\n` : ""}

INSTRUCTIONS:
Respond with ONLY a valid JSON object — no extra text, no markdown, no backticks:
{
  "focus": "One sentence about the real challenge in this section right now.",
  "do": ["Specific action 1", "Specific action 2", "Specific action 3"],
  "avoid": ["Specific mistake 1", "Specific mistake 2"],
  "script_tip": "An exact word-for-word phrase the agent can say right now on this call."
}

Rules:
- Every item must be specific to THIS section — nothing generic like "stay on script" or "be compliant"
- "do" items are things the agent should do RIGHT NOW on the call
- "avoid" items are real mistakes agents make in this exact section
- "script_tip" is a real sentence the agent can read directly to the client
- No markdown, no asterisks, no bullet characters — plain text only
- Keep each item under 15 words`;

    try {
      const response = await fetchWithClerk(getToken, "/.netlify/functions/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 450,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `Give me the compliance coaching card for the "${stepName}" section.`,
            },
          ],
        }),
      });
      const data = await response.json();
      const raw = data.content
        ?.map((b) => (b.type === "text" ? b.text : ""))
        .filter(Boolean)
        .join("")
        .trim();

      try {
        const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
        setTip(parsed);
        // Log the coach tip to transcript
        const tipSummary = parsed.focus || "Coach tip provided";
        logEntry(LOG_TYPES.SECTION_COACH, "info", tipSummary, {
          section: stepName,
          doItems: parsed.do,
          avoidItems: parsed.avoid,
          scriptTip: parsed.script_tip,
        });
      } catch {
        // fallback: show raw text if JSON parse fails
        const fallbackMsg =
          raw || "Review the script requirements for this section carefully.";
        setTip({ fallback: fallbackMsg });
        logEntry(LOG_TYPES.SECTION_COACH, "info", fallbackMsg, {
          section: stepName,
        });
      }
    } catch (err) {
      console.error("SectionCoach error:", err);
      setTip({
        fallback:
          "Unable to reach AI coach. Review the verbatim script and ensure all required disclosures are read completely.",
      });
    } finally {
      setLoading(false);
    }
  }, [stepName, context, logEntry, getToken]);

  /* ─── Auto-trigger when this section becomes active ─── */
  useEffect(() => {
    if (sectionNum === undefined) return;
    const isActive = String(activeSection) === String(sectionNum);
    if (isActive && !hasAutoFiredRef.current && !loading) {
      hasAutoFiredRef.current = true;
      // Small delay so the section card finishes animating in
      const t = setTimeout(() => askCoach(), 800);
      return () => clearTimeout(t);
    }
    if (!isActive) {
      hasAutoFiredRef.current = false;
      setTip(null);
    }
  }, [activeSection, sectionNum, loading, askCoach]);

  const renderTip = () => {
    if (!tip) return null;
    if (tip.fallback) return <p style={{ margin: 0 }}>{tip.fallback}</p>;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {tip.focus && (
          <p
            style={{
              margin: 0,
              color: "#a0c4ff",
              fontStyle: "italic",
              fontSize: "0.9em",
            }}
          >
            {tip.focus}
          </p>
        )}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "10px",
          }}
        >
          {tip.do?.length > 0 && (
            <div
              style={{
                background: "rgba(46,204,113,0.1)",
                border: "1px solid rgba(46,204,113,0.3)",
                borderRadius: "6px",
                padding: "10px",
              }}
            >
              <div
                style={{
                  color: "#2ecc71",
                  fontWeight: "bold",
                  fontSize: "0.75em",
                  letterSpacing: "0.08em",
                  marginBottom: "6px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <CheckCircle2 size={11} /> DO
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                {tip.do.map((item, i) => (
                  <li key={i} style={{ fontSize: "0.85em", lineHeight: 1.4 }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {tip.avoid?.length > 0 && (
            <div
              style={{
                background: "rgba(231,76,60,0.1)",
                border: "1px solid rgba(231,76,60,0.3)",
                borderRadius: "6px",
                padding: "10px",
              }}
            >
              <div
                style={{
                  color: "#e74c3c",
                  fontWeight: "bold",
                  fontSize: "0.75em",
                  letterSpacing: "0.08em",
                  marginBottom: "6px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <XCircle size={11} /> AVOID
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                }}
              >
                {tip.avoid.map((item, i) => (
                  <li key={i} style={{ fontSize: "0.85em", lineHeight: 1.4 }}>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {tip.script_tip && (
          <div
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "6px",
              padding: "10px",
            }}
          >
            <div
              style={{
                color: "#f39c12",
                fontWeight: "bold",
                fontSize: "0.75em",
                letterSpacing: "0.08em",
                marginBottom: "4px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <MessageSquare size={11} /> SAY THIS
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "0.85em",
                fontStyle: "italic",
                lineHeight: 1.4,
              }}
            >
              "{tip.script_tip}"
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="section-coach">
      <div className="section-coach-header">
        <button
          className="section-coach-btn"
          onClick={askCoach}
          disabled={loading}
          title="Get a compliance tip for this section from AI"
        >
          {loading ? (
            <><Loader2 size={13} className="coach-spin" style={{ marginRight: 6 }} />Thinking…</>
          ) : (
            <><Sparkles size={13} style={{ marginRight: 6 }} />AI Assist</>
          )}
        </button>
        {tip && (
          <button
            className="section-coach-toggle"
            onClick={() => setExpanded((p) => !p)}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      {expanded && tip && (
        <div className="section-coach-tip">{renderTip()}</div>
      )}
    </div>
  );
});

export default SectionCoach;

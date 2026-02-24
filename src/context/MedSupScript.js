export const MEDSUP_SECTIONS = [
  {
    id: "ms-1",
    num: 1,
    key: "recordingOk",
    label: "Recording Disclosure",
    required: true,
    script: [
      "Thank you for calling New Gen Health Solutions, this is [Agent Name]. Who do I have the pleasure of speaking with today?",
      "Hi [First Name], great to meet you. Quick heads-up — this call may be recorded and monitored for quality and compliance purposes. Is that okay with you?",
    ],
    notes: [
      "Use first name throughout — never Sir or Ma'am.",
      "If they decline recording: follow company policy, log the objection in CRM.",
    ],
    gate: "Recording consent confirmed",
  },
  {
    id: "ms-2",
    num: 2,
    key: "tpmoOk",
    label: "TPMO Disclosure",
    required: true,
    compliance: true,
    script: [
      "We do not offer every plan available in your area. Any information we provide is limited to those plans we do offer. Please contact Medicare.gov or 1-800-MEDICARE to get information on all of your options.",
    ],
    notes: [
      "Read verbatim — do not paraphrase, summarize, or skip.",
      "Log 'TPMO delivered' in CRM after reading.",
    ],
    gate: "TPMO disclosure delivered",
  },
  {
    id: "ms-3",
    num: 3,
    key: "qualOk",
    label: "Qualification",
    required: true,
    script: [
      "Before I pull up any options, I just need three quick things — this literally takes about a minute.",
      "How old are you, and are you currently enrolled in both Medicare Part A and Part B?",
      "And what state do you live in?",
      "And right now, are you on a Medicare Supplement plan, a Medicare Advantage plan, or just Original Medicare?",
      "Great, that's everything I need. Let me make sure I give you the most useful information.",
    ],
    notes: [
      "Q1: If not yet on Medicare but turning 65 — note birthday, explain OEP window, set callback. Do not continue.",
      "Q2: Confirm you are licensed in their state before going further.",
      "Q3: This answer sets the branch. Log current carrier name if known.",
    ],
    gate: "Caller qualified — Part A+B confirmed, state confirmed, coverage type known",
  },
  {
    id: "ms-4",
    num: 4,
    key: "branchOk",
    label: "Branch: Needs Discovery",
    required: true,
    branches: [
      {
        id: "branch-a",
        label: "Branch A — Rate Shopper",
        trigger:
          '"My rates went up," "Am I paying too much?" "I want to shop around"',
        color: "#38bdf8",
        script: [
          "That's one of the most common reasons people call us — rates can go up every year even when nothing about your health changes, and it really adds up. You're smart to be shopping.",
          "Can I ask — do you know what plan letter you have? It'll be on your insurance card, usually something like Plan G or Plan N.",
          "And what are you paying per month right now, or what did your renewal notice say your new rate is going to be?",
          // underwriting
          "To get you an accurate rate — not just an estimate — I do need to ask a couple of quick health questions. Medicare Supplement plans outside of special enrollment periods do ask about your health history. Is that okay?",
          "In the past two years, have you been hospitalized, had any major surgeries, or been diagnosed with any significant conditions — things like cancer, heart disease, COPD, or kidney disease?",
          // comparison
          "Okay, based on what you've told me, I'm looking at a couple of options that give you the exact same coverage you have now — or better — at a lower monthly premium. Here's what I'm seeing:",
          "Right now you're paying [CURRENT PREMIUM] with [CURRENT CARRIER] on a [PLAN LETTER]. I can show you [PLAN LETTER] coverage through [CARRIER NAME] at around [QUOTED PREMIUM] per month — that's a savings of about [DIFFERENCE] every month, or [ANNUAL SAVINGS] a year.",
          "The coverage itself is identical — same plan letter means same benefits, same doctor access, same Medicare claims process. The only difference is the carrier name on your card and the lower premium.",
          "Does that make sense? Do you have any questions before I walk you through what the switch looks like?",
        ],
        notes: [
          "Validation before quote — never jump straight to numbers.",
          "If they don't know plan letter: 'No problem — just tell me your carrier and monthly premium.'",
          "Log exact current premium — this is your comparison anchor.",
          "GI window: within 6 months of Part B effective date or losing employer coverage — skip underwriting, note GI in CRM.",
          "Always annualize savings: $30/mo = $360/yr. Use both figures.",
        ],
      },
      {
        id: "branch-b",
        label: "Branch B — Bill Shock",
        trigger:
          '"I had a big bill," "Medicare didn\'t cover it," "I\'m confused about what I owe"',
        color: "#f87171",
        script: [
          "I'm sorry to hear that — dealing with unexpected medical bills is stressful, especially when you thought you were covered. Tell me what happened, if you don't mind sharing.",
          "So just to make sure I understand — you received a bill for [DESCRIBE EVENT], and you weren't expecting to owe that because you thought Medicare or your current coverage would handle it. Is that right?",
          "That's actually a really common gap — and the good news is there's a very straightforward way to close it. Let me explain what happened and how a Medicare Supplement fills that hole.",
          "Original Medicare covers about 80% of approved medical costs after the deductibles. That other 20% — plus hospital daily copays and other cost-sharing — falls on you. On a big claim that can add up to thousands. A Medicare Supplement is specifically designed to pick up exactly what Medicare leaves behind.",
          "Based on what happened to you, what I'd recommend is [Plan G or Plan N]. Here's why that plan makes sense for your situation specifically:",
          "With [PLAN G/N] through [CARRIER], what happened to you last [month/year] would have cost you nothing out of pocket beyond your Part B deductible. And your monthly premium would be around [QUOTED PREMIUM]. Given the bill you just dealt with, that's likely less than one month's peace of mind would cost you anyway.",
        ],
        notes: [
          "Let them talk. Do not interrupt — the specific bill tells you which gap to fill.",
          "Always restate their story back: builds trust, confirms you're solving the right problem.",
          "Hospital bill → explain Part A deductible + daily copays.",
          "Specialist/imaging → explain Part B coinsurance (20% with no cap).",
          "Plan G: best for frequent users or anyone who just had a significant bill.",
          "Plan N: lower premium, $20 office / $50 ER copays — good for generally healthy callers.",
        ],
      },
      {
        id: "branch-c",
        label: "Branch C — MA Crossover",
        trigger:
          '"I\'m on an Advantage plan," "I can\'t see my doctor," "I heard I could switch back"',
        color: "#34d399",
        compliance: true,
        script: [
          "I'm glad you called — this is a question we get a lot, and the honest answer is: yes, you can move from an Advantage plan to a Supplement, but how easy it is depends on a few things. Let me ask you a couple of questions first so I can give you an accurate picture.",
          "What's driving the interest in switching — is it a specific doctor or hospital you can't access, prior authorization headaches, or something else?",
          "Here's the clearest way to explain the difference: Medicare Advantage plans run everything through the plan — networks, prior authorizations, and benefits that can change every year. Original Medicare with a Supplement is a different model. Medicare pays first on any approved claim, anywhere in the country, with no networks and no prior authorizations from a private insurer. Your costs become predictable and your care stays between you and your doctor.",
          "Now here's the important thing I want to be upfront about: switching from an Advantage plan to a Supplement outside of certain windows usually requires medical underwriting — the carrier will ask about your health history. That doesn't mean you can't switch — most people qualify. But I want to ask a few questions so we can confirm before I give you numbers. Is that okay?",
          "Have you had any significant health issues in the last two years — things like heart disease, COPD, cancer, diabetes with complications, kidney disease, or been hospitalized more than once?",
          "Based on what you've told me, the plan that fits most people in your situation is Plan G. You'd have no network restrictions, no prior authorizations needed, and your costs would be very predictable. The monthly premium through [CARRIER] would be around [QUOTED PREMIUM].",
          "For timing — you'd want to drop your Advantage plan during Annual Enrollment in the fall, with coverage reverting to Original Medicare on January 1st, and your Supplement effective the same date. I can help you coordinate both pieces so there's no gap and no overlap.",
        ],
        notes: [
          "🚨 COMPLIANCE: Most states require underwriting outside GI windows. CT, ME, MA, NY have year-round GI rights.",
          "Set honest expectations before building any enrollment timeline.",
          "If they disclose health conditions: do not disqualify — 'Some carriers are more lenient — I'll find the best available option.'",
          "If outside AEP: check for SEP before saying 'wait until fall' — moving, losing coverage, 5-star SEP, trial right.",
        ],
      },
    ],
    gate: "Branch completed — plan identified, quote given",
  },
  {
    id: "ms-5",
    num: 5,
    key: "objectionOk",
    label: "Objection Handling",
    required: false,
    optional: true,
    objections: [
      {
        trigger: "I need to think about it",
        response:
          "Absolutely — this is an important decision and there's no rush. Can I ask: is there something specific you want to think through, or is it more that you want to talk it over with a family member? [Address their specific concern, then:] Here's what I'll do — I'll send you a simple one-page summary of everything we talked about, including the plan details and monthly premium, so you have it in writing. Then let's set a quick 10-minute call for [DAY/TIME] to answer any remaining questions. Does [SPECIFIC DAY AND TIME] work for you?",
        tip: "Always book the follow-up before ending the call. 'Call me anytime' has near-zero conversion.",
      },
      {
        trigger: "Just give me your best price",
        response:
          "I want to give you the lowest rate that actually protects you — not just the cheapest number. The cheapest plan might leave you with big out-of-pocket costs that end up costing more than the savings. It takes me about two more minutes to make sure I'm comparing the right things. Is that fair?",
        tip: "After they agree, confirm plan letter and go to branch presentation.",
      },
      {
        trigger: "I don't want to change my doctors",
        response:
          "That's completely understandable — your relationship with your doctors matters. Here's the good news: with a Medicare Supplement, you can see any doctor, any specialist, any hospital in the country that accepts Medicare — and 93% of U.S. physicians do. Your doctors don't change at all. The only thing that changes is who pays the bill after Medicare.",
        tip: "Offer to verify a specific doctor on the spot.",
      },
      {
        trigger: "I already got a cheaper quote",
        response:
          "That's great — you're doing exactly what you should be doing. Can I ask who you talked to and what plan letter they quoted you? I want to make sure you're comparing apples to apples, because two equivalent plans from different carriers should be very similar. If theirs is significantly cheaper, there might be a reason — and I'd want to help you understand it before you commit.",
        tip: "Do not bash competitors. Build trust by being the most transparent person they've spoken to.",
      },
      {
        trigger: "I can't afford it",
        response:
          "I hear that — and I want to make sure we're looking at all your options. A few things worth knowing: first, I can look at carriers that offer lower premiums for your area and age. Second, a Plan N gives you strong protection at a meaningfully lower premium than Plan G. And third — what are you paying now in out-of-pocket costs? Sometimes a Supplement is actually less expensive once you factor in what you're already spending.",
        tip: "Do the math together. Compare total annual cost (premium + OOP), not just monthly premium.",
      },
      {
        trigger: "I want to look online myself",
        response:
          "Absolutely — and there's good information online. The thing I'd flag is that a lot of what you'll find are lead gen sites that collect your info and sell it to multiple agents who will all call you. We're a licensed independent agency, and everything I'm showing you is the same or better than what you'd find anywhere else — and I can answer questions in real time. If you'd prefer to do some research first, I completely understand. Can I get your email so I can send you a reference sheet in the meantime?",
        tip: null,
      },
    ],
    gate: "Objections addressed",
  },
  {
    id: "ms-6",
    num: 6,
    key: "enrollOk",
    label: "Close & Enrollment",
    required: true,
    script: [
      // Close A
      "Great — let's get you set up. I'll start the application for [PLAN] through [CARRIER], and it takes about [X] minutes. I'll walk you through every question. Are you in front of your Medicare card?",
      "Perfect. I'm also required to let you know that the application will include a few standard health questions, and you may receive a call or letter from [CARRIER] to confirm your enrollment. Your coverage effective date will be [DATE].",
    ],
    followUpScript: [
      // Close B
      "[First Name], I completely understand — take the time you need. Here's what I'll do: I'm going to send you a simple written summary of the plan we talked about — the coverage, the monthly premium, and what it would have covered in your situation. You'll have everything in one place.",
      "Then let's set a quick call for [DAY] at [TIME] — 10 minutes, just to answer any questions that come up after you've had a chance to look it over. Does [DAY] at [TIME] work?",
      "What's the best email to send that to? And is [PHONE NUMBER] still the best number for the follow-up?",
    ],
    notes: [
      "'Are you in front of your Medicare card?' is the action anchor — puts them in motion without asking 'do you want to enroll?'",
      "During application: read all carrier disclosures exactly as written. Do not summarize or skip required questions.",
      "Log recording timestamp for enrollment.",
    ],
    crmChecklist: [
      "Full name, DOB, ZIP code",
      "Current coverage: carrier, plan letter, monthly premium",
      "Quote given: carrier, plan letter, quoted premium, effective date",
      "Disposition: enrolled / follow-up scheduled / not interested",
      "Follow-up date and time (if applicable)",
      "Email and best callback number confirmed",
      "TPMO disclosure delivered",
      "Enrollment recording timestamp",
      "Underwriting notes / health disclosures",
    ],
    gate: "Enrolled or follow-up scheduled and logged",
  },
  {
    id: "ms-7",
    num: 7,
    key: "wrapOk",
    label: "Compliance Wrap-Up",
    required: true,
    compliance: true,
    script: [
      "Before I let you go — let me do a quick summary of what we covered today. [Recap: coverage reviewed, plan quoted, next step.] Does that match your understanding? Is there anything I said that I can explain more clearly?",
      "We do not offer every plan available in your area. Any information we provide is limited to those plans we do offer. Please contact Medicare.gov or 1-800-MEDICARE to get information on all of your options.",
      "Thank you so much for calling New Gen Health Solutions, [First Name]. We really appreciate you trusting us with your Medicare coverage. Don't hesitate to call us back with any questions — this same number will always reach us. Have a great day.",
    ],
    notes: [
      "Read TPMO verbatim — never paraphrase.",
      "Log TPMO delivery timestamp in CRM.",
    ],
    gate: "Wrap-up complete, TPMO re-delivered",
  },
];

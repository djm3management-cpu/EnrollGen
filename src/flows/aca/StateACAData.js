export const STATE_ACA_GATES = [
  {
    id: "state-aca-0",
    num: 0,
    key: "gate0Ok",
    title: "Opening & Coverage Screening",
    script: [
      "Hi, this is [Agent Name], licensed agent with New Gen Health Solutions.",
      "The main purpose of this call is health insurance. There are a few qualifying questions I need to ask first. Let's get started.",
      "Do you currently have coverage through your employer, Medicaid, or anything like that?",
    ],
    notes: [
      "Await the client's introduction before moving forward.",
      "If the client says yes to employer coverage, Medicaid, or similar active coverage, stop this quoting flow instead of continuing.",
    ],
    gate: "Coverage screened and intro completed",
  },
  {
    id: "state-aca-1",
    num: 1,
    key: "gate1Ok",
    title: "ZIP, DOB & Household",
    script: [
      "Perfect. To see what plans are available in your area, what is the ZIP code where you currently live?",
      "What is your date of birth?",
      "Is there anyone else in your household who needs this coverage as well, such as a spouse or children?",
    ],
    notes: [
      "Verify the ZIP code and county before moving on.",
      "Confirm the date of birth and note anyone else applying for coverage.",
    ],
    gate: "ZIP, county, DOB, and household captured",
  },
  {
    id: "state-aca-2",
    num: 2,
    key: "gate2Ok",
    title: "Income & FPL Review",
    script: [
      "What is your estimated household income for 2025?",
      "If you do have income, I can deduct up to 30% for taxes when I work up the quote.",
      "If you are not working but looking for work, I can use the minimum income amount from the FPL chart so the quote can load today, but I need your agreement before I enter that amount.",
    ],
    notes: [
      "Use the FPL tool below where the script references the chart.",
      "The client must explicitly consent before you enter any minimum working income on the quote.",
    ],
    gate: "Income reviewed and FPL reference confirmed",
  },
  {
    id: "state-aca-3",
    num: 3,
    key: "gate3Ok",
    title: "Doctors, Prescriptions & Household Needs",
    script: [
      "While these plans are loading, do you have any doctors, hospitals, or prescriptions you want me to check?",
      "I want to make sure your providers take these plans and your medications are covered as well.",
    ],
    notes: [
      "Verify the spelling of all doctors, hospitals, and medications before comparing plans.",
      "Keep the household members needing coverage tied to the quote you are building.",
    ],
    gate: "Providers and medications gathered",
  },
  {
    id: "state-aca-4",
    num: 4,
    key: "gate4Ok",
    title: "Plan Review & Selection",
    script: [
      "Now that I have the best matches in front of me, let me compare the top plans for you.",
      "I will walk through the monthly premium, deductible, primary care copay, specialist copay, and prescription costs so you can see the difference clearly.",
    ],
    notes: [
      "Compare the strongest plan options after provider and prescription checks are complete.",
      "Keep the explanation focused on premium, deductible, PCP, specialist, and Rx costs.",
    ],
    gate: "Plans reviewed and direction selected",
  },
  {
    id: "state-aca-5",
    num: 5,
    key: "gate5Ok",
    title: "Selection & Login Handoff",
    script: [
      "Once we pick the plan, click Login on the top right of the page to continue the application.",
      "Before moving forward, confirm again which plan the client wants and that the pricing you reviewed is the plan they are selecting.",
    ],
    notes: [
      "Use this gate as the handoff from quoting into the live application.",
      "Do not move to login until the client clearly agrees with the selected plan.",
    ],
    gate: "Plan selected and login handoff ready",
  },
  {
    id: "state-aca-6",
    num: 6,
    key: "gate6Ok",
    title: "Wrap-Up & Next Step",
    script: [
      "Let me recap the plan we selected and the next step before I move into the login screen.",
      "After login, I will continue the application with the information we verified on this call.",
    ],
    notes: [
      "Use the recap to make sure the client understands the selected plan and the application is the next step.",
      "Record any plan choice details before leaving the quote screen.",
    ],
    gate: "Recap complete and application ready",
  },
];

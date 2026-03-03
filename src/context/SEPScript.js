/*
  NGHS Medicare SEP Qualification Script
  Source: NGHS_SEP_Agent_Script.pdf
  Intended use: AgentTools data module for rendering a “SEP Lookup” tool
*/

export const NGHS_SEP_SCRIPT = {
  title: "Medicare SEP Qualification Script",
  subtitle: "Agent Reference | New Gen Health Solutions | Internal Use Only",
  instructions:
    "Work through each section. If the customer answers YES to any screening question, document the SEP trigger, confirm the enrollment window, and proceed with plan selection.",
  footer:
    "Internal Agent Reference. Not for distribution to beneficiaries. Always verify eligibility in the carrier system before submitting enrollment.",
  sections: [
    {
      id: "move",
      name: "Change of Address or Move",
      items: [
        {
          id: "move_recent_or_planned",
          ask: "Have you recently moved, or are you planning to move soon?",
          allowed_actions: [
            "Switch to any MA or PDP plan",
            "Return to Original Medicare for MA enrollees",
          ],
          window:
            "Starts on move date or 1 month prior if plan notified. Ends 2 full months after move.",
        },
        {
          id: "move_back_from_abroad",
          ask: "Did you recently move back to the U.S. after living abroad?",
          allowed_actions: ["Join any MA or PDP plan"],
          window: "2 full months after the month of return.",
        },
        {
          id: "institution_reside_or_discharged",
          ask: "Do you currently live in or have you recently been discharged from a nursing home, rehab facility, or similar institution?",
          allowed_actions: [
            "Join, switch, or drop MA or PDP",
            "Return to Original Medicare",
          ],
          window:
            "Ongoing while residing in institution, plus 2 full months after discharge.",
        },
        {
          id: "released_from_jail",
          ask: "Were you recently released from jail or a correctional facility?",
          allowed_actions: ["Join any MA or PDP plan"],
          window:
            "2 full calendar months after release and must have active Part A and Part B.",
        },
      ],
    },

    {
      id: "loss",
      name: "Loss of Coverage",
      items: [
        {
          id: "lost_medicaid",
          ask: "Did you recently lose Medicaid eligibility?",
          allowed_actions: [
            "Join or switch MA or PDP",
            "Return to Original Medicare",
            "Drop PDP",
          ],
          window:
            "3 full months from date of loss or date of notice, whichever is later.",
        },
        {
          id: "lost_employer_union_cobra",
          ask: "Did you recently lose employer, union, or COBRA coverage?",
          allowed_actions: ["Join any MA or PDP plan"],
          window: "2 full months after the month coverage ended.",
        },
        {
          id: "lost_creditable_drug",
          ask: "Did you involuntarily lose other creditable drug coverage, or did your coverage become non creditable?",
          allowed_actions: ["Join MA with drug coverage or stand alone PDP"],
          window:
            "2 full months after losing creditable coverage. Confirm coverage was truly creditable and loss was involuntary.",
        },
        {
          id: "left_cost_or_pace",
          ask: "Did you recently leave a Medicare Cost Plan or drop a PACE plan?",
          allowed_actions: ["Join any MA or PDP plan"],
          window:
            "2 full months after the month you left the Cost or PACE plan.",
        },
      ],
    },

    {
      id: "new_coverage",
      name: "New Coverage Opportunity",
      items: [
        {
          id: "employer_union_opportunity",
          ask: "Do you have a chance to enroll in employer or union coverage right now?",
          allowed_actions: [
            "Drop current MA or PDP to enroll in employer or union plan",
          ],
          window:
            "Whenever the employer or union open enrollment window is open.",
        },
        {
          id: "va_tricare_creditable",
          ask: "Do you have or are you enrolling in creditable drug coverage through VA, TRICARE, or similar?",
          allowed_actions: [
            "Drop MA with drug coverage or PDP",
            "Switch MA to plan without drug coverage",
          ],
          window: "Anytime.",
        },
        {
          id: "enrolled_in_pace",
          ask: "Did you recently enroll in a PACE plan?",
          allowed_actions: ["Drop current MA or PDP"],
          window: "Anytime.",
        },
      ],
    },

    {
      id: "contract_changes",
      name: "Plan Contract Changes",
      items: [
        {
          id: "sanctioned_taken_over_terminated_nonrenewed",
          ask: "Has your current plan been sanctioned by Medicare, taken over by the state, or had its contract terminated or non renewed?",
          allowed_actions: [
            "Switch to any MA or PDP plan",
            "Return to Original Medicare if no new MA selected",
          ],
          window:
            "Varies by action type. Generally begins 1 to 2 months before contract end and ends 1 to 2 months after. Non renewal window is Dec 8 through last day of Feb.",
        },
      ],
    },

    {
      id: "other",
      name: "Dual Eligible, Extra Help, and Other",
      items: [
        {
          id: "dual_or_lis",
          ask: "Does the customer have both Medicare and Medicaid, or receive Extra Help (LIS)?",
          allowed_actions: [
            "Switch PDP monthly",
            "Drop MA plus Rx and join stand alone PDP",
            "Join or switch integrated D SNP for full Medicaid only",
          ],
          window:
            "Once per calendar month. Effective 1st of the following month. Not available if beneficiary is flagged as at risk under Part D drug management program.",
        },
        {
          id: "lose_lis_next_year",
          ask: "Did the customer recently learn they will lose Extra Help next year?",
          allowed_actions: [
            "Join or switch MA or PDP",
            "Return to Original Medicare",
            "Drop PDP",
          ],
          window:
            "3 full months from date of loss or notice, whichever is later.",
        },
        {
          id: "five_star_available",
          ask: "Is there a 5 star rated MA, PDP, or Cost Plan available in the customer's area?",
          allowed_actions: ["Switch to 5 star plan one time use"],
          window:
            "Dec 8 through Nov 30 of the plan year. One use only per period.",
        },
        {
          id: "low_performing_plan",
          ask: "Has the customer's plan had a star rating below 3 stars for 3 consecutive years?",
          allowed_actions: ["Switch to any MA or PDP plan"],
          window: "Anytime while enrolled in the low performing plan.",
        },
        {
          id: "csnp_condition",
          ask: "Does the customer have a severe or disabling chronic condition and a Chronic Care SNP serves that condition in their area?",
          allowed_actions: [
            "Join a Chronic Care C SNP plan for their condition",
          ],
          window: "Anytime, but SEP ends once they enroll.",
        },
        {
          id: "misinformation_or_error",
          ask: "Did the customer enroll or fail to enroll in a plan due to misinformation or error by a federal employee or plan representative?",
          allowed_actions: [
            "Join or switch MA or PDP",
            "Return to Original Medicare",
            "Drop PDP",
          ],
          window:
            "2 full months after receiving written notice of the error from Medicare.",
        },
        {
          id: "exceptional_circumstances",
          ask: "If none apply, did the customer experience a significant life event such as natural disaster, major provider network change, or plan misrepresentation?",
          allowed_actions: [
            "Request an exception SEP via 1 800 MEDICARE (800 633 4227)",
          ],
          window: "Case by case. Window is typically 2 months.",
        },
      ],
    },
  ],
};

import { MA_SCRIPT_SECTIONS, MA_CSNP_DISCLOSURE, MA_DSNP_DISCLOSURE } from "../data/maScript2027.js";

const text = (value) => ({ type: "text", text: value });
const note = (value) => ({ type: "note", text: value });
const close = { type: "close", label: "Close call", outcome: "not_interested" };
const choice = (id, label, yes, no) => ({ type: "choice", id, label, options: [
  { value: "yes", label: "Yes", nodes: yes }, { value: "no", label: "No", nodes: no },
] });

function electionNodes(node) {
  const index = node.index || 0;
  if (index >= node.questions.length) return [text("I’m sorry but at this time it does not appear that you qualify for a special election period to enroll in a plan now. The Annual Enrollment Period is from October 15 through December 7 when you can change plans. Please feel free to contact us once the Annual Enrollment Period begins."), close];
  const next = [{ ...node, index: index + 1 }];
  return [text(node.questions[index]), choice(`applies${index}`, "Does this apply?", [
    note("Confirm the election period, relevant dates and enrollment window. Explain the applicable period to the caller."),
    choice(`confirmed${index}`, "Election period confirmed?", [text("Based on the information you’ve provided, it appears you do qualify for an election period to enroll now.")], next),
  ], next)];
}

function eligibilityNodes(state) {
  const prior = MA_SCRIPT_SECTIONS.slice(0, 6).flatMap((section) => getMAScriptView(section, state).items);
  const restrictions = new Set(prior.filter((node) => node.type === "restriction").map((node) => node.reason));
  const nodes = [];
  if (restrictions.has("poa")) nodes.push(
    note("A legal representative was unavailable earlier. Enrollment cannot proceed until they join and their authority, recording permission and TPMO disclosure are completed."),
    choice("poaPresent", "POA present, authority verified, recording consent and TPMO completed?", [], [close]),
  );
  if (restrictions.has("eligibility") || restrictions.has("pdpOnly")) nodes.push(
    note("Earlier discussion was informational or limited to Part D. Confirm eligibility for the selected plan before enrolling."),
    choice("eligibleNow", "Selected plan eligibility verified (A & B for MA / MAPD; A and/or B for PDP)?", [], [close]),
  );
  nodes.push({ type: "choice", id: "selectedSnp", label: "Selected plan type", options: [
    { value: "standard", label: "MA / MAPD / PDP", nodes: [] },
    { value: "csnp", label: "C-SNP", nodes: [text(MA_CSNP_DISCLOSURE)] },
    { value: "dsnp", label: "D-SNP", nodes: [text(MA_DSNP_DISCLOSURE)] },
  ] });
  return nodes;
}

/** The UI and completion gate share the same traversal, so hidden paths cannot unlock a card. */
export function getMAScriptView(section, state) {
  const answers = state.maAnswers || {};
  const items = [];
  function walk(nodes, parent) {
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const key = `${parent}/${index}${node.id ? `:${node.id}` : ""}`;
      if (node.type === "direction") {
        const mode = state.callDirection === "outbound" ? "outbound" : "inbound";
        if (!walk(node[mode], `${key}/${mode}`)) return false;
      } else if (node.type === "elections") {
        if (!walk(electionNodes(node), key)) return false;
      } else if (node.type === "enrollmentEligibility") {
        if (!walk(eligibilityNodes(state), key)) return false;
      } else {
        items.push({ ...node, key, selected: answers[key] });
        if (node.type === "close") return false;
        if (node.type === "choice") {
          const selected = node.options.find((item) => item.value === answers[key]);
          if (!selected || !walk(selected.nodes, `${key}/${selected.value}`)) return false;
        }
      }
    }
    return true;
  }
  const complete = walk(section.nodes || [], section.key);
  return { items, complete };
}

export function changeMAAnswer(state, sectionKey, key, value) {
  const section = MA_SCRIPT_SECTIONS.find((item) => item.key === sectionKey);
  if (!section) return state;
  const visible = getMAScriptView(section, state).items;
  const index = visible.findIndex((item) => item.key === key && item.type === "choice");
  if (index < 0 || !visible[index].options.some((item) => item.value === value)) return state;
  if (state.maAnswers?.[key] === value) return state;
  const keep = new Set(visible.slice(0, index).map((item) => item.key));
  const earlierSections = new Set(MA_SCRIPT_SECTIONS.filter((item) => item.section_number < section.section_number).map((item) => item.key));
  const maAnswers = Object.fromEntries(Object.entries(state.maAnswers || {}).filter(([answerKey]) => earlierSections.has(answerKey.split("/")[0]) || keep.has(answerKey)));
  maAnswers[key] = value;
  const next = { ...state, maAnswers, maClosed: false };
  const resetGates = new Set();
  for (const item of MA_SCRIPT_SECTIONS) {
    if (item.section_number >= section.section_number && item.gate_field) {
      next[item.gate_field] = false;
      resetGates.add(item.gate_field);
    }
  }
  next.undoHistory = state.undoHistory.filter((entry) => !resetGates.has(entry.field));
  next.sectionTimestamps = Object.fromEntries(Object.entries(state.sectionTimestamps).filter(([number]) => Number(number) <= section.section_number));
  if (next.sectionTimestamps[section.section_number]) next.sectionTimestamps[section.section_number] = { start: next.sectionTimestamps[section.section_number].start };
  // Keep the existing compliance / call summary fields in sync with the displayed paths.
  const allItems = MA_SCRIPT_SECTIONS.slice(0, 7).flatMap((item) => getMAScriptView(item, next).items);
  next.partBReduction = allItems.some((item) => item.id === "giveback" && item.selected === "yes");
  const selectedSnp = allItems.find((item) => item.id === "selectedSnp")?.selected;
  next.snpType = selectedSnp === "csnp" ? "CSNP" : selectedSnp === "dsnp" ? "DSNP" : null;
  next.snpOk = Boolean(next.snpType);
  return next;
}

const KNOWLEDGE_LABELS = {
  recording: "Recording Disclosure", tpmo: "TPMO Disclaimer", soa: "POA & Scope of Appointment",
  qualifications: "Qualifications", neads: "NEADS Assessment", sob: "Plan Selection & SOB",
  enrollment: "Enrollment", wrapup: "Wrap-Up",
};

export function getMASelectedScriptText(section, state) {
  return getMAScriptView(section, state).items.flatMap((item) => {
    if (item.type === "text") return [item.text];
    if (item.type === "note") return [`Instruction: ${item.text}`];
    if (item.type === "choice") return [`${item.label}: ${item.options.find((option) => option.value === item.selected)?.label || "Awaiting agent selection; do not assume an answer"}`];
    if (item.type === "close") return [`${item.label}. Use call closing; do not continue enrollment.`];
    return [];
  }).join("\n\n");
}

// Retire legacy script requirements for these MA sections, including database overrides.
// Optional-product knowledge outside this script remains owned by its existing source.
export function getMASelectedKnowledge(state) {
  const result = Object.fromEntries(MA_SCRIPT_SECTIONS.map((section) => {
    const { items } = getMAScriptView(section, state);
    return [KNOWLEDGE_LABELS[section.key], {
      verbatimScript: items.filter((item) => item.type === "text").map((item) => item.text),
      keyPhrasesToListenFor: [],
      requiredElements: [
        "Follow the September 28, 2026 SMS 2027 script and the selected call path. Do not require wording from an unselected path or an older script.",
        ...items.filter((item) => item.type === "note").map((item) => item.text),
      ],
      commonMistakes: ["Continuing without the response required by the current path", "Using superseded script wording"],
      redFlags: ["Continuing enrollment after the selected path requires call closing"],
    }];
  }));
  for (const [type, disclosure] of [["CSNP", MA_CSNP_DISCLOSURE], ["DSNP", MA_DSNP_DISCLOSURE]]) {
    result[`SNP Disclosure (${type})`] = {
      verbatimScript: [disclosure], keyPhrasesToListenFor: [],
      requiredElements: ["Read the applicable disclosure when discussing or selecting this SNP."],
      commonMistakes: [], redFlags: [],
    };
  }
  return result;
}

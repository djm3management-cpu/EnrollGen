import { redactSensitiveText } from "./redaction.js";

const TOPIC_KEYWORDS = {
  scope_of_appointment: ["soa", "scope of appointment", "permission to discuss"],
  plan_benefits: [
    "copay",
    "deductible",
    "benefit",
    "coverage",
    "allowance",
    "premium",
    "give back",
    "otc",
    "dental",
    "vision",
  ],
  eligibility_verification: [
    "part a",
    "part b",
    "medicaid",
    "lis",
    "red white blue",
    "mbi",
    "social security",
  ],
  enrollment_process: ["enroll", "application", "sunfire", "submit", "voice signature"],
  objection_handling: ["not sure", "can't afford", "think about it", "don't want", "no money"],
  prescription_review: ["medication", "prescription", "pharmacy", "drug", "tier"],
  provider_check: ["doctor", "specialist", "provider", "network", "dentist"],
  premium_cost: ["premium", "$0", "cost", "part b", "giveback", "zero cost"],
  compliance_disclosure: [
    "recorded",
    "cms",
    "disclaimer",
    "licensed",
    "not a government",
    "we do not offer every",
  ],
  closing: ["confirm", "recap", "successfully enrolled", "welcome package", "evidence of coverage"],
  consent_for_enrollment: ["permission", "agree", "consent", "state your name", "do you understand"],
  consumer_experience: [
    "how you feeling",
    "quality of life",
    "exercise",
    "diabetes",
    "smoke",
    "depression",
  ],
};

function splitSentences(text) {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  return normalized.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((s) => s.trim()).filter(Boolean) || [];
}

function wordsCount(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function takeLastWords(text, count) {
  const words = (text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= count) return words.join(" ");
  return words.slice(words.length - count).join(" ");
}

export function scrubPhi(rawText) {
  return redactSensitiveText(rawText || "");
}

export function chunkTranscriptByWords(text, chunkSize = 400, overlap = 50) {
  const sentences = splitSentences(text);
  if (!sentences.length) return [];

  const chunks = [];
  let currentSentences = [];
  let currentWordCount = 0;

  for (const sentence of sentences) {
    const sentenceWordCount = wordsCount(sentence);
    if (currentWordCount + sentenceWordCount > chunkSize && currentSentences.length > 0) {
      const chunkText = currentSentences.join(" ").trim();
      if (chunkText) chunks.push(chunkText);

      const overlapText = takeLastWords(chunkText, overlap);
      currentSentences = overlapText ? [overlapText, sentence] : [sentence];
      currentWordCount = wordsCount(currentSentences.join(" "));
      continue;
    }

    currentSentences.push(sentence);
    currentWordCount += sentenceWordCount;
  }

  const tail = currentSentences.join(" ").trim();
  if (tail) chunks.push(tail);

  return chunks;
}

export function detectTopics(chunkText) {
  const text = (chunkText || "").toLowerCase();
  const topics = [];

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(keyword.toLowerCase()))) {
      topics.push(topic);
    }
  }

  return topics;
}

export function detectSpeaker(chunkText) {
  const text = chunkText || "";
  const aCount = (text.match(/speaker\s*a/gi) || []).length;
  const bCount = (text.match(/speaker\s*b/gi) || []).length;

  if (aCount > bCount) return "agent";
  if (bCount > aCount) return "beneficiary";
  return null;
}

export function parseDurationToSeconds(value) {
  const raw = (value || "").trim();
  if (!raw) return null;
  const parts = raw.split(":").map((p) => p.trim());

  if (parts.length === 1 && /^\d+$/.test(parts[0])) {
    return Number(parts[0]) * 60;
  }

  if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    const minutes = Number(parts[0]);
    const seconds = Number(parts[1]);
    if (seconds >= 60) return null;
    return minutes * 60 + seconds;
  }

  return null;
}

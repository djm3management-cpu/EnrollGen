import { supabase } from "./supabase";
import { getQueryEmbedding } from "./embeddings";
import { redactSensitiveText } from "./redaction";

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

function normalizeName(value) {
  return (value || "").trim().replace(/\s+/g, " ");
}

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

async function findOrCreateAgent(agentName) {
  const normalized = normalizeName(agentName);
  if (!normalized) throw new Error("Agent name is required");

  const { data: agents, error: fetchError } = await supabase
    .from("agents")
    .select("id, name")
    .limit(500);

  if (fetchError) throw fetchError;

  const existing = (agents || []).find(
    (agent) => normalizeName(agent.name).toLowerCase() === normalized.toLowerCase()
  );
  if (existing) return existing.id;

  const { data: inserted, error: insertError } = await supabase
    .from("agents")
    .insert({ name: normalized, agency: "NGHS", is_active: true })
    .select("id")
    .single();

  if (insertError) throw insertError;
  return inserted.id;
}

async function insertTranscriptRecord(form, agentId, scrubbedText, durationSeconds) {
  const payload = {
    agent_id: agentId,
    call_date: form.callDate,
    duration_seconds: durationSeconds,
    direction: form.direction,
    product_line: form.productLine,
    carrier: form.carrier || null,
    plan_name: form.planName || null,
    enrollment_period: form.enrollmentPeriod,
    disposition: form.disposition,
    compliance_passed: form.compliancePassed,
    transcript_text: scrubbedText,
    source_system: form.sourceSystem,
    source_id: form.sourceId || null,
    phi_scrubbed: true,
  };

  const { data, error } = await supabase
    .from("call_transcripts")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function createChunkEmbeddings(chunks, onProgress, getToken) {
  const embeddings = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const embedding = await getQueryEmbedding(chunks[i], getToken);
    embeddings.push(embedding);
    if (onProgress) {
      onProgress({
        stage: "embedding",
        label: `Generating embeddings (${i + 1}/${chunks.length})`,
        percent: Math.round(((i + 1) / chunks.length) * 100),
      });
    }
  }
  return embeddings;
}

export async function ingestTranscript(form, onProgress, getToken) {
  if (onProgress) onProgress({ stage: "scrub", label: "Scrubbing PHI", percent: 5 });
  const scrubbedText = scrubPhi(form.transcriptText || "");

  if (onProgress) onProgress({ stage: "agent", label: "Resolving agent", percent: 15 });
  const agentId = await findOrCreateAgent(form.agentName);

  const durationSeconds = parseDurationToSeconds(form.duration);
  if (form.duration && durationSeconds === null) {
    throw new Error("Duration must be MM:SS or minutes only");
  }

  if (onProgress) onProgress({ stage: "transcript", label: "Creating transcript record", percent: 25 });
  const transcriptId = await insertTranscriptRecord(form, agentId, scrubbedText, durationSeconds);

  if (onProgress) onProgress({ stage: "chunk", label: "Chunking transcript", percent: 35 });
  const chunks = chunkTranscriptByWords(scrubbedText, 400, 50);
  if (!chunks.length) {
    throw new Error("Transcript text is empty after processing");
  }

  const chunkMeta = chunks.map((chunkText, index) => ({
    transcript_id: transcriptId,
    chunk_index: index,
    chunk_text: chunkText,
    speaker: detectSpeaker(chunkText),
    topics: detectTopics(chunkText),
  }));

  const embeddings = await createChunkEmbeddings(chunks, onProgress, getToken);

  if (onProgress) onProgress({ stage: "insert_chunks", label: "Inserting transcript chunks", percent: 95 });
  const rows = chunkMeta.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index],
  }));

  const { error: chunkInsertError } = await supabase
    .from("transcript_chunks")
    .insert(rows);

  if (chunkInsertError) throw chunkInsertError;

  const topicsDetected = Array.from(new Set(rows.flatMap((row) => row.topics || [])));

  if (onProgress) onProgress({ stage: "done", label: "Upload complete", percent: 100 });
  return {
    transcriptId,
    chunksCreated: rows.length,
    topicsDetected,
  };
}

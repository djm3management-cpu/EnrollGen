import { useMemo } from "react";

/**
 * useMergedTranscript, merges agent and customer transcripts into a single
 * chronological stream with speaker labels.
 *
 * Agent transcript comes from useSpeechRecognition (transcriptRows).
 * Customer transcript comes from useCustomerAudio (customerTranscript).
 *
 * Output:
 * - mergedTranscript: sorted array of { speaker, text, timestamp, isFinal }
 * - formattedTranscript: "AGENT: ...\nCUSTOMER: ..." string for prompt injection
 * - hasCustomerAudio: boolean indicating customer audio is active
 */

/**
 * Convert agent transcriptRows (from useSpeechRecognition) into the unified format.
 * Agent rows: { id, ts: "HH:MM:SS", text }
 * Unified: { speaker: 'agent', text, timestamp (number), isFinal: true }
 */
function normalizeAgentRows(transcriptRows) {
  return transcriptRows.map((row) => ({
    speaker: "agent",
    text: row.text,
    timestamp: row.id, // row.id is Date.now() at creation time
    isFinal: true,
  }));
}

export function useMergedTranscript({
  agentTranscriptRows = [],
  customerTranscript = [],
  isCustomerCapturing = false,
}) {
  const hasCustomerAudio = isCustomerCapturing || customerTranscript.length > 0;

  const mergedTranscript = useMemo(() => {
    const agentEntries = normalizeAgentRows(agentTranscriptRows);
    // Only include final customer entries in the merged view (interims are noisy)
    const customerFinals = customerTranscript.filter((e) => e.isFinal);
    const all = [...agentEntries, ...customerFinals];
    all.sort((a, b) => a.timestamp - b.timestamp);
    return all;
  }, [agentTranscriptRows, customerTranscript]);

  const formattedTranscript = useMemo(() => {
    if (!hasCustomerAudio) return "";
    return mergedTranscript
      .filter((e) => e.isFinal && e.text.trim())
      .map((e) => `${e.speaker === "agent" ? "AGENT" : "CUSTOMER"}: ${e.text}`)
      .join("\n");
  }, [mergedTranscript, hasCustomerAudio]);

  // Build a customer-only flat transcript for analysis functions
  const customerFlatTranscript = useMemo(() => {
    return customerTranscript
      .filter((e) => e.isFinal && e.text.trim())
      .map((e) => e.text)
      .join(" ");
  }, [customerTranscript]);

  // Recent customer speech (last ~500 chars) for the ask prompt context
  const recentCustomerSpeech = useMemo(() => {
    const finals = customerTranscript.filter((e) => e.isFinal && e.text.trim());
    let result = "";
    for (let i = finals.length - 1; i >= 0; i--) {
      const candidate = finals[i].text + " " + result;
      if (candidate.length > 500) break;
      result = candidate;
    }
    return result.trim();
  }, [customerTranscript]);

  return {
    mergedTranscript,
    formattedTranscript,
    customerFlatTranscript,
    recentCustomerSpeech,
    hasCustomerAudio,
  };
}

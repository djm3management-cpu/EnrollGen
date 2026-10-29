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
    segmentId: row.segmentId,
    speaker: "agent",
    text: row.text,
    timestamp: typeof row.timestamp === "number" ? row.timestamp : row.id,
    isFinal: true,
  }));
}

export function useMergedTranscript({
  agentTranscriptRows = [],
  agentInterim = null,
  customerTranscript = [],
  thirdPartyTranscript = [],
  isCustomerCapturing = false,
}) {
  const hasCustomerAudio = isCustomerCapturing || customerTranscript.length > 0;

  const mergedTranscript = useMemo(() => {
    const agentEntries = normalizeAgentRows(agentTranscriptRows);
    // Only include final customer entries in the merged view (interims are noisy)
    const customerFinals = customerTranscript.filter((e) => e.isFinal);
    const all = [...agentEntries, ...customerFinals, ...thirdPartyTranscript.filter(e => e.isFinal)];
    all.sort((a, b) => a.timestamp - b.timestamp);
    return all;
  }, [agentTranscriptRows, customerTranscript, thirdPartyTranscript]);

  // The live widget includes speech still being recognized. Saved evidence and
  // copilot context continue to use the finalized mergedTranscript above.
  const liveTranscript = useMemo(() => {
    const interims = customerTranscript.filter(e => !e.isFinal && e.text?.trim());
    interims.push(...thirdPartyTranscript.filter(e => !e.isFinal && e.text?.trim()));
    if (agentInterim?.text?.trim()) interims.push(agentInterim);
    if (!interims.length) return mergedTranscript;
    return [...mergedTranscript, ...interims].sort((a, b) => a.timestamp - b.timestamp);
  }, [mergedTranscript, customerTranscript, thirdPartyTranscript, agentInterim]);

  const formattedTranscript = useMemo(() => {
    if (!hasCustomerAudio) return "";
    return mergedTranscript
      .filter((e) => e.isFinal && e.text.trim())
      .map((e) => `${e.speaker === 'third_party' ? 'THIRD PARTY' : e.speaker === "agent" ? "AGENT" : "CUSTOMER"}: ${e.text}`)
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
    liveTranscript,
    formattedTranscript,
    customerFlatTranscript,
    recentCustomerSpeech,
    hasCustomerAudio,
  };
}

import {
  scoreCompliance,
  scoreTwoSided,
} from "../context/ComplianceScorer";
import { analyzeTranscript } from "../context/TranscriptAnalyzer";

let cachedTranscript = null;
let cachedAnalysis = null;

function getCachedAnalysis(transcript) {
  if (!transcript) return null;
  if (transcript === cachedTranscript) return cachedAnalysis;
  cachedTranscript = transcript;
  cachedAnalysis = analyzeTranscript(transcript);
  return cachedAnalysis;
}

self.onmessage = ({ data }) => {
  const {
    id,
    scriptState,
    copilotEntries,
    transcript,
    customerTranscript,
    mergedTranscript,
    options,
  } = data;

  try {
    const scoringOptions = {
      ...options,
      precomputedAnalysis: getCachedAnalysis(transcript),
    };
    const result = customerTranscript
      ? scoreTwoSided(
          scriptState,
          copilotEntries,
          transcript,
          customerTranscript,
          mergedTranscript,
          scoringOptions
        )
      : scoreCompliance(
          scriptState,
          copilotEntries,
          transcript,
          scoringOptions
        );
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({
      id,
      error: error?.message || "Compliance scoring failed.",
    });
  }
};

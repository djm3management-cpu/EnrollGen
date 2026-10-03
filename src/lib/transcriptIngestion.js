import { evidenceRequest } from "./evidenceApi.js";
export { scrubPhi, chunkTranscriptByWords, detectTopics, detectSpeaker, parseDurationToSeconds } from "./transcriptProcessing.js";

export async function ingestTranscript(form, onProgress, getToken) {
  onProgress?.({ stage: "processing", label: "Processing transcript", percent: 10 });
  const result = await evidenceRequest(getToken, "transcript-import", form);
  onProgress?.({ stage: "done", label: "Upload complete", percent: 100 });
  return result;
}

import { useEffect, useRef, useState } from "react";

const EMPTY_RESULT = {
  score: 0,
  grade: "N/A",
  categories: [],
  categoriesPassed: 0,
  totalCategories: 0,
  totalPassed: 0,
  totalQuestions: 0,
  flags: [],
  transcriptStats: {
    intentsDetected: 0,
    intentsTotal: 0,
    coverage: 0,
    violations: [],
    sectionConfidence: {},
  },
  scoringMode: "inactive",
};

export function useComplianceScoringWorker({
  scriptState,
  copilotEntries,
  transcript,
  customerTranscript,
  mergedTranscript,
  options,
}) {
  const workerRef = useRef(null);
  const latestRequestRef = useRef(0);
  const [result, setResult] = useState(EMPTY_RESULT);

  useEffect(() => {
    if (typeof Worker === "undefined") return undefined;
    const worker = new Worker(
      new URL("../workers/compliance.worker.js", import.meta.url),
      { type: "module" }
    );
    worker.onmessage = ({ data }) => {
      if (data.id === latestRequestRef.current && data.result) {
        setResult(data.result);
      }
    };
    workerRef.current = worker;
    return () => {
      workerRef.current = null;
      worker.terminate();
    };
  }, []);

  useEffect(() => {
    const id = latestRequestRef.current + 1;
    latestRequestRef.current = id;
    const payload = {
      id,
      scriptState,
      copilotEntries,
      transcript,
      customerTranscript,
      mergedTranscript,
      options,
    };

    if (workerRef.current) {
      workerRef.current.postMessage(payload);
      return;
    }

    let cancelled = false;
    void import("../context/ComplianceScorer").then(
      ({ scoreCompliance, scoreTwoSided }) => {
        if (cancelled || id !== latestRequestRef.current) return;
        const next = customerTranscript
          ? scoreTwoSided(
              scriptState,
              copilotEntries,
              transcript,
              customerTranscript,
              mergedTranscript,
              options
            )
          : scoreCompliance(scriptState, copilotEntries, transcript, options);
        setResult(next);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [
    copilotEntries,
    customerTranscript,
    mergedTranscript,
    options,
    scriptState,
    transcript,
  ]);

  return result;
}

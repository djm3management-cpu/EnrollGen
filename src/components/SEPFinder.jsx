import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useScript } from "../context/ScriptContext";
import SEPResultsPanel, {
  normalizeSepZip,
  parseSepRpcResult,
} from "./SEPResultsPanel";

export default function SEPFinder({ zip }) {
  const { dispatch } = useScript();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const normalizedZip = normalizeSepZip(zip);
  const lookedUpZip = result?.zip || null;

  const runLookup = useCallback(async () => {
    if (normalizedZip.length !== 5) {
      setError("Enter a valid 5-digit ZIP.");
      setResult(null);
      dispatch({ type: "SET_SEP_FINDER_RESULTS", value: null });
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data, error: rpcError } = await supabase.rpc("get_available_seps", {
        input_zip: normalizedZip,
      });
      if (rpcError) throw rpcError;

      const parsed = parseSepRpcResult(data);
      if (!parsed) throw new Error("SEP lookup returned an unreadable response.");

      if (parsed.error) {
        setError("ZIP code not found. Please verify and try again.");
        setResult(null);
        dispatch({ type: "SET_SEP_FINDER_RESULTS", value: null });
        return;
      }

      setResult(parsed);
      dispatch({ type: "SET_SEP_FINDER_RESULTS", value: parsed });
    } catch (lookupError) {
      setError(lookupError?.message || "SEP lookup failed. Please try again.");
      setResult(null);
      dispatch({ type: "SET_SEP_FINDER_RESULTS", value: null });
    } finally {
      setLoading(false);
    }
  }, [dispatch, normalizedZip]);

  useEffect(() => {
    if (normalizedZip.length !== 5) return;
    if (loading) return;
    if (lookedUpZip === normalizedZip) return;
    runLookup();
  }, [normalizedZip, loading, lookedUpZip, runLookup]);

  return (
    <SEPResultsPanel
      zip={normalizedZip}
      result={result}
      loading={loading}
      error={error}
      onRefresh={runLookup}
    />
  );
}

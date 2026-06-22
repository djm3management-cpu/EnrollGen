import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCcw, Search } from "lucide-react";
import { useScript } from "../context/ScriptContext";
import { normalizeSepZip, parseSepRpcResult } from "./SEPResultsPanel";
import SEPResultsModal from "./SEPResultsModal";

export default function SEPFinder({ zip }) {
  const { dispatch } = useScript();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [showSepModal, setShowSepModal] = useState(false);
  const wasLoadingRef = useRef(false);

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
      const { supabase } = await import("../lib/supabase");
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

  useEffect(() => {
    if (wasLoadingRef.current && !loading && result && !error) {
      setShowSepModal(true);
    }
    wasLoadingRef.current = loading;
  }, [loading, result, error]);

  const hasZip = normalizedZip.length === 5;
  const hasResult = Boolean(result);

  return (
    <div className="sep-finder-trigger">
      {!hasZip && !loading && !hasResult && !error ? (
        <div className="sep-finder-trigger-empty">
          Enter a 5-digit ZIP above to scan for area-based SEPs.
        </div>
      ) : null}

      {loading ? (
        <div className="sep-finder-trigger-status">
          <Loader2 size={14} className="sep-finder-spinner" />
          <span>Checking available SEPs for ZIP {normalizedZip}...</span>
        </div>
      ) : null}

      {!loading && error ? (
        <div className="sep-finder-trigger-error">{error}</div>
      ) : null}

      {!loading && hasResult ? (
        <div className="sep-finder-trigger-actions">
          <button
            type="button"
            className="sep-finder-trigger-btn"
            onClick={() => setShowSepModal(true)}
          >
            <Search size={13} />
            Show Available SEPs
            <span className="sep-finder-trigger-zip">ZIP {result?.zip || normalizedZip}</span>
          </button>
          <button
            type="button"
            className="sep-finder-trigger-refresh"
            onClick={runLookup}
            disabled={loading || !hasZip}
            aria-label="Refresh SEP lookup"
          >
            <RefreshCcw size={11} />
          </button>
        </div>
      ) : null}

      <SEPResultsModal
        isOpen={showSepModal}
        onClose={() => setShowSepModal(false)}
        zip={normalizedZip}
        result={result}
        loading={loading}
        error={error}
        onRefresh={runLookup}
        refreshDisabled={!hasZip}
      />
    </div>
  );
}

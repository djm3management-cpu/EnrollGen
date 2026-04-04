/**
 * useCalibration — React hook for calibration dashboard state and API calls.
 */

import { useState, useCallback, useEffect } from 'react';
import { useAppAuth } from '../../context/AuthContext';
import { fetchWithClerk } from '../../lib/clerkFetch.js';

const API = '/.netlify/functions/compliance';

export function useCalibration(runId) {
  const { getToken } = useAppAuth();
  const [run, setRun] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [scoringProgress, setScoringProgress] = useState(null);

  const fetchReport = useCallback(async () => {
    if (!runId) return;
    setLoading(true);
    try {
      const res = await fetchWithClerk(getToken, `${API}/calibration/${runId}`);
      const data = await res.json();
      setRun(data);
      setReport(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [runId, getToken]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const startCalibration = useCallback(async (callIds, runName) => {
    setLoading(true);
    try {
      const res = await fetchWithClerk(getToken, `${API}/calibration/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_name: runName, call_ids: callIds }),
      });
      const data = await res.json();
      setRun(data);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const submitOverride = useCallback(async (override) => {
    if (!runId) return null;
    try {
      const res = await fetchWithClerk(getToken, `${API}/calibration/${runId}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(override),
      });
      const data = await res.json();
      await fetchReport();
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [runId, getToken, fetchReport]);

  return {
    run,
    report,
    loading,
    error,
    scoringProgress,
    startCalibration,
    submitOverride,
    refresh: fetchReport,
  };
}

export function useScorecard(scorecardId) {
  const { getToken } = useAppAuth();
  const [scorecard, setScorecard] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!scorecardId) return;
    setLoading(true);
    fetchWithClerk(getToken, `${API}/scorecards/${scorecardId}`)
      .then(res => res.json())
      .then(data => { setScorecard(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [scorecardId, getToken]);

  return { scorecard, loading };
}

export function useDashboard(days = 30) {
  const { getToken } = useAppAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithClerk(getToken, `${API}/dashboard/overview?days=${days}`);
      setData(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, [days, getToken]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, refresh };
}

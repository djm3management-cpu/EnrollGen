import { useCallback, useState } from 'react';
import { exchangeRequest } from './exchangeApi.js';

/** Runs one write and keeps a short inline result line; a failure shows the server error. */
export function useExchangeWrite(getToken) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const write = useCallback(async (fn, action, params, done) => {
    setBusy(true); setResult(null);
    try {
      const body = await exchangeRequest(getToken, fn, action, params, true);
      setResult({ ok: true, text: done });
      return body;
    } catch (error) {
      setResult({ ok: false, text: error.message || 'Request failed' });
      return null;
    } finally { setBusy(false); }
  }, [getToken]);
  return { busy, result, write, setResult };
}

/** Loads one read; `deps` reloads it. */
export function useExchangeRead(getToken) {
  const [error, setError] = useState('');
  const read = useCallback(async (fn, action, params) => {
    setError('');
    try { return await exchangeRequest(getToken, fn, action, params, false); }
    catch (failure) { setError(failure.message || 'Request failed'); return null; }
  }, [getToken]);
  return { read, error };
}

export const resultLine = result => (result
  ? <div className={`exchange-result${result.ok ? '' : ' is-error'}`} role="status">{result.text}</div> : null);

export const errorLine = text => (text ? <div className="exchange-result is-error" role="alert">{text}</div> : null);

export const emptyLine = text => <div className="exchange-empty">{text}</div>;

const TONES = { Active: 'ok', Approved: 'ok', Live: 'ok', Open: 'warn', Paused: 'warn', Draft: 'info', Sandbox: 'info',
  Inactive: 'muted', Retired: 'muted', Revoked: 'muted', Acknowledged: 'muted' };
export const badge = text => <span className={`exchange-badge is-${TONES[text] || 'muted'}`}>{text}</span>;

/**
 * The one time plaintext reveal. Rendered only while `reveal` is set; the
 * parent clears it on dismiss and nothing else keeps the value.
 */
export function keyReveal(reveal, onDismiss) {
  if (!reveal?.value) return null;
  const copy = () => { void globalThis.navigator?.clipboard?.writeText(reveal.value).catch(() => {}); };
  return <div className="exchange-reveal" role="alert">
    <span className="exchange-label">{reveal.label}</span>
    <input readOnly aria-label={reveal.label} value={reveal.value} onFocus={event => event.target.select()} />
    <button type="button" data-key-role="primary" className="eg-key eg-key--primary" onClick={copy}>Copy</button>
    <button type="button" data-key-role="secondary" className="eg-key" onClick={onDismiss}>Done</button>
  </div>;
}

/** A small two series trend line in the app's inline SVG chart style. */
export function trendLine(points, series) {
  if (!points || points.length < 2) return null;
  const width = 320; const height = 64; const max = Math.max(1, ...points.flatMap(p => series.map(s => Number(p[s.key]) || 0)));
  const line = key => points.map((p, i) => `${(i / (points.length - 1)) * width},${height - ((Number(p[key]) || 0) / max) * (height - 4) - 2}`).join(' ');
  return <div className="exchange-trend">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend" preserveAspectRatio="none">
      {series.map((s, i) => <polyline key={s.key} className={`exchange-trend__line is-${i + 1}`} points={line(s.key)} />)}
    </svg>
    <div className="exchange-trend__legend">{series.map((s, i) => <span key={s.key} className={`exchange-trend__key is-${i + 1}`}>{s.label}</span>)}</div>
  </div>;
}

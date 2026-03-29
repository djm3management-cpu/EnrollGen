/**
 * BatchImport — Google Drive folder import wizard for calibration.
 * Lists files from a GDrive folder, creates call records, transcribes via Deepgram,
 * scores via Claude Sonnet, and tracks progress.
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { fetchWithClerk } from '../../lib/clerkFetch.js';

const API_GDRIVE = '/.netlify/functions/gdrive';
const API_TRANSCRIBE = '/.netlify/functions/transcribe';
const API_COMPLIANCE = '/.netlify/functions/compliance';

const STATUS = {
  IDLE: 'idle',
  LISTING: 'listing',
  READY: 'ready',
  PROCESSING: 'processing',
  DONE: 'done',
  ERROR: 'error',
};

const STEP = {
  PENDING: 'pending',
  TRANSCRIBING: 'transcribing',
  SCORING: 'scoring',
  DONE: 'done',
  ERROR: 'error',
};

function parseFilenameMetadata(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  const parts = base.split(/[_\-\s]+/);
  let agent_name = 'Unknown Agent';
  let carrier = null;
  let date = null;

  if (parts.length >= 1) {
    agent_name = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }
  if (parts.length >= 2) {
    const maybeDateOrCarrier = parts[1];
    if (/^\d{6,8}$/.test(maybeDateOrCarrier)) {
      date = maybeDateOrCarrier;
    } else {
      carrier = maybeDateOrCarrier.charAt(0).toUpperCase() + maybeDateOrCarrier.slice(1);
    }
  }
  if (parts.length >= 3 && !carrier) {
    carrier = parts[2].charAt(0).toUpperCase() + parts[2].slice(1);
  }
  if (parts.length >= 3 && !date) {
    const maybeDate = parts.find(p => /^\d{6,8}$/.test(p));
    if (maybeDate) date = maybeDate;
  }

  return { agent_name, carrier, date };
}

const BatchImport = memo(function BatchImport({ onComplete }) {
  const { getToken } = useAuth();
  const [status, setStatus] = useState(STATUS.IDLE);
  const [folderUrl, setFolderUrl] = useState('https://drive.google.com/drive/folders/1X2leRVJTClHt39TJ_SKt2m6n-nF9I9lT');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState([]);
  const [calibrationRunId, setCalibrationRunId] = useState(null);
  const abortRef = useRef(false);

  const listFiles = useCallback(async () => {
    setStatus(STATUS.LISTING);
    setError(null);
    try {
      const res = await fetchWithClerk(getToken, `${API_GDRIVE}?folder=${encodeURIComponent(folderUrl)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.detail || 'Failed to list folder');
      setFiles(data.files || []);
      setStatus(STATUS.READY);
    } catch (err) {
      setError(err.message);
      setStatus(STATUS.ERROR);
    }
  }, [folderUrl, getToken]);

  const startProcessing = useCallback(async () => {
    abortRef.current = false;
    setStatus(STATUS.PROCESSING);
    setError(null);

    const items = files.map(f => ({
      file: f,
      step: STEP.PENDING,
      callId: null,
      scorecardId: null,
      score: null,
      grade: null,
      error: null,
    }));
    setProcessing([...items]);

    // Create calibration run
    let runId;
    try {
      const runRes = await fetchWithClerk(getToken, `${API_COMPLIANCE}/calibration/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_name: `Google Drive Import ${new Date().toISOString().slice(0, 10)}`, call_ids: [] }),
      });
      const runData = await runRes.json();
      runId = runData.run_id;
      setCalibrationRunId(runId);
    } catch (err) {
      setError(`Failed to create calibration run: ${err.message}`);
      setStatus(STATUS.ERROR);
      return;
    }

    // Process each file sequentially
    for (let i = 0; i < items.length; i++) {
      if (abortRef.current) break;

      const item = items[i];
      const meta = parseFilenameMetadata(item.file.name);

      // Step 1: Create call record
      try {
        item.step = STEP.TRANSCRIBING;
        setProcessing([...items]);

        const callRes = await fetchWithClerk(getToken, `${API_COMPLIANCE}/calls`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_id: crypto.randomUUID(),
            agent_name: meta.agent_name,
            call_direction: 'outbound',
            call_type: 'enrollment',
            product_type: 'MA',
            carrier_name: meta.carrier,
            call_start: meta.date ? new Date(meta.date).toISOString() : new Date().toISOString(),
            recording_url: item.file.downloadUrl,
            metadata: {
              calibration_run_id: runId,
              source_filename: item.file.name,
              gdrive_file_id: item.file.id,
            },
          }),
        });
        const callData = await callRes.json();
        if (!callRes.ok) throw new Error(callData.error || 'Failed to create call record');
        item.callId = callData.id;
      } catch (err) {
        item.step = STEP.ERROR;
        item.error = `Record: ${err.message}`;
        setProcessing([...items]);
        continue;
      }

      // Step 2: Transcribe via Deepgram
      try {
        const txRes = await fetchWithClerk(getToken, API_TRANSCRIBE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: item.file.downloadUrl, callId: item.callId }),
        });
        const txData = await txRes.json();
        if (!txRes.ok) throw new Error(txData.error || txData.detail || 'Transcription failed');
      } catch (err) {
        item.step = STEP.ERROR;
        item.error = `Transcribe: ${err.message}`;
        setProcessing([...items]);
        continue;
      }

      // Step 3: Score via compliance engine
      try {
        item.step = STEP.SCORING;
        setProcessing([...items]);

        const scoreRes = await fetchWithClerk(getToken, `${API_COMPLIANCE}/calls/${item.callId}/score`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const scoreData = await scoreRes.json();
        if (!scoreRes.ok) throw new Error(scoreData.error || 'Scoring failed');

        item.scorecardId = scoreData.scorecard?.id;
        item.score = scoreData.scorecard?.overall_score;
        item.grade = scoreData.scorecard?.overall_grade;
        item.step = STEP.DONE;
      } catch (err) {
        item.step = STEP.ERROR;
        item.error = `Score: ${err.message}`;
      }

      setProcessing([...items]);
    }

    setStatus(STATUS.DONE);
    if (onComplete) onComplete(runId);
  }, [files, getToken, onComplete]);

  const stopProcessing = () => { abortRef.current = true; };

  const doneCount = processing.filter(p => p.step === STEP.DONE).length;
  const errorCount = processing.filter(p => p.step === STEP.ERROR).length;
  const currentIdx = processing.findIndex(p => p.step === STEP.TRANSCRIBING || p.step === STEP.SCORING);
  const progressPct = processing.length > 0 ? Math.round(((doneCount + errorCount) / processing.length) * 100) : 0;

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', padding: '20px 24px', boxShadow: 'var(--shadow-float)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: status === STATUS.PROCESSING ? '#FFD700' : status === STATUS.DONE ? '#00D166' : '#E8002D', boxShadow: `0 0 6px ${status === STATUS.PROCESSING ? 'rgba(255,215,0,0.5)' : status === STATUS.DONE ? 'rgba(0,209,102,0.5)' : 'rgba(232,0,45,0.4)'}` }} />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-primary)' }}>
          Batch Import — Google Drive
        </span>
      </div>

      {/* Folder URL Input */}
      {(status === STATUS.IDLE || status === STATUS.ERROR || status === STATUS.READY) && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <input
            value={folderUrl}
            onChange={e => setFolderUrl(e.target.value)}
            placeholder="Google Drive folder URL or ID"
            style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.85rem', fontFamily: 'var(--font-body)', outline: 'none' }}
          />
          <button onClick={listFiles} disabled={status === STATUS.LISTING} style={btnStyle('#E8002D')}>
            {status === STATUS.LISTING ? 'Listing...' : 'List Files'}
          </button>
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(255,68,85,0.08)', border: '1px solid rgba(255,68,85,0.2)', borderRadius: 8, color: '#FF4455', fontSize: '0.82rem', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* File List */}
      {status === STATUS.READY && files.length > 0 && (
        <>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
            Found <span style={{ color: '#E8002D', fontWeight: 700 }}>{files.length}</span> audio files
          </div>
          <div style={{ maxHeight: 240, overflow: 'auto', marginBottom: 16, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 8 }}>
            {files.map((f, i) => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: '0.8rem', background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '0.7rem', minWidth: 24 }}>{i + 1}</span>
                <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{f.name}</span>
                {f.size && <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '0.7rem' }}>{(f.size / 1048576).toFixed(1)}MB</span>}
              </div>
            ))}
          </div>
          <button onClick={startProcessing} style={btnStyle('#00D166')}>
            Start Calibration ({files.length} files)
          </button>
        </>
      )}

      {/* Processing Progress */}
      {(status === STATUS.PROCESSING || status === STATUS.DONE) && processing.length > 0 && (
        <>
          {/* Progress Bar */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
              <span>{status === STATUS.PROCESSING ? `Processing ${currentIdx + 1} of ${processing.length}...` : 'Complete'}</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{progressPct}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
              <div style={{ height: '100%', borderRadius: 3, width: `${progressPct}%`, background: status === STATUS.DONE ? '#00D166' : '#E8002D', transition: 'width 0.5s ease', boxShadow: status === STATUS.DONE ? '0 0 8px rgba(0,209,102,0.4)' : '0 0 8px rgba(232,0,45,0.3)' }} />
            </div>
          </div>

          {/* Stats Row */}
          <div style={{ display: 'flex', gap: 20, marginBottom: 16, fontSize: '0.8rem' }}>
            <span style={{ color: '#00D166' }}>Done: {doneCount}</span>
            <span style={{ color: '#FF4455' }}>Errors: {errorCount}</span>
            <span style={{ color: 'var(--text-muted)' }}>Remaining: {processing.length - doneCount - errorCount}</span>
          </div>

          {/* Per-file Status */}
          <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid rgba(255,255,255,0.04)', borderRadius: 8 }}>
            {processing.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: '0.78rem', background: i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent', borderLeft: `3px solid ${item.step === STEP.DONE ? '#00D166' : item.step === STEP.ERROR ? '#FF4455' : item.step === STEP.PENDING ? '#333' : '#FFD700'}` }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '0.7rem', minWidth: 24 }}>{i + 1}</span>
                <span style={{ flex: 1, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.file.name}</span>
                {item.step === STEP.TRANSCRIBING && <StepBadge label="Transcribing" color="#FFD700" pulse />}
                {item.step === STEP.SCORING && <StepBadge label="Scoring" color="#a855f7" pulse />}
                {item.step === STEP.DONE && (
                  <>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: item.score >= 85 ? '#00D166' : item.score >= 70 ? '#FFD700' : '#FF4455' }}>
                      {item.score?.toFixed(1)}%
                    </span>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: item.score >= 85 ? '#00D166' : item.score >= 70 ? '#FFD700' : '#FF4455', fontSize: '0.85rem' }}>
                      {item.grade}
                    </span>
                  </>
                )}
                {item.step === STEP.ERROR && <span style={{ color: '#FF4455', fontSize: '0.72rem' }}>{item.error}</span>}
                {item.step === STEP.PENDING && <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Waiting</span>}
              </div>
            ))}
          </div>

          {status === STATUS.PROCESSING && (
            <button onClick={stopProcessing} style={{ ...btnStyle('#FF4455'), marginTop: 14 }}>
              Stop Processing
            </button>
          )}
        </>
      )}
    </div>
  );
});

function StepBadge({ label, color, pulse }) {
  return (
    <span style={{
      fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: 4,
      background: `${color}18`, color, border: `1px solid ${color}33`,
      animation: pulse ? 'batchPulse 1.5s ease-in-out infinite' : 'none',
    }}>
      {label}
    </span>
  );
}

function btnStyle(color) {
  return {
    padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: '0.82rem',
    cursor: 'pointer', background: `${color}15`, border: `1px solid ${color}40`,
    color, fontFamily: 'var(--font-body)', transition: 'all 0.15s ease',
  };
}

export default BatchImport;

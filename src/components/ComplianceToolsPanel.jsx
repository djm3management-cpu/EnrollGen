import { Suspense } from 'react';
import { lazyWithRetry } from '../lib/lazyWithRetry.js';

const ComplianceIntentAccordion = lazyWithRetry(() => import('./ComplianceIntentAccordion'));
const CallHistory = lazyWithRetry(() => import('./CallHistory'));
const TranscriptUpload = lazyWithRetry(() => import('./TranscriptUpload'));

export default function ComplianceToolsPanel({ mode = 'ma' }) {
  return <Suspense fallback={<div className="contacts-muted">Loading compliance...</div>}>
    {mode === 'ma' ? <div className="compliance-hub-stack"><ComplianceIntentAccordion /></div> : (
      <div className="top-panel-stack">
        <CallHistory />
        {mode === 'medsup' ? <TranscriptUpload /> : null}
      </div>
    )}
  </Suspense>;
}

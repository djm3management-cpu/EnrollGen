import { lazy, Suspense } from 'react';

const ComplianceIntentAccordion = lazy(() => import('./ComplianceIntentAccordion'));
const CallHistory = lazy(() => import('./CallHistory'));
const TranscriptUpload = lazy(() => import('./TranscriptUpload'));

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

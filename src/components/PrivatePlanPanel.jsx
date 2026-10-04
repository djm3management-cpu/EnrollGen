import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { PRIVATE_PLAN_PLAYBOOK_URL } from '../data/privatePlans';
import U65ProductGuidance from './U65ProductGuidance';
import PlaybookModal from './PlaybookModal';
import UnderwritingChecker from './UnderwritingChecker';

export default function PrivatePlanPanel({ highlightUnderwriting = false, onAcknowledgeUnderwritingHighlight }) {
  const [modalOpen, setModalOpen] = useState(false);
  return <section className="private-plan-panel">
    <U65ProductGuidance />
    <UnderwritingChecker highlighted={highlightUnderwriting} onAcknowledgeHighlight={onAcknowledgeUnderwritingHighlight} />
    <button type="button" className="private-plan-open-btn private-plan-open-btn--bottom" onClick={() => setModalOpen(true)}>
      <ExternalLink size={13} />Open Full Playbook
    </button>
    <PlaybookModal open={modalOpen} src={PRIVATE_PLAN_PLAYBOOK_URL} onClose={() => setModalOpen(false)} />
  </section>;
}

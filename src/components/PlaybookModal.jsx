import { X } from "lucide-react";

export default function PlaybookModal({ open, src, onClose }) {
  if (!open) return null;

  return (
    <div className="playbook-modal" role="dialog" aria-modal="true" aria-label="Private Plan Playbook">
      <div className="playbook-modal__bar">
        <div>
          <div className="playbook-modal__kicker">O'Neill Marketing</div>
          <div className="playbook-modal__title">Private Plan Playbook</div>
        </div>
        <button
          type="button"
          className="playbook-modal__close"
          onClick={onClose}
          aria-label="Close Private Plan Playbook"
        >
          <X size={18} />
        </button>
      </div>
      <iframe
        className="playbook-modal__frame"
        src={src}
        title="Private Plan Playbook"
      />
    </div>
  );
}

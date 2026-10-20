import { useEffect, useRef, useState } from 'react';
import { useClerk } from '@clerk/clerk-react';
import { useAppAuth } from '../context/AuthContext';
import { callContinuity } from '../lib/callContinuity.js';

export default function ProfileMenu() {
  const { user, identityLoaded, callProtected } = useAppAuth();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = event => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  if (!identityLoaded || !user) return null;
  const displayName = user.publicMetadata?.agentName || user.fullName || user.firstName || 'Agent';

  return (
    <div ref={rootRef} className={`top-bar-profile${open ? ' is-open' : ''}`}>
      <button ref={triggerRef} type="button" className="top-bar-profile-trigger"
        aria-label={`Account menu for ${displayName}`} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(value => !value)}>
        <img src={user.imageUrl} alt="" className="top-bar-profile-avatar" />
        <span className="top-bar-profile-name">{displayName}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="top-bar-profile-menu" role="menu" aria-label="Account">
          <button type="button" role="menuitem" className="top-bar-profile-signout"
            disabled={callProtected} title={callProtected ? 'Finish the call before signing out' : undefined}
            onClick={() => {
              if (callProtected || callContinuity.getSnapshot()) return;
              setOpen(false);
              void signOut();
            }}>Sign Out</button>
        </div>
      )}
    </div>
  );
}

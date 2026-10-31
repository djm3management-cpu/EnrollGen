import AppToast from './AppToast';
import { useSyncExternalStore } from 'react';
import { preloadRecovery } from '../lib/preloadRecovery.js';

export default function PreloadRecoveryNotice({ callInProgress, onReload }) {
  const failed = useSyncExternalStore(preloadRecovery.subscribe, preloadRecovery.getSnapshot, preloadRecovery.getSnapshot);
  if (!failed) return null;
  return (
    <AppToast tone="error" onDismiss={preloadRecovery.dismiss}>
      <span>{callInProgress
        ? "Some tools couldn't load. You can keep working and reload after your call."
        : "Some tools couldn't load. Reload when you're ready to try again."}</span>
      <div className="preload-recovery-notice__actions">
        <button data-key-role="secondary" type="button" className="secondary" onClick={onReload} disabled={callInProgress}
          title={callInProgress ? 'Finish your call before reloading' : 'Reload to try again'}>Reload</button>
        <button data-key-role="secondary" type="button" className="secondary" onClick={preloadRecovery.dismiss}>Dismiss</button>
      </div>
    </AppToast>
  );
}

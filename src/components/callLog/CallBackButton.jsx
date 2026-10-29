import { useRef, useState, useSyncExternalStore } from 'react';
import { Phone } from 'lucide-react';
import { useInboundCall } from '../../context/InboundCallContext';
import { useAvailability } from '../../context/AvailabilityContext';
import { callContinuity } from '../../lib/callContinuity.js';
import { normalizePhoneE164 } from '../../lib/phone';
import DncCallControl from '../phone/DncCallControl';

export default function CallBackButton({ row }) {
  const phone = useInboundCall();
  const availability = useAvailability();
  const [error, setError] = useState('');
  const callProtected = useSyncExternalStore(callContinuity.subscribe, callContinuity.getSnapshot, () => false);
  const latest = useRef(null);
  latest.current = { phone, availability, callProtected };
  // Do not strip letters/URI syntax into an otherwise valid-looking number.
  const normalized = /^\+?[\d\s().-]+$/.test(row.contact_phone || '')
    ? normalizePhoneE164(row.contact_phone) : null;
  const number = normalized && /^\+[1-9]\d{7,14}$/.test(normalized)
    && (!normalized.startsWith('+1') || /^\+1[2-9]\d{2}[2-9]\d{6}$/.test(normalized)) ? normalized : null;
  const disabledReason = () => {
    const { phone, availability, callProtected } = latest.current;
    if (!number) return 'No valid callable number';
    if (phone?.activeCall || phone?.dialingCall || phone?.incomingCall || callProtected || phone?.hasCallInProgress?.()) return 'Finish the current call before dialing';
    if (availability?.activeCallSid) return 'Agent is reserved for another call';
    if (!availability?.isHydrated) return 'Checking agent availability';
    if (!phone?.enabled || phone.deviceStatus !== 'registered') return 'Softphone not registered yet';
    if (!availability.phoneReady) return 'Waiting for phone connection';
    return '';
  };
  const reason = disabledReason();

  return <span className="call-log-callback" title={reason || 'Call back'} onClick={event => event.stopPropagation()}>
    <DncCallControl phone={number} doNotCall={row.do_not_call} iconOnly
      type="button" className="contacts-mini-btn call-back-icon"
      aria-label="Call back" title={reason || 'Call back'} disabled={Boolean(reason)}
      onClick={async () => {
        // DNC verification is asynchronous; recheck immediate call ownership
        // before using the same dial path as the manual keypad.
        if (disabledReason() || callContinuity.getSnapshot()) return;
        setError('');
        try {
          await latest.current.phone.makeCall({ phoneNumber: number, contactId: row.contact_id, contactName: row.contact_name });
        } catch (err) {
          setError(err?.message || 'Could not place call.');
        }
      }}>
      <Phone size={14} aria-hidden="true" />
    </DncCallControl>
    {error && <span className="ops-error" role="alert">{error}</span>}
  </span>;
}

import {callContinuity} from "../../lib/callContinuity.js";
import { useEffect, useRef, useState } from 'react';
import { useAppAuth } from '../../context/AuthContext';
import { checkOutbound } from '../../lib/outboundApi';
import { normalizePhoneE164 } from '../../lib/phone';

// Recheck on click as well as mount; the webhook remains authoritative.
export default function DncCallControl({ phone, doNotCall = false, as: Tag = 'button', disabled, iconOnly = false, children, onClick, ...props }) {
  const { getToken } = useAppAuth();
  const number = normalizePhoneE164(phone);
  const [policy, setPolicy] = useState(null);
  const initiatingRef = useRef(false);
  const [initiating, setInitiating] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setPolicy(null);
    if (number && !doNotCall) checkOutbound(getToken, number)
      .then(result => { if (!cancelled) setPolicy({ number, ...result }); })
      .catch(error => { if (!cancelled) setPolicy({ number, error: error.message }); });
    return () => { cancelled = true; };
  }, [number, doNotCall, getToken]);
  const current = policy?.number === number ? policy : null;
  const blocked = doNotCall || current?.blocked;
  const unavailable = initiating || disabled || !number || !current || current.error || blocked;
  const reason = initiating ? 'Call initiating' : disabled ? props.title : !number ? 'No valid callable number'
    : blocked ? 'Do Not Call' : current?.error || (!current ? 'Checking Do Not Call' : props.title);
  return <>
    <Tag {...props} disabled={Tag === 'button' ? Boolean(unavailable) : undefined}
      href={Tag === 'a' && unavailable ? undefined : props.href}
      aria-disabled={Boolean(unavailable)} aria-busy={initiating || undefined} title={reason}
      onClick={async event => {
        event.preventDefault();
        event.stopPropagation();
        if (unavailable || initiatingRef.current) return;
        initiatingRef.current = true;
        setInitiating(true);
        try {
          const result = await checkOutbound(getToken, number);
          setPolicy({ number, ...result });
          if (!result.blocked) {
            if (Tag === 'a') { if (!callContinuity.getSnapshot()) window.location.href = props.href; }
            else await onClick?.(event);
          }
        } catch (error) { setPolicy({ number, error: error.message }); }
        finally { initiatingRef.current = false; setInitiating(false); }
      }}>{children}</Tag>
    {!iconOnly && (blocked || current?.error) ? <span className="contacts-muted" role="status">{blocked ? 'Do Not Call' : current.error}</span> : null}
  </>;
}

import { useEffect, useState } from 'react';
import { useSessionLock } from '../context/SessionLockContext';
import { useInboundCall } from '../context/InboundCallContext';

const LABELS = { password: 'Password', passkey: 'Passkey', email_code: 'Email code', phone_code: 'Phone code', totp: 'Authenticator code', backup_code: 'Backup code' };
const phoneNumber = call => {
  const value = call?.params?.callerPhone || call?.call?.parameters?.From || '';
  return /^\+?[\d ().-]{1,30}$/.test(value) ? value : '';
};

export default function SessionLockOverlay() {
  const { locked, busy, error, verification, factor, factors, noSupportedFactor, beginVerification, selectFactor, submit, signInAgain, signOut } = useSessionLock();
  const phone = useInboundCall();
  const [credential, setCredential] = useState('');
  useEffect(() => {
    if (locked && !busy && !verification && !error && !noSupportedFactor) void beginVerification();
  }, [locked, busy, verification, error, noSupportedFactor, beginVerification]);
  if (!locked) return null;
  const call = phone?.incomingCall || phone?.activeCall;
  return <main className="session-lock-overlay">
    <section className="session-lock-card" aria-label="Session locked">
      <h1>SESSION LOCKED</h1>
      {call && <div className="session-lock-call">
        <span>{phoneNumber(call)}</span>
        {phone.incomingCall ? <>
          <button data-key-role="primary" type="button" onClick={phone.acceptCall}>Answer</button>
          <button data-key-role="secondary" type="button" onClick={phone.declineCall}>Decline</button>
        </> : <button data-key-role="secondary" type="button" onClick={phone.hangUp}>Hang up</button>}
      </div>}
      {noSupportedFactor ? <button data-key-role="primary" type="button" disabled={busy} onClick={signInAgain}>Sign in again</button> : !verification ? <button data-key-role="primary" type="button" disabled={busy} onClick={beginVerification}>Verify identity</button> : <>
        <div className="session-lock-factors">
          {factors.map((item, index) => <button data-key-role="secondary" key={`${item.strategy}:${index}`} type="button" disabled={busy}
            onClick={() => { setCredential(''); void selectFactor(index); }}>{LABELS[item.strategy]}</button>)}
        </div>
        {factor && <form onSubmit={event => {
          event.preventDefault();
          const value = credential;
          setCredential('');
          void submit(value);
        }}>
          {factor.strategy !== 'passkey' && <label>{LABELS[factor.strategy]}
            <input aria-label={LABELS[factor.strategy]} type={factor.strategy === 'password' ? 'password' : 'text'}
              autoComplete={factor.strategy === 'password' ? 'current-password' : 'one-time-code'}
              value={credential} onChange={event => setCredential(event.target.value)} required disabled={busy} />
          </label>}
          <button data-key-role="primary" type="submit" disabled={busy}>Verify</button>
        </form>}
      </>}
      <button data-key-role="secondary" type="button" onClick={signOut}>Sign out</button>
      {error && <span role="alert">{error}</span>}
      {error && verification && <button data-key-role="secondary" type="button" disabled={busy}
        onClick={() => { setCredential(''); void beginVerification(); }}>Start over</button>}
    </section>
  </main>;
}

import { useId, useState } from 'react';

const modes = { add: 'Add Person', warm: 'Warm Transfer', blind: 'Blind Transfer' };
export default function ConferenceControls({ controls, mode, onClose, agentId, thirdPartyTranscript = [] }) {
  const id = useId();
  const [phone, setPhone] = useState('');
  const [targetAgentId, setTargetAgentId] = useState('');
  const { conference, enabled, busy, error, run } = controls;
  const perform = input => void run(input).then(() => { if (input.action === 'dial') { setPhone(''); setTargetAgentId(''); onClose(); } }).catch(() => {});
  const connectedTarget = conference?.participants.find(p => p.id === conference.transferParticipantId && p.status === 'connected');
  const self = conference?.participants.find(p => p.agentId === agentId && p.status !== 'left');
  const canLeave = self && conference?.phase !== 'warm' && conference?.participants.some(p => p.id !== self.id && p.role !== 'customer' && p.status === 'connected');
  if (!mode && !conference && !error) return null;
  return <div className="phone-conference" aria-busy={busy}>
    {mode && <form className="phone-conference__form" onSubmit={event => {
      event.preventDefault(); perform({ action: 'dial', mode, ...(targetAgentId ? { targetAgentId } : { phone }) });
    }}>
      <strong>{modes[mode]}</strong>
      <label htmlFor={`${id}-phone`}>US phone number</label>
      <input id={`${id}-phone`} type="tel" autoComplete="tel" placeholder="+16095551234" value={phone}
        pattern="\+1[2-9][0-9]{2}[2-9][0-9]{6}" required={!targetAgentId} disabled={busy || Boolean(targetAgentId)} onChange={e => setPhone(e.target.value.trim())} />
      {mode === 'warm' && controls.agents.length > 0 && <><label htmlFor={`${id}-agent`}>Or transfer to an EnrollGen agent</label><select id={`${id}-agent`} value={targetAgentId} disabled={busy} onChange={e => setTargetAgentId(e.target.value)}><option value="">External phone number</option>{controls.agents.map(agent => <option key={agent.agent_slug} value={agent.agent_slug}>{agent.agent_slug.replaceAll('_', ' ')}</option>)}</select></>}
      <p>{mode === 'warm' ? 'The customer hears hold music while you speak privately. Complete Transfer reconnects everyone.' : mode === 'blind' ? 'You will leave immediately. If unanswered, the customer returns to you when available or reaches voicemail.' : 'The customer stays connected while the third person is called.'}</p>
      <div className="phone-conference__buttons"><button type="submit" disabled={!enabled || busy}>{busy ? 'Connecting…' : 'Dial'}</button><button type="button" onClick={onClose} disabled={busy}>Cancel</button></div>
    </form>}
    {error && <p role="alert">{error}</p>}
    {conference && <>
      <div className="phone-conference__heading"><strong>Call participants</strong><span>{conference.customerHeld ? 'Customer on hold' : 'Customer connected'}</span></div>
      <ul>{conference.participants.map(p => <li key={p.id}><span>{p.role === 'third_party' ? 'Third party' : p.role === 'agent' ? 'Agent' : 'Customer'}{p.phone ? ` · ${p.phone}` : p.agentId ? ` · ${p.agentId.replaceAll('_', ' ')}` : ''}</span><span>{p.status}</span>{p.role === 'third_party' && p.status !== 'left' && conference.ownerAgentId === agentId && <button type="button" disabled={busy} onClick={() => perform({ action: 'remove', participantId: p.id })}>Remove</button>}</li>)}</ul>
      <div className="phone-conference__buttons">
        {conference.phase === 'warm' && <><button type="button" disabled={busy || !connectedTarget} onClick={() => perform({ action: 'warm_complete' })}>Complete Transfer</button><button type="button" disabled={busy} onClick={() => perform({ action: 'warm_cancel' })}>Cancel Transfer</button></>}
        {canLeave && <button type="button" disabled={busy} onClick={() => perform({ action: 'leave' })}>Leave Call</button>}
      </div>
      {thirdPartyTranscript.length > 0 && <div className="phone-conference__transcript" aria-label="Third party transcript"><strong>Third party transcript</strong>{thirdPartyTranscript.slice(-4).map((entry, index) => <p key={entry.segmentId || index}><span>THIRD PARTY: </span>{entry.text}</p>)}</div>}
    </>}
  </div>;
}

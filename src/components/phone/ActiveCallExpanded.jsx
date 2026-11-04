import { debugLog } from "../../lib/debugLog.js";
import { useCallback, useState } from "react";
import {
  ArrowLeftRight,
  Grid3x3,
  Mic,
  MicOff,
  MessageSquarePlus,
  Pause,
  PhoneOff,
  Play,
  StickyNote,
  Users,
} from "lucide-react";
import { useInboundCall } from "../../context/InboundCallContext";
import { useContactMutations, contactDisplayName } from "../../hooks/useContacts";
import { formatTime } from "../SharedUI";
import { playDtmfTone } from "../../audio/dtmfTones";
import { useCallDuration } from "./useCallDuration";
import ConferenceControls from './ConferenceControls';

function fmtPhone(value) {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(value || "");
  if (!match) return value || "UNKNOWN";
  return `(${match[1]}) ${match[2]}-${match[3]}`;
}

const DTMF_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function NotesPad({ contact }) {
  const { addNote } = useContactMutations();
  const inbound = useInboundCall();
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = useCallback(async () => {
    const text = body.trim();
    if (!text || !contact?.id) return;
    setSaving(true);
    try {
      await addNote({ contactId: contact.id, agentId: inbound?.agentId, body: text });
      setBody("");
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1800);
    } catch {
      debugLog("[ActiveCallExpanded] add note failed");
    } finally {
      setSaving(false);
    }
  }, [addNote, body, contact, inbound?.agentId]);

  if (!contact?.id) {
    return <div className="phone-expanded__hint">No contact linked to this call yet.</div>;
  }

  return (
    <div className="phone-expanded__notepad">
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Add a note for this call..."
        rows={3}
      />
      <button type="button" className="phone-expanded__save-note" disabled={!body.trim() || saving} onClick={handleSave}>
        {saving ? "SAVING..." : saved ? "SAVED" : "SAVE NOTE"}
      </button>
    </div>
  );
}

function DtmfPad() {
  const inbound = useInboundCall();
  return (
    <div className="phone-expanded__dtmf">
      {DTMF_KEYS.map((digit) => (
        <button
          type="button"
          key={digit}
          className="phone-expanded__dtmf-key"
          onClick={() => {
            playDtmfTone(digit);
            inbound?.sendDigits(digit);
          }}
        >
          {digit}
        </button>
      ))}
    </div>
  );
}

// Transfer and Add Person share the server-authoritative conference controls.
export default function ActiveCallExpanded({ onOpenMessages }) {
  const inbound = useInboundCall();
  const [panel, setPanel] = useState(null); // null | "notes" | "dtmf"
  const [conferenceMode, setConferenceMode] = useState(null);
  const elapsedMs = useCallDuration(inbound?.connectedAt);
  const call = inbound?.activeCall;
  if (!call) return null;

  const { params } = call;
  const controls = inbound.conferencing;
  const held = controls?.conference ? controls.conference.customerHeld : inbound.isHeld;
  const conferenceDisabled = !controls?.enabled || controls.busy || (controls.conference?.participants.filter(p => p.status !== 'left').length || 0) >= 3;
  const displayName =
    (inbound.contact && contactDisplayName(inbound.contact)) ||
    params.callerName ||
    fmtPhone(params.callerPhone);

  const togglePanel = (name) => setPanel((current) => (current === name ? null : name));

  return (
    <div className="phone-expanded">
      <div className="phone-expanded__header">
        <div className="phone-expanded__who">
          <span className="phone-expanded__name">{displayName.toUpperCase()}</span>
          <span className="phone-expanded__phone">{fmtPhone(params.callerPhone)}</span>
        </div>
        <span className="phone-expanded__timer">
          <span className="phone-active-bar__rec-dot" aria-hidden="true" />
          {formatTime(elapsedMs)}
        </span>
      </div>

      <div className="phone-expanded__grid">
        <button
          type="button"
          className={`phone-expanded__action${inbound.isMuted ? " is-active" : ""}`}
          onClick={inbound.toggleMute}
        >
          {inbound.isMuted ? <MicOff size={16} /> : <Mic size={16} />}
          {inbound.isMuted ? "UNMUTE" : "MUTE"}
        </button>
        <button
          type="button"
          className={`phone-expanded__action${held ? " is-active" : ""}`}
          disabled={controls?.busy || controls?.conference?.phase === 'warm'}
          onClick={inbound.toggleHold}
        >
          {held ? <Play size={16} /> : <Pause size={16} />}
          {held ? "RESUME" : "HOLD"}
        </button>
        <button
          type="button"
          className={`phone-expanded__action${panel === "dtmf" ? " is-active" : ""}`}
          onClick={() => togglePanel("dtmf")}
        >
          <Grid3x3 size={16} />
          KEYPAD
        </button>
        <button
          type="button"
          className={`phone-expanded__action${panel === "notes" ? " is-active" : ""}`}
          onClick={() => togglePanel("notes")}
        >
          <StickyNote size={16} />
          NOTES
        </button>
        <button
          type="button"
          className="phone-expanded__action"
          disabled={!inbound.contact?.id}
          onClick={() => inbound.contact?.id && onOpenMessages?.(inbound.contact.id)}
        >
          <MessageSquarePlus size={16} />
          MESSAGE
        </button>
        <button type="button" className="phone-expanded__action" disabled={conferenceDisabled} title={controls?.enabled ? 'Transfer and leave the call' : 'Conference calling is disabled'} onClick={() => setConferenceMode('blind')}>
          <ArrowLeftRight size={16} />
          BLIND XFER
        </button>
        <button type="button" className="phone-expanded__action" disabled={conferenceDisabled} title={controls?.enabled ? 'Consult privately before transferring' : 'Conference calling is disabled'} onClick={() => setConferenceMode('warm')}>
          <Users size={16} />
          WARM XFER
        </button>
        <button type="button" className="phone-expanded__action" disabled={conferenceDisabled} onClick={() => setConferenceMode('add')} title={controls?.enabled ? 'Add a third person' : 'Conference calling is disabled'}><Users size={16} />ADD PERSON</button>
        <button type="button" className="phone-expanded__action phone-expanded__action--end" onClick={inbound.hangUp}>
          <PhoneOff size={16} />
          {controls?.conference && controls.conference.ownerAgentId !== inbound.agentId ? 'LEAVE CALL' : 'END CALL'}
        </button>
      </div>

      {panel === "dtmf" ? <DtmfPad /> : null}
      {panel === "notes" ? <NotesPad contact={inbound.contact} /> : null}
      {controls && <ConferenceControls controls={controls} mode={conferenceMode} onClose={() => setConferenceMode(null)} agentId={inbound.agentId} thirdPartyTranscript={inbound.thirdPartyTranscript} />}
    </div>
  );
}

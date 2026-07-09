import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMessageThread } from "../../hooks/useMessages";
import { useTenantConfig } from "../../hooks/useTenantConfig";

const SEGMENT_SIZE = 160;

const STATUS_LABELS = {
  queued: "QUEUED",
  sent: "SENT",
  delivered: "DELIVERED",
  failed: "FAILED",
  received: "",
};

function fmtDayLabel(value) {
  const d = new Date(value);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return "TODAY";
  return d.toLocaleDateString([], { month: "2-digit", day: "2-digit", year: "2-digit" });
}

function fmtTime(value) {
  const d = new Date(value);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) return "--";
  const total = Math.max(0, Math.round(Number(seconds)));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const ACTIVITY_LABELS = {
  call: "CALL",
  enrollment: "OPPORTUNITY",
  note: "NOTE",
  status_change: "STATUS",
  follow_up: "FOLLOW-UP",
};

function MediaAttachment({ item, supabaseClient }) {
  const [signedUrl, setSignedUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (item.storage_path && supabaseClient) {
      supabaseClient.storage
        .from("message-media")
        .createSignedUrl(item.storage_path, 3600)
        .then(({ data }) => {
          if (!cancelled && data?.signedUrl) setSignedUrl(data.signedUrl);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [item.storage_path, supabaseClient]);

  const url = signedUrl || item.media_url;
  if (!url) return null;

  if ((item.content_type || "").startsWith("image/")) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="msg-media-image">
        <img src={url} alt="attachment" loading="lazy" />
      </a>
    );
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="msg-media-file">
      ATTACHMENT ({item.content_type || "file"})
    </a>
  );
}

function CallTimelineRecording({ call, supabaseClient }) {
  const [audioUrl, setAudioUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const hasRecording = Boolean(call.recording_storage_path || call.recording_url);

  const handlePlay = useCallback(async () => {
    if (audioUrl) {
      setAudioUrl(null);
      return;
    }
    setLoading(true);
    try {
      if (call.recording_storage_path && supabaseClient) {
        const { data } = await supabaseClient.storage
          .from("call-recordings")
          .createSignedUrl(call.recording_storage_path, 3600);
        if (data?.signedUrl) {
          setAudioUrl(data.signedUrl);
          return;
        }
      }
      if (call.recording_url) setAudioUrl(call.recording_url);
    } finally {
      setLoading(false);
    }
  }, [audioUrl, call.recording_storage_path, call.recording_url, supabaseClient]);

  return (
    <div className="msg-call-recording">
      <div>
        <span className="contacts-activity-tag tag-call">CALL</span>
        <span className="mono">{fmtTime(call.call_start)}</span>
        <strong>{[call.product_type, call.carrier_name, call.plan_name].filter(Boolean).join(" ") || "Call"}</strong>
        <small>{fmtDuration(call.call_duration_seconds)}</small>
      </div>
      {hasRecording ? (
        <button type="button" className="contacts-mini-btn" onClick={handlePlay} disabled={loading}>
          {loading ? "..." : audioUrl ? "HIDE" : "PLAY"}
        </button>
      ) : null}
      {audioUrl ? <audio controls preload="none" src={audioUrl} /> : null}
    </div>
  );
}

export default function MessagesThread({ contactId, agentId = null, activityItems = [], callItems = [] }) {
  const { supabaseClient } = useTenantConfig();
  const { messages, media, loading, error, sending, markRead, send } = useMessageThread(contactId);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState("");
  const scrollRef = useRef(null);

  // Opening the thread clears the unread state for this contact.
  useEffect(() => {
    if (!loading && contactId) markRead();
  }, [loading, contactId, markRead, messages.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, activityItems.length, callItems.length]);

  const grouped = useMemo(() => {
    const timeline = [
      ...messages.map((message) => ({
        type: "message",
        key: `message-${message.id}`,
        at: message.created_at,
        message,
      })),
      ...activityItems.map((activity) => ({
        type: "activity",
        key: `activity-${activity.id}`,
        at: activity.occurred_at || activity.created_at,
        activity,
      })),
      ...callItems.map((call) => ({
        type: "call",
        key: `call-${call.id}`,
        at: call.call_start,
        call,
      })),
    ].filter((item) => item.at);

    timeline.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    const groups = [];
    let lastDay = "";
    for (const item of timeline) {
      const day = new Date(item.at).toDateString();
      if (day !== lastDay) {
        groups.push({ type: "day", key: `day-${day}`, label: fmtDayLabel(item.at) });
        lastDay = day;
      }
      groups.push(item);
    }
    return groups;
  }, [messages, activityItems, callItems]);

  const itemCount = grouped.filter((entry) => entry.type !== "day").length;

  const charCount = draft.length;
  const segments = charCount === 0 ? 0 : Math.ceil(charCount / SEGMENT_SIZE);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSendError("");
    try {
      await send({ body, agentId });
      setDraft("");
    } catch (err) {
      setSendError(err.message || "Send failed");
    }
  };

  return (
    <div className="msg-thread">
      {error ? <div className="ops-error">⚠ {error}</div> : null}

      <div className="msg-scroll" ref={scrollRef}>
        {loading ? (
          <div className="contacts-muted">Loading messages...</div>
        ) : itemCount === 0 ? (
          <div className="contacts-muted">No messages yet. Send the first one below.</div>
        ) : (
          grouped.map((entry) => {
            if (entry.type === "day") {
              return (
              <div key={entry.key} className="msg-day-separator">
                <span>{entry.label}</span>
              </div>
              );
            }
            if (entry.type === "activity") {
              const label = ACTIVITY_LABELS[entry.activity.type] || String(entry.activity.type || "EVENT").toUpperCase();
              return (
                <div key={entry.key} className="msg-event-row">
                  <span className={`contacts-activity-tag tag-${entry.activity.type}`}>{label}</span>
                  <span className="mono">{fmtTime(entry.at)}</span>
                  <span>{entry.activity.summary || label}</span>
                </div>
              );
            }
            if (entry.type === "call") {
              return <CallTimelineRecording key={entry.key} call={entry.call} supabaseClient={supabaseClient} />;
            }
            return (
              <div
                key={entry.key}
                className={`msg-row ${entry.message.direction === "outbound" ? "is-outbound" : "is-inbound"}`}
              >
                <div className="msg-bubble">
                  {entry.message.body ? <p>{entry.message.body}</p> : null}
                  {(media[entry.message.id] || []).map((item) => (
                    <MediaAttachment key={item.id} item={item} supabaseClient={supabaseClient} />
                  ))}
                  <div className="msg-meta">
                    <span className="mono">{fmtTime(entry.message.created_at)}</span>
                    {entry.message.direction === "outbound" && STATUS_LABELS[entry.message.status] ? (
                      <span className={`msg-status is-${entry.message.status}`}>
                        {STATUS_LABELS[entry.message.status]}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {sendError ? <div className="ops-error">⚠ {sendError}</div> : null}

      <div className="msg-compose">
        <textarea
          rows={2}
          placeholder="Type a message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
        />
        <div className="msg-compose-side">
          <span className={`msg-charcount${segments > 1 ? " is-multi" : ""}`}>
            {charCount}/{SEGMENT_SIZE}
            {segments > 1 ? ` (${segments} segments)` : ""}
          </span>
          <button
            type="button"
            className="msg-send-btn"
            onClick={handleSend}
            disabled={sending || !draft.trim()}
          >
            {sending ? "SENDING..." : "SEND"}
          </button>
        </div>
      </div>
    </div>
  );
}

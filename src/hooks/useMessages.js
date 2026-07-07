import { useCallback, useEffect, useState } from "react";
import { useTenantConfig } from "./useTenantConfig";
import { useAppAuth } from "../context/AuthContext";
import { publishSms, subscribeSms } from "../lib/smsEvents";
import { INBOUND_CALLS_ENABLED } from "../context/InboundCallContext";

const TELEPHONY_BASE_URL = (import.meta.env.VITE_TELEPHONY_BASE_URL || "").replace(/\/$/, "");
const THREAD_POLL_MS = 10000;
const UNREAD_POLL_MS = 20000;

// The /agent WebSocket only exists when inbound calls are enabled;
// without it the thread and unread counts fall back to polling.
const HAS_REALTIME = INBOUND_CALLS_ENABLED;

export function useMessageThread(contactId) {
  const { supabaseClient } = useTenantConfig();
  const { getToken } = useAppAuth();
  const [messages, setMessages] = useState([]);
  const [media, setMedia] = useState({});
  const [loading, setLoading] = useState(Boolean(contactId));
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabaseClient || !contactId) return;
    try {
      const { data, error: queryError } = await supabaseClient
        .from("messages")
        .select("*")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (queryError) throw queryError;
      setMessages(data || []);
      setError(null);

      const ids = (data || []).map((row) => row.id);
      if (ids.length) {
        const { data: mediaRows } = await supabaseClient
          .from("message_media")
          .select("*")
          .in("message_id", ids);
        const byMessage = {};
        for (const row of mediaRows || []) {
          if (!byMessage[row.message_id]) byMessage[row.message_id] = [];
          byMessage[row.message_id].push(row);
        }
        setMedia(byMessage);
      } else {
        setMedia({});
      }
    } catch (err) {
      console.error("[useMessageThread] load failed:", err);
      setError(err.message || "Messages unavailable.");
    } finally {
      setLoading(false);
    }
  }, [supabaseClient, contactId]);

  useEffect(() => {
    setMessages([]);
    setLoading(Boolean(contactId));
    refresh();
  }, [refresh, contactId]);

  // Real-time via WS when available, polling otherwise.
  useEffect(() => {
    if (!contactId) return undefined;
    if (HAS_REALTIME) {
      return subscribeSms((event) => {
        if (event?.message?.contact_id === contactId) refresh();
      });
    }
    const timer = window.setInterval(refresh, THREAD_POLL_MS);
    return () => window.clearInterval(timer);
  }, [contactId, refresh]);

  const markRead = useCallback(async () => {
    if (!supabaseClient || !contactId) return;
    const { error: updateError } = await supabaseClient
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("contact_id", contactId)
      .eq("direction", "inbound")
      .is("read_at", null);
    if (updateError) console.error("[useMessageThread] markRead failed:", updateError.message);
  }, [supabaseClient, contactId]);

  const send = useCallback(
    async ({ body, mediaUrls, agentId }) => {
      setSending(true);
      try {
        const token = await getToken().catch(() => null);
        const response = await fetch(`${TELEPHONY_BASE_URL}/api/sms/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            contact_id: contactId,
            body,
            ...(mediaUrls?.length ? { media_urls: mediaUrls } : {}),
            ...(agentId ? { agent_id: agentId } : {}),
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Send failed (${response.status})`);
        await refresh();
        return payload.message;
      } finally {
        setSending(false);
      }
    },
    [contactId, getToken, refresh]
  );

  return { messages, media, loading, error, sending, refresh, markRead, send };
}

// Shared across hook instances so polling publishes each new inbound
// message exactly once, no matter how many components have
// useUnreadMessages mounted, and never re-publishes a message the
// WebSocket already delivered (contacts without an assigned agent get
// no WS push at all, so polling is their only notification path).
let lastPolledCreatedAt = null;
const seenMessageIds = new Set();

export function markSmsMessageSeen(messageId) {
  if (messageId) seenMessageIds.add(messageId);
}

export function useUnreadMessages() {
  const { supabaseClient } = useTenantConfig();
  const [unreadByContact, setUnreadByContact] = useState({});
  const [total, setTotal] = useState(0);

  const refresh = useCallback(async () => {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient
      .from("messages")
      .select("id, contact_id, body, from_number, created_at, contacts(id, first_name, last_name, phone)")
      .eq("direction", "inbound")
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) {
      // Table may not exist until migration 020 runs; stay quiet.
      return;
    }
    const rows = data || [];
    const counts = {};
    for (const row of rows) {
      counts[row.contact_id] = (counts[row.contact_id] || 0) + 1;
    }
    setUnreadByContact(counts);
    setTotal(rows.length);

    // Surface newly arrived messages through the same pub/sub the toast
    // host uses. This runs even when the WebSocket is on: the server
    // only pushes to a contact's assigned agent, so unassigned contacts
    // (every fresh inbound texter) are notified here. Messages the WS
    // already delivered are skipped via seenMessageIds.
    const newest = rows[0]?.created_at || null;
    if (lastPolledCreatedAt === null) {
      // First fetch of the session: baseline only, no toasts for
      // messages that were already unread when the app loaded.
      lastPolledCreatedAt = newest || new Date(0).toISOString();
    } else if (newest && newest > lastPolledCreatedAt) {
      const fresh = rows
        .filter((row) => row.created_at > lastPolledCreatedAt && !seenMessageIds.has(row.id))
        .reverse();
      lastPolledCreatedAt = newest;
      for (const row of fresh) {
        seenMessageIds.add(row.id);
        publishSms({
          type: "sms",
          message: { ...row, direction: "inbound" },
          contact: row.contacts || null,
        });
      }
    }
  }, [supabaseClient]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, UNREAD_POLL_MS);
    // Record every published message id (WS or polling) so the poll
    // never re-publishes something already delivered, then refresh
    // counts.
    const unsubscribe = subscribeSms((event) => {
      markSmsMessageSeen(event?.message?.id);
      refresh();
    });
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [refresh]);

  return { unreadByContact, total, refresh };
}

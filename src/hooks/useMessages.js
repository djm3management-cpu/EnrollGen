import { useCallback, useEffect, useState } from "react";
import { useTenantConfig } from "./useTenantConfig";
import { useAppAuth } from "../context/AuthContext";
import { subscribeSms } from "../lib/smsEvents";
import { INBOUND_CALLS_ENABLED } from "../context/InboundCallContext";

const TELEPHONY_BASE_URL = (import.meta.env.VITE_TELEPHONY_BASE_URL || "").replace(/\/$/, "");
const THREAD_POLL_MS = 10000;
const UNREAD_POLL_MS = 60000;

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

export function useUnreadMessages() {
  const { supabaseClient } = useTenantConfig();
  const [unreadByContact, setUnreadByContact] = useState({});
  const [total, setTotal] = useState(0);

  const refresh = useCallback(async () => {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient
      .from("messages")
      .select("contact_id")
      .eq("direction", "inbound")
      .is("read_at", null)
      .limit(1000);
    if (error) {
      // Table may not exist until migration 020 runs; stay quiet.
      return;
    }
    const counts = {};
    for (const row of data || []) {
      counts[row.contact_id] = (counts[row.contact_id] || 0) + 1;
    }
    setUnreadByContact(counts);
    setTotal((data || []).length);
  }, [supabaseClient]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, UNREAD_POLL_MS);
    const unsubscribe = HAS_REALTIME ? subscribeSms(() => refresh()) : null;
    return () => {
      window.clearInterval(timer);
      if (unsubscribe) unsubscribe();
    };
  }, [refresh]);

  return { unreadByContact, total, refresh };
}

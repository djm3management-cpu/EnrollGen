// Connectivity only: reopening a phone never changes the manual availability
// preference. The server owns session leases and detects silent disconnects.
export function createAgentPhoneConnection({
  onMessage, onPresenceReady = () => {}, refreshBundle, Socket = WebSocket, schedule = setTimeout, cancel = clearTimeout,
}) {
  let bundle;
  let refreshCredentials = refreshBundle;
  let current;
  let ready = false;
  let stopped = true;
  let retry;
  let generation = 0;
  let failures = 0;
  const sockets = new Set();
  const acknowledged = new Set();
  const reportPresence = () => onPresenceReady(!stopped && ready && acknowledged.size > 0);
  function announce(socket) {
    if (socket.readyState === Socket.OPEN) {
      socket.send(JSON.stringify({ type: "phone-ready", ready }));
    }
  }
  function connect() {
    if (stopped || !bundle?.ws_url || !bundle?.ws_token) return;
    cancel(retry);
    const socket = new Socket(`${bundle.ws_url}?token=${encodeURIComponent(bundle.ws_token)}`);
    sockets.add(socket);
    current = socket;
    socket.onopen = () => announce(socket);
    socket.onmessage = event => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (stopped || !sockets.has(socket) || socket.readyState !== Socket.OPEN) return;
      if (message.type === "presence-ready") {
        if (!ready) return;
        failures = 0;
        acknowledged.add(socket);
        reportPresence();
        // Commit the replacement lease before closing the old connection.
        if (socket === current) {
          for (const old of sockets) if (old !== socket) old.close();
        }
        return;
      }
      if (socket === current) onMessage(message);
    };
    socket.onclose = () => {
      sockets.delete(socket);
      acknowledged.delete(socket);
      reportPresence();
      if (socket !== current || stopped) return;
      const expectedGeneration = generation;
      const stillCurrent = () => !stopped && generation === expectedGeneration;
      const delay = () => Math.min(30000, 2000 * 2 ** Math.min(failures++, 4));
      const reconnect = async () => {
        if (!stillCurrent()) return;
        try {
          // Browsers hide the HTTP handshake status. Refresh on disconnect so
          // an expired/rotated token cannot trap us in repeated 401 upgrades.
          const fresh = refreshCredentials ? await refreshCredentials() : bundle;
          if (!stillCurrent()) return;
          bundle = fresh;
          connect();
        } catch {
          if (stillCurrent()) retry = schedule(reconnect, delay());
        }
      };
      retry = schedule(reconnect, delay());
    };
    socket.onerror = () => socket.close();
  }
  return {
    start(nextBundle, nextRefreshBundle = refreshCredentials) {
      generation++;
      refreshCredentials = nextRefreshBundle;
      bundle = nextBundle;
      stopped = false;
      connect();
    },
    setReady(nextReady) {
      ready = nextReady;
      if (!ready) {
        acknowledged.clear();
        reportPresence();
      }
      for (const socket of sockets) announce(socket);
    },
    stop() {
      generation++;
      stopped = true;
      acknowledged.clear();
      reportPresence();
      cancel(retry);
      for (const socket of sockets) socket.close();
      sockets.clear();
      current = null;
    },
  };
}

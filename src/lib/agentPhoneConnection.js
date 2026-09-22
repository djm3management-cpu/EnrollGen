// Connectivity only: reopening a phone never changes the manual availability
// preference. The server owns session leases and detects silent disconnects.
export function createAgentPhoneConnection({
  onMessage, onPresenceReady = () => {}, Socket = WebSocket, schedule = setTimeout, cancel = clearTimeout,
}) {
  let bundle;
  let current;
  let ready = false;
  let stopped = true;
  let retry;
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
      if (socket === current && !stopped) retry = schedule(connect, 2000);
    };
    socket.onerror = () => socket.close();
  }
  return {
    start(nextBundle) {
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

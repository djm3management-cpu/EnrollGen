// Connectivity only: reopening a phone never changes the manual availability
// preference. The server owns session leases and detects silent disconnects.
export function createAgentPhoneConnection({
  onMessage, Socket = WebSocket, schedule = setTimeout, cancel = clearTimeout,
}) {
  let bundle;
  let current;
  let ready = false;
  let stopped = true;
  let retry;
  const sockets = new Set();
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
      if (message.type === "presence-ready") {
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
      for (const socket of sockets) announce(socket);
    },
    stop() {
      stopped = true;
      cancel(retry);
      for (const socket of sockets) socket.close();
      sockets.clear();
      current = null;
    },
  };
}

const clients = {}; // chat clients
const notificationClients = {}; // notification clients
const onlineUsers = new Set();

/* ================= CHAT KEY ================= */
function getKey(userId, otherUserId) {
  return `${String(userId)}-${String(otherUserId)}`;
}

/* ================= SAFE WRITE ================= */
function safeWrite(res, data) {
  try {
    if (!res || res.writableEnded || res.destroyed) return false;

    if (!res.headersSent) {
      res.flushHeaders?.();
    }

    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch (err) {
    console.error("❌ SSE WRITE ERROR:", err.message);
    return false;
  }
}

/* ================= CHAT CLIENT ================= */
function addClient(userId, otherUserId, res) {
  const key = getKey(userId, otherUserId);

  if (!clients[key]) clients[key] = new Set();

  clients[key].add(res);

  // optional handshake
  safeWrite(res, { type: "connected", scope: "chat" });
}

function removeClient(userId, otherUserId, res) {
  const key = getKey(userId, otherUserId);

  if (!clients[key]) return;

  clients[key].delete(res);

  if (clients[key].size === 0) {
    delete clients[key];
  }
}

/* ================= NOTIFICATION CLIENT ================= */
function addNotificationClient(userId, res) {
  const id = String(userId);

  if (!notificationClients[id]) {
    notificationClients[id] = new Set();
  }

  notificationClients[id].add(res);

  // handshake (frontend relies on this sometimes)
  safeWrite(res, { type: "connected", scope: "notification" });
}

function removeNotificationClient(userId, res) {
  const id = String(userId);

  if (!notificationClients[id]) return;

  notificationClients[id].delete(res);

  if (notificationClients[id].size === 0) {
    delete notificationClients[id];
  }
}

/* ================= PUSH MESSAGE ================= */
function pushMessage(userId, otherUserId, message) {
  const keys = [
    getKey(userId, otherUserId),
    getKey(otherUserId, userId),
  ];

  keys.forEach((key) => {
    clients[key]?.forEach((res) => {
      const ok = safeWrite(res, {
        type: "new_message",
        message,
      });

      if (!ok) {
        clients[key].delete(res);
      }
    });
  });
}

/* ================= PUSH NOTIFICATION ================= */
function pushNotification(userId, notification) {
  const id = String(userId);

  const userClients = notificationClients[id];

  if (!userClients || userClients.size === 0) {
    console.log("⚠️ No active notification clients for:", id);
    return;
  }

  userClients.forEach((res) => {
    const ok = safeWrite(res, {
      type: "notification",
      notification,
    });

    if (!ok) {
      userClients.delete(res);
    }
  });
}

/* ================= ONLINE ================= */
function setOnline(userId) {
  onlineUsers.add(String(userId));
}

function setOffline(userId) {
  onlineUsers.delete(String(userId));
}

function isOnline(userId) {
  return onlineUsers.has(String(userId));
}

/* ================= HEARTBEAT ================= */
setInterval(() => {
  // chat heartbeat
  Object.values(clients).forEach((set) => {
    set.forEach((res) => {
      safeWrite(res, { type: "ping", scope: "chat" });
    });
  });

  // notification heartbeat
  Object.values(notificationClients).forEach((set) => {
    set.forEach((res) => {
      safeWrite(res, { type: "ping", scope: "notification" });
    });
  });
}, 25000);

/* ================= EXPORT ================= */
module.exports = {
  addClient,
  removeClient,

  addNotificationClient,
  removeNotificationClient,

  pushMessage,
  pushNotification,

  setOnline,
  setOffline,
  isOnline,
};

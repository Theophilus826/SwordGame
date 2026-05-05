const clients = {}; // DM
const notificationClients = {};
const groupClients = {}; // groupId -> Set(res)

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
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
    }

    res.write(`data: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch (err) {
    console.error("❌ SSE WRITE ERROR:", err.message);
    return false;
  }
}

/* ================= =========================
   🔵 DM CLIENTS
========================= */
function addClient(userId, otherUserId, res) {
  const key = getKey(userId, otherUserId);

  if (!clients[key]) clients[key] = new Set();

  clients[key].add(res);

  safeWrite(res, { type: "connected", scope: "chat" });
}

function removeClient(userId, otherUserId, res) {
  const key = getKey(userId, otherUserId);

  if (!clients[key]) return;

  clients[key].delete(res);

  if (clients[key].size === 0) delete clients[key];
}

/* ================= =========================
   🔥 GROUP CLIENTS (IMPROVED)
========================= */
function addGroupClient(groupId, userId, res) {
  const g = String(groupId);
  const u = String(userId);

  if (!groupClients[g]) groupClients[g] = {};
  if (!groupClients[g][u]) groupClients[g][u] = new Set();

  groupClients[g][u].add(res);

  safeWrite(res, {
    type: "connected",
    scope: "group",
    groupId,
  });
}

function removeGroupClient(groupId, userId, res) {
  const g = String(groupId);
  const u = String(userId);

  if (!groupClients[g]?.[u]) return;

  if (res) {
    groupClients[g][u].delete(res);
  } else {
    delete groupClients[g][u]; // remove ALL connections of user
  }

  if (groupClients[g][u]?.size === 0) {
    delete groupClients[g][u];
  }

  if (Object.keys(groupClients[g]).length === 0) {
    delete groupClients[g];
  }
}

function pushGroupMessage(groupId, message) {
  const g = String(groupId);
  const users = groupClients[g];
  if (!users) return;

  Object.values(users).forEach((set) => {
    set.forEach((res) => {
      const ok = safeWrite(res, {
        type: "group_event",
        groupId: g,
        ...message,
      });

      if (!ok) set.delete(res);
    });
  });
}

/* ================= NOTIFICATIONS ================= */
function addNotificationClient(userId, res) {
  const id = String(userId);

  if (!notificationClients[id]) {
    notificationClients[id] = new Set();
  }

  notificationClients[id].add(res);

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

/* ================= =========================
   🔵 DM PUSH
========================= */
function pushMessage(userId, otherUserId, message) {
  const keys = [getKey(userId, otherUserId), getKey(otherUserId, userId)];

  keys.forEach((key) => {
    clients[key]?.forEach((res) => {
      const ok = safeWrite(res, {
        type: "new_message",
        scope: "dm",
        message,
      });

      if (!ok) clients[key].delete(res);
    });
  });
}

/* ================= =========================
   🔥 GROUP PUSH (ROLE-AWARE READY)
========================= */
function pushGroupMessage(group, message) {
  const key = String(group._id || group);

  const set = groupClients[key];
  if (!set) return;

  set.forEach((res) => {
    const ok = safeWrite(res, {
      type: "new_message",
      scope: "group",
      groupId: key,
      message,
    });

    if (!ok) set.delete(res);
  });
}

/* ================= NOTIFICATION ================= */
function pushNotification(userId, notification) {
  const id = String(userId);

  const set = notificationClients[id];
  if (!set) return;

  set.forEach((res) => {
    const ok = safeWrite(res, {
      type: "notification",
      notification,
    });

    if (!ok) set.delete(res);
  });
}

/* ================= TYPING (DM) ================= */
function sendTyping(fromUser, toUser, status) {
  const key = getKey(fromUser, toUser);

  clients[key]?.forEach((res) => {
    safeWrite(res, {
      type: status,
      scope: "dm",
      fromUser,
    });
  });
}

/* ================= 🔥 GROUP TYPING ================= */
function sendGroupTyping(groupId, fromUser, status) {
  const key = String(groupId);

  groupClients[key]?.forEach((res) => {
    safeWrite(res, {
      type: status,
      scope: "group",
      groupId,
      fromUser,
    });
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

/* ================= STATUS BROADCAST ================= */
function broadcastStatus(userId, status) {
  Object.values(clients).forEach((set) => {
    set.forEach((res) => {
      safeWrite(res, {
        type: "status",
        userId,
        status,
      });
    });
  });
}

/* ================= HEARTBEAT ================= */
setInterval(() => {
  Object.values(clients).forEach((set) => {
    set.forEach((res) => safeWrite(res, { type: "ping", scope: "chat" }));
  });

  Object.values(groupClients).forEach((users) => {
    Object.values(users).forEach((set) => {
      set.forEach((res) => safeWrite(res, { type: "ping", scope: "group" }));
    });
  });

  Object.values(notificationClients).forEach((set) => {
    set.forEach((res) =>
      safeWrite(res, { type: "ping", scope: "notification" }),
    );
  });
}, 25000);

/* ================= EXPORT ================= */
module.exports = {
  addClient,
  removeClient,

  addGroupClient,
  removeGroupClient,

  pushMessage,
  pushGroupMessage,

  addNotificationClient,
  removeNotificationClient,
  pushNotification,

  sendTyping,
  sendGroupTyping,

  broadcastStatus,

  setOnline,
  setOffline,
  isOnline,
};

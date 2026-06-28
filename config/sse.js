const clients = {};
const notificationClients = {};
const groupClients = {};
const onlineUsers = new Set();

/* =========================================================
   🔵 CHAT KEY
========================================================= */

function getKey(userId, otherUserId) {
  return `${String(userId)}-${String(otherUserId)}`;
}

/* =========================================================
   🔵 SAFE SSE WRITE
========================================================= */

function safeWrite(res, data) {
  try {
    if (!res || res.writableEnded || res.destroyed) {
      return false;
    }

    res.write(`data: ${JSON.stringify(data)}\n\n`);

    return true;
  } catch (err) {
    console.error("SSE WRITE ERROR:", err.message);

    return false;
  }
}

/* =========================================================
   🔵 DM CLIENTS
========================================================= */

function addClient(userId, otherUserId, res) {
  const key = getKey(userId, otherUserId);

  if (!clients[key]) {
    clients[key] = new Set();
  }

  clients[key].add(res);

  safeWrite(res, {
    type: "connected",
    scope: "chat",
  });
}

function removeClient(userId, otherUserId, res) {
  const key = getKey(userId, otherUserId);

  if (!clients[key]) return;

  clients[key].delete(res);

  if (clients[key].size === 0) {
    delete clients[key];
  }
}

/* =========================================================
   🔵 GROUP CLIENTS
========================================================= */

function addGroupClient(groupId, userId, res) {
  const g = String(groupId);
  const u = String(userId);

  if (!groupClients[g]) {
    groupClients[g] = {};
  }

  if (!groupClients[g][u]) {
    groupClients[g][u] = new Set();
  }

  groupClients[g][u].add(res);

  setOnline(u);

  console.log(`✅ GROUP CONNECTED: ${u} -> ${g}`);

  safeWrite(res, {
    type: "connected",
    scope: "group",
    groupId: g,
    userId: u,
  });

  broadcastGroupOnlineMembers(g);
}

function removeGroupClient(groupId, userId, res) {
  const g = String(groupId);
  const u = String(userId);

  if (!groupClients[g]) return;

  if (!groupClients[g][u]) return;

  groupClients[g][u].delete(res);

  if (groupClients[g][u].size === 0) {
    delete groupClients[g][u];

    setOffline(u);
  }

  if (Object.keys(groupClients[g]).length === 0) {
    delete groupClients[g];
  }

  console.log(`❌ GROUP DISCONNECTED: ${u} -> ${g}`);

  broadcastGroupOnlineMembers(g);
}

/* =========================================================
   🔵 GROUP ONLINE USERS
========================================================= */

function getOnlineGroupMembers(groupId) {
  const g = String(groupId);

  if (!groupClients[g]) {
    return [];
  }

  return Object.keys(groupClients[g]);
}

function broadcastGroupOnlineMembers(groupId) {
  const g = String(groupId);

  if (!groupClients[g]) return;

  const members = getOnlineGroupMembers(g);

  Object.values(groupClients[g]).forEach((set) => {
    for (const res of [...set]) {
      const ok = safeWrite(res, {
        type: "online_members",
        scope: "group",
        groupId: g,
        members,
      });

      if (!ok) {
        set.delete(res);
      }
    }
  });
}

/* =========================================================
   🔵 GROUP MESSAGES
========================================================= */

function pushGroupMessage(groupId, payload) {
  const g = String(groupId);

  if (!groupClients[g]) {
    console.log("⚠️ No connected group clients:", g);
    return;
  }

  Object.values(groupClients[g]).forEach((set) => {
    for (const res of [...set]) {
      const ok = safeWrite(res, {
        scope: "group",
        groupId: g,
        ...payload,
      });

      if (!ok) {
        set.delete(res);
      }
    }
  });
}

/* =========================================================
   🔵 NOTIFICATIONS
========================================================= */

function addNotificationClient(userId, res) {
  const id = String(userId);

  if (!notificationClients[id]) {
    notificationClients[id] = new Set();
  }

  notificationClients[id].add(res);

  safeWrite(res, {
    type: "connected",
    scope: "notification",
  });
}

function removeNotificationClient(userId, res) {
  const id = String(userId);

  if (!notificationClients[id]) return;

  notificationClients[id].delete(res);

  if (notificationClients[id].size === 0) {
    delete notificationClients[id];
  }
}

function pushNotification(userId, notification) {
  const id = String(userId);

  if (!notificationClients[id]) return;

  notificationClients[id].forEach((res) => {
    const ok = safeWrite(res, {
      type: "notification",
      notification,
    });

    if (!ok) {
      notificationClients[id].delete(res);
    }
  });
}

/* =========================================================
   🔵 DM MESSAGES
========================================================= */

function pushMessage(userId, otherUserId, message) {
  const keys = [
    getKey(userId, otherUserId),
    getKey(otherUserId, userId),
  ];

  keys.forEach((key) => {
    clients[key]?.forEach((res) => {
      const ok = safeWrite(res, {
          type: "new_message",
          scope: "dm",
          message,
      });

      if (!ok) {
        clients[key].delete(res);
      }
    });
  });
}

function pushMessageEvent(userId, otherUserId, payload) {
  const keys = [
    getKey(userId, otherUserId),
    getKey(otherUserId, userId),
  ];

  keys.forEach((key) => {
    clients[key]?.forEach((res) => {
      const ok = safeWrite(res, payload);

      if (!ok) {
        clients[key].delete(res);
      }
    });
  });
}

/* =========================================================
   🔵 TYPING
========================================================= */

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

function sendGroupTyping(groupId, fromUser, status) {
  const g = String(groupId);

  if (!groupClients[g]) return;

  Object.values(groupClients[g]).forEach((set) => {
    set.forEach((res) => {
      safeWrite(res, {
        type: status,
        scope: "group",
        groupId: g,
        fromUser,
      });
    });
  });
}

/* =========================================================
   🔵 ONLINE STATUS
========================================================= */

function setOnline(userId) {
  onlineUsers.add(String(userId));
}

function setOffline(userId) {
  onlineUsers.delete(String(userId));
}

function isOnline(userId) {
  return onlineUsers.has(String(userId));
}

function broadcastStatus(userId, status) {
  const payload = {
    type: "status",
    userId,
    status,
  };

  // send to DM clients
  Object.values(clients).forEach((set) => {
    set.forEach((res) => {
      const ok = safeWrite(res, payload);

      if (!ok) {
        set.delete(res);
      }
    });
  });

  // send to notification stream clients (global listeners)
  Object.values(notificationClients).forEach((set) => {
    set.forEach((res) => {
      const ok = safeWrite(res, payload);

      if (!ok) {
        set.delete(res);
      }
    });
  });
}

/* =========================================================
   🔵 HEARTBEAT
========================================================= */

setInterval(() => {
  Object.values(clients).forEach((set) => {
    set.forEach((res) => {
      safeWrite(res, {
        type: "ping",
        scope: "chat",
      });
    });
  });

  Object.values(groupClients).forEach((users) => {
    Object.values(users).forEach((set) => {
      set.forEach((res) => {
        safeWrite(res, {
          type: "ping",
          scope: "group",
        });
      });
    });
  });

  Object.values(notificationClients).forEach((set) => {
    set.forEach((res) => {
      safeWrite(res, {
        type: "ping",
        scope: "notification",
      });
    });
  });
}, 25000);

/* =========================================================
   🔵 EXPORTS
========================================================= */

module.exports = {
  addClient,
  removeClient,

  addGroupClient,
  removeGroupClient,

  getOnlineGroupMembers,
  broadcastGroupOnlineMembers,

  pushMessage,
  pushMessageEvent,
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

const clients = {};
const onlineUsers = new Set();

/* ================= HELPER ================= */
function getKey(userId, otherUserId) {
  return `${userId}-${otherUserId}`;
}

/* ================= SAFE WRITE ================= */
function safeWrite(res, data) {
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (err) {
    console.error("SSE WRITE ERROR:", err);
  }
}

/* ================= REGISTER CLIENT ================= */
function addClient(userId, otherUserId, res) {
  const key = getKey(userId, otherUserId);

  if (!clients[key]) clients[key] = new Set();

  // ✅ prevent duplicates
  clients[key].add(res);
}

/* ================= REMOVE CLIENT ================= */
function removeClient(userId, otherUserId, res) {
  const key = getKey(userId, otherUserId);

  if (!clients[key]) return;

  clients[key].delete(res);

  // ✅ cleanup empty sets
  if (clients[key].size === 0) {
    delete clients[key];
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
      safeWrite(res, { type: "new_message", message });
    });
  });
}

/* ================= TYPING ================= */
function sendTyping(userId, otherUserId, type) {
  const keys = [
    getKey(userId, otherUserId),
    getKey(otherUserId, userId),
  ];

  keys.forEach((key) => {
    clients[key]?.forEach((res) => {
      safeWrite(res, { type });
    });
  });
}

/* ================= ONLINE STATUS ================= */
function setOnline(userId) {
  onlineUsers.add(String(userId));
}

function setOffline(userId) {
  onlineUsers.delete(String(userId));
}

function isOnline(userId) {
  return onlineUsers.has(String(userId));
}

/* ================= BROADCAST STATUS ================= */
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

module.exports = {
  addClient,
  removeClient,
  pushMessage,
  sendTyping,
  setOnline,
  setOffline,
  isOnline,
  broadcastStatus,
};

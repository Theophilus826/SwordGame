const clients = {};
const onlineUsers = new Set();

/* ================= REGISTER CLIENT ================= */
function addClient(userId, otherUserId, res) {
  const key = `${userId}-${otherUserId}`;
  if (!clients[key]) clients[key] = [];
  clients[key].push(res);
}

/* ================= REMOVE CLIENT ================= */
function removeClient(userId, otherUserId, res) {
  const key = `${userId}-${otherUserId}`;
  clients[key] = (clients[key] || []).filter((c) => c !== res);
}

/* ================= PUSH MESSAGE ================= */
function pushMessage(userId, otherUserId, message) {
  [ `${userId}-${otherUserId}`, `${otherUserId}-${userId}` ].forEach((key) => {
    clients[key]?.forEach((res) => {
      res.write(`data: ${JSON.stringify({ type: "new_message", message })}\n\n`);
    });
  });
}

/* ================= TYPING ================= */
function sendTyping(userId, otherUserId, type) {
  [ `${userId}-${otherUserId}`, `${otherUserId}-${userId}` ].forEach((key) => {
    clients[key]?.forEach((res) => {
      res.write(`data: ${JSON.stringify({ type })}\n\n`);
    });
  });
}

/* ================= ONLINE STATUS ================= */
function setOnline(userId) {
  onlineUsers.add(userId);
}

function setOffline(userId) {
  onlineUsers.delete(userId);
}

function isOnline(userId) {
  return onlineUsers.has(userId);
}

function broadcastStatus(userId, status) {
  Object.values(clients).forEach((arr) => {
    arr.forEach((res) => {
      res.write(
        `data: ${JSON.stringify({ type: "status", userId, status })}\n\n`
      );
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

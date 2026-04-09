const Message = require("../models/Message");
const {
  addClient,
  removeClient,
  pushMessage,
  sendTyping,
  setOnline,
  setOffline,
  isOnline,
  broadcastStatus,
} = require("../config/sse");

/* ================= HELPERS ================= */
async function getMessages(userId, otherUserId) {
  return await Message.find({
    $or: [
      { fromUser: userId, toUser: otherUserId },
      { fromUser: otherUserId, toUser: userId },
    ],
  }).sort({ createdAt: 1 });
}

async function saveMessage({ fromUser, toUserId, text }) {
  return await Message.create({ fromUser, toUser: toUserId, message: text });
}

/* ================= STREAM ================= */
const streamChat = async (req, res) => {
  const { userId, otherUserId } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  setOnline(userId);
  broadcastStatus(userId, "online");

  addClient(userId, otherUserId, res);

  const messages = await getMessages(userId, otherUserId);
  res.write(`data: ${JSON.stringify({ type: "init", messages })}\n\n`);

  res.write(
    `data: ${JSON.stringify({
      type: "status",
      userId: otherUserId,
      status: isOnline(otherUserId) ? "online" : "offline",
    })}\n\n`
  );

  req.on("close", () => {
    setOffline(userId);
    broadcastStatus(userId, "offline");
    removeClient(userId, otherUserId, res);
  });
};

/* ================= SEND MESSAGE ================= */
const sendMessage = async (req, res) => {
  try {
    const { toUserId, text } = req.body;
    const fromUser = req.user._id;

    const message = await saveMessage({ fromUser, toUserId, text });
    pushMessage(fromUser, toUserId, message);

    res.json({ message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Message sending failed" });
  }
};

/* ================= TYPING ================= */
const typing = (req, res) => {
  try {
    sendTyping(req.user._id, req.body.toUserId, "typing");
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
};

const stopTyping = (req, res) => {
  try {
    sendTyping(req.user._id, req.body.toUserId, "stop_typing");
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
};

/* ================= VOICE ================= */
const sendVoice = async (req, res) => {
  try {
    if (!req.file || !req.file.path)
      return res.status(400).json({ error: "No audio file uploaded" });

    const message = await Message.create({
      fromUser: req.user._id,
      toUser: req.body.toUserId,
      audio: req.file.path,
      type: "voice",
    });

    pushMessage(req.user._id, req.body.toUserId, message);
    res.json({ message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Voice note upload failed" });
  }
};

/* ================= EXPORT ================= */
module.exports = {
  streamChat,
  sendMessage,
  typing,
  stopTyping,
  sendVoice,
};

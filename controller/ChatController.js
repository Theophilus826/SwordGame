const mongoose = require("mongoose");
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

// Validate Mongo ID
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// Normalize file URL (local + cloud)
const buildFileUrl = (file) => {
  if (!file) return null;

  return (
    file.secure_url || // cloudinary
    `${process.env.BASE_URL}/${file.path.replace(/\\/g, "/")}` // local
  );
};

// Get chat messages
const getMessages = async (userId, otherUserId) => {
  try {
    return await Message.find({
      $or: [
        { fromUser: userId, toUser: otherUserId },
        { fromUser: otherUserId, toUser: userId },
      ],
    }).sort({ createdAt: 1 });
  } catch (err) {
    console.error("GET MESSAGES ERROR:", err);
    return [];
  }
};

/* ================= SSE STREAM ================= */

const streamChat = async (req, res) => {
  try {
    const { userId, otherUserId } = req.params;

    if (!isValidId(userId) || !isValidId(otherUserId)) {
      return res.status(400).end();
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    // Online status
    setOnline(userId);
    broadcastStatus(userId, "online");

    // Register client
    addClient(userId, otherUserId, res);

    // Initial messages
    const messages = await getMessages(userId, otherUserId);

    res.write(`data: ${JSON.stringify({ type: "init", messages })}\n\n`);

    // Send current status
    res.write(
      `data: ${JSON.stringify({
        type: "status",
        userId: otherUserId,
        status: isOnline(otherUserId) ? "online" : "offline",
      })}\n\n`
    );

    // Keep-alive ping
    const keepAlive = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);
    }, 25000);

    // Cleanup on disconnect
    req.on("close", () => {
      clearInterval(keepAlive);
      setOffline(userId);
      broadcastStatus(userId, "offline");
      removeClient(userId, otherUserId, res);
      res.end();
    });
  } catch (err) {
    console.error("SSE ERROR:", err);
    res.end();
  }
};

/* ================= SEND TEXT ================= */

const sendMessage = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { toUserId, text } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!toUserId || !text?.trim()) {
      return res.status(400).json({ error: "Missing fields" });
    }

    if (!isValidId(toUserId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const message = await Message.create({
      fromUser: userId,
      toUser: toUserId,
      text: text.trim(),
      message: text.trim(), // backward compatibility
      type: "text",
      status: "sent",
    });

    pushMessage(userId, toUserId, message);

    res.json({ message });
  } catch (err) {
    console.error("SEND MESSAGE ERROR:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
};

/* ================= TYPING ================= */

const typing = (req, res) => {
  try {
    const userId = req.user?._id;
    const { toUserId } = req.body;

    if (!userId || !toUserId) {
      return res.sendStatus(400);
    }

    sendTyping(userId, toUserId, "typing");
    res.sendStatus(200);
  } catch (err) {
    console.error("TYPING ERROR:", err);
    res.sendStatus(500);
  }
};

const stopTyping = (req, res) => {
  try {
    const userId = req.user?._id;
    const { toUserId } = req.body;

    if (!userId || !toUserId) {
      return res.sendStatus(400);
    }

    sendTyping(userId, toUserId, "stop_typing");
    res.sendStatus(200);
  } catch (err) {
    console.error("STOP TYPING ERROR:", err);
    res.sendStatus(500);
  }
};

/* ================= SEND VOICE ================= */

const sendVoice = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { toUserId, duration } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No audio uploaded" });
    }

    if (!toUserId || !isValidId(toUserId)) {
      return res.status(400).json({ error: "Invalid receiver" });
    }

    const audioUrl = buildFileUrl(req.file);

    const message = await Message.create({
      fromUser: userId,
      toUser: toUserId,
      audio: audioUrl,
      duration: Number(duration) || 0,
      type: "voice",
      status: "sent",
    });

    pushMessage(userId, toUserId, message);

    res.json({ message });
  } catch (err) {
    console.error("VOICE ERROR:", err);
    res.status(500).json({ error: "Voice upload failed" });
  }
};

/* ================= SEND IMAGE ================= */

const sendMedia = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { toUserId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    if (!toUserId || !isValidId(toUserId)) {
      return res.status(400).json({ error: "Invalid receiver" });
    }

    const imageUrl = buildFileUrl(req.file);

    const message = await Message.create({
      fromUser: userId,
      toUser: toUserId,
      image: imageUrl,
      type: "image",
      status: "sent",
    });

    pushMessage(userId, toUserId, message);

    res.json({ message });
  } catch (err) {
    console.error("IMAGE ERROR:", err);
    res.status(500).json({ error: "Image upload failed" });
  }
};

/* ================= EXPORT ================= */

module.exports = {
  streamChat,
  sendMessage,
  typing,
  stopTyping,
  sendVoice,
  sendMedia,
};

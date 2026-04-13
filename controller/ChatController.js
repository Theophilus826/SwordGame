const mongoose = require("mongoose");
const Message = require("../models/Message");
const Notification = require("../models/Notification"); // ✅ NEW

const {
  addClient,
  removeClient,
  pushMessage,
  sendTyping,
  setOnline,
  setOffline,
  isOnline,
  broadcastStatus,
  pushNotification, // ✅ NEW (you must add this in SSE config)
} = require("../config/sse");

/* ================= HELPERS ================= */

// Validate Mongo ID
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// Normalize file URL
const buildFileUrl = (file) => {
  if (!file) return null;

  return (
    file.secure_url ||
    `${process.env.BASE_URL}/${file.path.replace(/\\/g, "/")}`
  );
};

// Create notification message text
const buildNotificationMessage = (senderName, type) => {
  switch (type) {
    case "text":
      return `💬 New message from ${senderName}`;
    case "voice":
      return `🎤 Voice message from ${senderName}`;
    case "image":
      return `🖼️ Image from ${senderName}`;
    default:
      return `New message from ${senderName}`;
  }
};

// Create + push notification
const createNotification = async ({ receiverId, sender, type }) => {
  try {
    const messageText = buildNotificationMessage(sender.name, type);

    const notification = await Notification.create({
      user: receiverId,
      message: messageText,
      type: "chat",
      chatUserId: sender._id,
    });

    // 🔥 PUSH REAL-TIME NOTIFICATION
    pushNotification(receiverId, notification);

  } catch (err) {
    console.error("NOTIFICATION ERROR:", err);
  }
};

// Get messages
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

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

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

    const keepAlive = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);
    }, 25000);

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

    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!toUserId || !text?.trim())
      return res.status(400).json({ error: "Missing fields" });
    if (!isValidId(toUserId))
      return res.status(400).json({ error: "Invalid user ID" });

    const message = await Message.create({
      fromUser: userId,
      toUser: toUserId,
      text: text.trim(),
      type: "text",
      status: "sent",
    });

    pushMessage(userId, toUserId, message);

    // 🔔 NOTIFICATION
    await createNotification({
      receiverId: toUserId,
      sender: req.user,
      type: "text",
    });

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

    if (!userId || !toUserId) return res.sendStatus(400);

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

    if (!userId || !toUserId) return res.sendStatus(400);

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

    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.file)
      return res.status(400).json({ error: "No audio uploaded" });
    if (!toUserId || !isValidId(toUserId))
      return res.status(400).json({ error: "Invalid receiver" });

    const message = await Message.create({
      fromUser: userId,
      toUser: toUserId,
      audio: buildFileUrl(req.file),
      duration: Number(duration) || 0,
      type: "voice",
      status: "sent",
    });

    pushMessage(userId, toUserId, message);

    await createNotification({
      receiverId: toUserId,
      sender: req.user,
      type: "voice",
    });

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

    if (!userId) return res.status(401).json({ error: "Unauthorized" });
    if (!req.file)
      return res.status(400).json({ error: "No file uploaded" });
    if (!toUserId || !isValidId(toUserId))
      return res.status(400).json({ error: "Invalid receiver" });

    const message = await Message.create({
      fromUser: userId,
      toUser: toUserId,
      image: buildFileUrl(req.file),
      type: "image",
      status: "sent",
    });

    pushMessage(userId, toUserId, message);

    await createNotification({
      receiverId: toUserId,
      sender: req.user,
      type: "image",
    });

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

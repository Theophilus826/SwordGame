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
async function getMessages(userId, otherUserId) {
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
}

async function saveMessage({ fromUser, toUserId, text }) {
  try {
    return await Message.create({
      fromUser,
      toUser: toUserId,
      text,
      message: text, // backward compatibility
      type: "text",
      status: "sent",
    });
  } catch (err) {
    console.error("SAVE MESSAGE ERROR:", err);
    throw err;
  }
}

/* ================= STREAM (SSE) ================= */
const streamChat = async (req, res) => {
  try {
    const { userId, otherUserId } = req.params;

    // ✅ Validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(otherUserId)
    ) {
      return res.status(400).end();
    }

    // ✅ SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // ✅ Prevent buffering (important for Render)
    res.flushHeaders?.();

    // ✅ Mark user online
    setOnline(userId);
    broadcastStatus(userId, "online");

    // ✅ Register client
    addClient(userId, otherUserId, res);

    // ✅ Send previous messages
    const messages = await getMessages(userId, otherUserId);

    res.write(
      `data: ${JSON.stringify({ type: "init", messages })}\n\n`
    );

    // ✅ Send current status
    res.write(
      `data: ${JSON.stringify({
        type: "status",
        userId: otherUserId,
        status: isOnline(otherUserId) ? "online" : "offline",
      })}\n\n`
    );

    // ✅ Keep connection alive (VERY IMPORTANT for SSE)
    const keepAlive = setInterval(() => {
      res.write(`data: ${JSON.stringify({ type: "ping" })}\n\n`);
    }, 25000);

    // ✅ Handle disconnect
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

/* ================= SEND MESSAGE ================= */
const sendMessage = async (req, res) => {
  try {
    // ✅ Auth check
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { toUserId, text } = req.body;

    // ✅ Validate input
    if (!toUserId || !text || !text.trim()) {
      return res.status(400).json({ error: "Missing message data" });
    }

    // ✅ Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(toUserId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const fromUser = req.user._id;

    const message = await saveMessage({
      fromUser,
      toUserId,
      text: text.trim(),
    });

    // ✅ Push to SSE clients
    pushMessage(fromUser, toUserId, message);

    res.status(200).json({ message });
  } catch (err) {
    console.error("SEND MESSAGE ERROR:", err);
    res.status(500).json({ error: "Message sending failed" });
  }
};

/* ================= TYPING ================= */
const typing = (req, res) => {
  try {
    if (!req.user?._id || !req.body.toUserId) {
      return res.sendStatus(400);
    }

    sendTyping(req.user._id, req.body.toUserId, "typing");
    res.sendStatus(200);
  } catch (err) {
    console.error("TYPING ERROR:", err);
    res.sendStatus(500);
  }
};

const stopTyping = (req, res) => {
  try {
    if (!req.user?._id || !req.body.toUserId) {
      return res.sendStatus(400);
    }

    sendTyping(req.user._id, req.body.toUserId, "stop_typing");
    res.sendStatus(200);
  } catch (err) {
    console.error("STOP TYPING ERROR:", err);
    res.sendStatus(500);
  }
};

/* ================= VOICE ================= */
const sendVoice = async (req, res) => {
  try {
    if (!req.user?._id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!req.file || !req.file.path) {
      return res.status(400).json({ error: "No audio file uploaded" });
    }

    if (!req.body.toUserId) {
      return res.status(400).json({ error: "Missing receiver" });
    }

    if (!mongoose.Types.ObjectId.isValid(req.body.toUserId)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    const message = await Message.create({
      fromUser: req.user._id,
      toUser: req.body.toUserId,
      audio: req.file.path,
      type: "voice",
      status: "sent",
    });

    pushMessage(req.user._id, req.body.toUserId, message);

    res.status(200).json({ message });
  } catch (err) {
    console.error("VOICE ERROR:", err);
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

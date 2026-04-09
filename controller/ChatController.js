const {
  addClient,
  removeClient,
  pushMessage,
  sendTyping,
  setOnline,
  setOffline,
  isOnline,
  broadcastStatus,
} = require("../utils/sse");

/* ================= STREAM ================= */
exports.streamChat = async (req, res) => {
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
exports.sendMessage = async (req, res) => {
  const { toUserId, text } = req.body;
  const fromUser = req.user._id;

  const message = await saveMessage({ fromUser, toUserId, text });

  pushMessage(fromUser, toUserId, message);

  res.json({ message });
};

/* ================= TYPING ================= */
exports.typing = (req, res) => {
  sendTyping(req.user._id, req.body.toUserId, "typing");
  res.sendStatus(200);
};

exports.stopTyping = (req, res) => {
  sendTyping(req.user._id, req.body.toUserId, "stop_typing");
  res.sendStatus(200);
};

/* ================= VOICE ================= */
exports.sendVoice = async (req, res) => {
  try {
    const audioUrl = req.file.path; // ✅ Cloudinary URL

    const message = await Message.create({
      fromUser: req.user._id,
      toUser: req.body.toUserId,
      audio: audioUrl,
      type: "voice",
    });

    pushMessage(req.user._id, req.body.toUserId, message);

    res.json({ message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Upload failed" });
  }
};

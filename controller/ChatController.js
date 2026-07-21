const mongoose = require("mongoose");
const Message = require("../models/Message");
const User = require("../models/UserModels");

const {
  addClient,
  removeClient,
  pushMessage,
  pushMessageEvent,
  sendTyping,
  setOnline,
  setOffline,
  isOnline,
  broadcastStatus,
} = require("../config/sse");

// ✅ NEW (centralized notification system)
const {
  notifyChatMessage,
} = require("../config/NotificationService");

/* ================= HELPERS ================= */

// Validate Mongo ID
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// Normalize file URL
const buildFileUrl = (file) => {
  if (!file) return null;

  // Cloudinary already returns full URL
  if (file.secure_url) return file.secure_url;

  if (file.path && file.path.startsWith("http")) {
    return file.path; // 🔥 FIX: avoid prefixing
  }

  const cleanPath = file.path?.replace(/\\/g, "/");

  return `${process.env.BASE_URL}/${cleanPath}`;
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

    if (!req.user || !userId) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    if (!toUserId || !text?.trim()) {
      return res.status(400).json({
        error: "Missing fields",
      });
    }

    if (!isValidId(toUserId)) {
      return res.status(400).json({
        error: "Invalid user ID",
      });
    }

    // prevent self messaging
    if (userId.toString() === toUserId) {
      return res.status(400).json({
        error: "Cannot message yourself",
      });
    }

    const sender = await User.findById(userId);

    const receiver = await User.findById(
      toUserId
    );

    if (!sender || !receiver) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    // helper
    const hasContact = (contacts, id) => {
      return contacts.some(
        (c) => c.toString() === id.toString()
      );
    };

    // allow admin OR existing contacts
    const isAllowed =
      sender.isAdmin ||
      hasContact(sender.contacts, toUserId);

    if (!isAllowed) {
      return res.status(403).json({
        error:
          "User not in your contacts",
      });
    }

    // auto-add both users
    if (
      !hasContact(sender.contacts, toUserId)
    ) {
      sender.contacts.push(toUserId);
      await sender.save();
    }

    if (
      !hasContact(
        receiver.contacts,
        userId
      )
    ) {
      receiver.contacts.push(userId);
      await receiver.save();
    }

    // create message
    const newMessage =
      await Message.create({
        fromUser: userId,
        toUser: toUserId,
        text: text.trim(),
        type: "text",
        status: "sent",
      });

    // populate sender/receiver
    const populatedMessage =
      await Message.findById(
        newMessage._id
      )
        .populate(
          "fromUser",
          "_id name avatar"
        )
        .populate(
          "toUser",
          "_id name avatar"
        );

    // realtime chat
    pushMessage(
      userId,
      toUserId,
      populatedMessage
    );

    // notification
    await notifyChatMessage({
      receiverId: toUserId,
      sender: req.user,
      messageType: "text",
    });

    res.json({
      success: true,
      message: populatedMessage,
    });
  } catch (err) {
    console.error(
      "SEND MESSAGE ERROR:",
      err
    );

    res.status(500).json({
      error: "Failed to send message",
    });
  }
};

/* ================= DELETE MESSAGE ================= */

const deleteMessage = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { messageId } = req.params;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    if (!messageId || !isValidId(messageId)) {
      return res.status(400).json({ error: "Invalid message id" });
    }

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    // only sender can delete their message
    if (message.fromUser.toString() !== userId.toString()) {
      return res.status(403).json({ error: "Not authorized to delete this message" });
    }

    const fromUser = message.fromUser.toString();
    const toUser = message.toUser.toString();

    await Message.findByIdAndDelete(messageId);

    // notify SSE clients in this chat
    pushMessageEvent(fromUser, toUser, {
      type: "message_deleted",
      scope: "dm",
      messageId,
    });

    res.json({ success: true, messageId });
  } catch (err) {
    console.error("DELETE MESSAGE ERROR:", err);
    res.status(500).json({ error: "Failed to delete message" });
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

    const { toUserId, duration } =
      req.body;

    if (!req.user || !userId) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "No audio uploaded",
      });
    }

    if (
      !toUserId ||
      !isValidId(toUserId)
    ) {
      return res.status(400).json({
        error: "Invalid receiver",
      });
    }

    // prevent self messaging
    if (userId.toString() === toUserId) {
      return res.status(400).json({
        error: "Cannot message yourself",
      });
    }

    const sender = await User.findById(
      userId
    );

    const receiver =
      await User.findById(toUserId);

    if (!sender || !receiver) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    // helper
    const hasContact = (contacts, id) => {
      return contacts.some(
        (c) => c.toString() === id.toString()
      );
    };

    // allow admin OR contacts
    const isAllowed =
      sender.isAdmin ||
      hasContact(
        sender.contacts,
        toUserId
      );

    if (!isAllowed) {
      return res.status(403).json({
        error:
          "User not in your contacts",
      });
    }

    // auto-add both users
    if (
      !hasContact(
        sender.contacts,
        toUserId
      )
    ) {
      sender.contacts.push(toUserId);
      await sender.save();
    }

    if (
      !hasContact(
        receiver.contacts,
        userId
      )
    ) {
      receiver.contacts.push(userId);
      await receiver.save();
    }

    // Build file URL - handle both Cloudinary and local uploads
    let audioUrl;
    if (req.file.secure_url) {
      // Cloudinary response
      audioUrl = req.file.secure_url;
    } else if (req.file.path) {
      // Local/other storage
      audioUrl = buildFileUrl(req.file);
    } else {
      console.error("AUDIO FILE OBJECT:", req.file);
      return res.status(400).json({
        error: "File upload incomplete - no URL returned",
      });
    }

    // create voice message
    const newMessage =
      await Message.create({
        fromUser: userId,
        toUser: toUserId,
        audio: audioUrl,
        duration:
          Number(duration) || 0,
        type: "voice",
        status: "sent",
      });

    // populate users
    const populatedMessage =
      await Message.findById(
        newMessage._id
      )
        .populate(
          "fromUser",
          "_id name avatar"
        )
        .populate(
          "toUser",
          "_id name avatar"
        );

    // realtime push
    pushMessage(
      userId,
      toUserId,
      populatedMessage
    );

    // notification
    await notifyChatMessage({
      receiverId: toUserId,
      sender: req.user,
      messageType: "voice",
    });

    res.json({
      success: true,
      message: populatedMessage,
    });
  } catch (err) {
    console.error(
      "VOICE ERROR:",
      err
    );

    res.status(500).json({
      error: "Voice upload failed",
    });
  }
};

/* ================= SEND IMAGE ================= */

const sendMedia = async (req, res) => {
  try {
    const userId = req.user?._id;

    const { toUserId } = req.body;

    if (!req.user || !userId) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded",
      });
    }

    if (
      !toUserId ||
      !isValidId(toUserId)
    ) {
      return res.status(400).json({
        error: "Invalid receiver",
      });
    }

    // prevent self messaging
    if (userId.toString() === toUserId) {
      return res.status(400).json({
        error: "Cannot message yourself",
      });
    }

    const sender = await User.findById(
      userId
    );

    const receiver =
      await User.findById(toUserId);

    if (!sender || !receiver) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    // helper
    const hasContact = (contacts, id) => {
      return contacts.some(
        (c) => c.toString() === id.toString()
      );
    };

    // allow admin OR contacts
    const isAllowed =
      sender.isAdmin ||
      hasContact(
        sender.contacts,
        toUserId
      );

    if (!isAllowed) {
      return res.status(403).json({
        error:
          "User not in your contacts",
      });
    }

    // auto-add both users
    if (
      !hasContact(
        sender.contacts,
        toUserId
      )
    ) {
      sender.contacts.push(toUserId);

      await sender.save();
    }

    if (
      !hasContact(
        receiver.contacts,
        userId
      )
    ) {
      receiver.contacts.push(userId);

      await receiver.save();
    }

    // Build file URL - handle both Cloudinary and local uploads
    let imageUrl;
    if (req.file.secure_url) {
      // Cloudinary response
      imageUrl = req.file.secure_url;
    } else if (req.file.path) {
      // Local/other storage
      imageUrl = buildFileUrl(req.file);
    } else {
      console.error("FILE OBJECT:", req.file);
      return res.status(400).json({
        error: "File upload incomplete - no URL returned",
      });
    }

    // create image message
    const newMessage =
      await Message.create({
        fromUser: userId,
        toUser: toUserId,
        image: imageUrl,
        type: "image",
        status: "sent",
      });

    // populate users
    const populatedMessage =
      await Message.findById(
        newMessage._id
      )
        .populate(
          "fromUser",
          "_id name avatar"
        )
        .populate(
          "toUser",
          "_id name avatar"
        );

    // realtime push
    pushMessage(
      userId,
      toUserId,
      populatedMessage
    );

    // notification
    await notifyChatMessage({
      receiverId: toUserId,
      sender: req.user,
      messageType: "image",
    });

    res.json({
      success: true,
      message: populatedMessage,
    });
  } catch (err) {
    console.error(
      "IMAGE ERROR:",
      err
    );

    res.status(500).json({
      error: "Image upload failed",
    });
  }
};

/* ================= EXPORT ================= */

module.exports = {
  streamChat,
  sendMessage,
  deleteMessage,
  typing,
  stopTyping,
  sendVoice,
  sendMedia,
};

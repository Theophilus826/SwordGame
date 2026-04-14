const Notification = require("../models/Notification");
const User = require("../models/UserModels");
const mongoose = require("mongoose");

const { pushNotification } = require("../config/sse");

/* =========================
   HELPERS
========================= */

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/* =========================
   AUTO MESSAGE BUILDER
========================= */

const buildMessage = ({ type, senderName }) => {
  switch (type) {
    case "like":
      return `👍 ${senderName} liked your post`;
    case "love":
      return `❤️ ${senderName} loved your post`;
    case "chat":
      return `💬 New message from ${senderName}`;
    case "comment":
      return `💬 ${senderName} commented on your post`;
    default:
      return `🔔 New notification from ${senderName}`;
  }
};

/* =========================
   CORE NOTIFY FUNCTION
========================= */

const notify = async ({
  user,
  sender,
  type = "system",
  message,
  postId = null,
  chatUserId = null,
}) => {
  try {
    if (!user) return;

    const senderName = sender?.name || "Someone";

    const finalMessage =
      message || buildMessage({ type, senderName });

    const notification = await Notification.create({
      user,
      sender: sender?._id || null,
      type,
      message: finalMessage,
      postId,
      chatUserId: chatUserId || sender?._id || null,
      read: false,
    });

    // ✅ IMPORTANT FIX: ensure string ID
    pushNotification(String(user), notification);

    return notification;
  } catch (err) {
    console.error("NOTIFY ERROR:", err);
  }
};

/* =========================
   SEND TO ONE USER
========================= */

const sendNotification = async (req, res) => {
  try {
    const { userId, message, type = "system", postId } = req.body;

    if (!userId || !isValidId(userId)) {
      return res.status(400).json({ message: "Valid userId required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const notification = await notify({
      user: user._id,
      sender: req.user,
      type,
      message,
      postId,
    });

    res.status(201).json({
      message: "Notification sent",
      notification,
    });
  } catch (err) {
    console.error("SEND ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   SEND TO ALL USERS
========================= */

const sendNotificationToAll = async (req, res) => {
  try {
    const { message, type = "system" } = req.body;

    if (!message) {
      return res.status(400).json({ message: "Message required" });
    }

    const users = await User.find({}, "_id");

    // ⚡ Better performance + safe handling
    await Promise.all(
      users.map((u) =>
        notify({
          user: u._id,
          sender: req.user,
          type,
          message,
        })
      )
    );

    res.json({
      message: `Sent to ${users.length} users`,
    });
  } catch (err) {
    console.error("SEND ALL ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   GET USER NOTIFICATIONS
========================= */

const getUserNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      user: req.user._id,
    }).sort({ createdAt: -1 });

    res.json(notifications);
  } catch (err) {
    console.error("FETCH ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   MARK AS READ
========================= */

const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const notification = await Notification.findOneAndUpdate(
      { _id: id, user: req.user._id },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json(notification);
  } catch (err) {
    console.error("MARK READ ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   DELETE NOTIFICATION
========================= */

const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    const notification = await Notification.findOneAndDelete({
      _id: id,
      user: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   EXPORTS
========================= */

module.exports = {
  sendNotification,
  sendNotificationToAll,
  getUserNotifications,
  markAsRead,
  deleteNotification,
  notify,
};

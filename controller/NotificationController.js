const Notification = require("../models/Notification");
const User = require("../models/UserModels");
const mongoose = require("mongoose");

const { pushNotification } = require("../config/sse"); // ✅ REAL-TIME

/* =========================
   HELPERS
========================= */

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const buildMessage = (message, type, senderName) => {
  if (message) return message;

  switch (type) {
    case "like":
      return `👍 ${senderName} liked your post`;
    case "love":
      return `❤️ ${senderName} loved your post`;
    case "chat":
      return `💬 New message from ${senderName}`;
    default:
      return "🔔 New notification";
  }
};

/* =========================
   SEND TO ONE USER
========================= */
exports.sendNotification = async (req, res) => {
  try {
    const { userId, message, type = "system", postId = null } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (!isValidId(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const senderName = req.user?.name || "Someone";

    const notification = await Notification.create({
      user: user._id,
      message: buildMessage(message, type, senderName),
      type,
      postId,
      chatUserId: req.user?._id || null,
      read: false,
    });

    // 🔥 REAL-TIME PUSH
    pushNotification(userId, notification);

    res.status(201).json({
      message: "Notification sent",
      notification,
    });
  } catch (err) {
    console.error("❌ Send error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   SEND TO ALL USERS
========================= */
exports.sendNotificationToAll = async (req, res) => {
  try {
    const { message, type = "system" } = req.body;

    if (!message) {
      return res.status(400).json({ message: "Message is required" });
    }

    const users = await User.find({}, "_id");

    const notifications = users.map((u) => ({
      user: u._id,
      message,
      type,
      read: false,
    }));

    const result = await Notification.insertMany(notifications);

    // 🔥 OPTIONAL: real-time broadcast
    users.forEach((u) => {
      pushNotification(u._id, {
        message,
        type,
      });
    });

    res.json({
      message: `Notification sent to ${users.length} users`,
      count: result.length,
    });
  } catch (err) {
    console.error("❌ Send all error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   GET USER NOTIFICATIONS
========================= */
exports.getUserNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      user: req.user._id,
    }).sort({ createdAt: -1 });

    res.json(notifications);
  } catch (err) {
    console.error("❌ Fetch error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   MARK AS READ
========================= */
exports.markAsRead = async (req, res) => {
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
    console.error("❌ Mark read error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   DELETE NOTIFICATION
========================= */
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid notification ID" });
    }

    const notification = await Notification.findOneAndDelete({
      _id: id,
      user: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json({ message: "Notification deleted successfully" });
  } catch (err) {
    console.error("❌ Delete error:", err);
    res.status(500).json({ message: err.message });
  }
};

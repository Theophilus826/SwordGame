const Notification = require("../models/Notification");
const User = require("../models/UserModels");
const mongoose = require("mongoose");

/* =========================
   SEND TO ONE USER
========================= */
exports.sendNotification = async (req, res) => {
  const { userId, message } = req.body;

  console.log("📥 REQUEST BODY:", req.body);
  console.log("🔐 AUTH USER:", req.user?._id);

  if (!userId || !message) {
    return res.status(400).json({
      message: "User ID and message are required",
    });
  }

  // ✅ Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({
      message: "Invalid user ID",
    });
  }

  try {
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const notification = await Notification.create({
      user: user._id, // ✅ FIXED (no manual ObjectId needed)
      message,
      read: false,
    });

    console.log("✅ SAVED NOTIFICATION:", notification);

    res.status(201).json({
      message: "Notification sent",
      notification,
    });
  } catch (err) {
    console.error("❌ SEND ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   SEND TO ALL USERS
========================= */
exports.sendNotificationToAll = async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ message: "Message is required" });
  }

  try {
    const users = await User.find({}, "_id");

    const notifications = users.map((u) => ({
      user: u._id,
      message,
      read: false,
    }));

    const result = await Notification.insertMany(notifications);

    console.log("✅ SENT TO ALL USERS:", result.length);

    res.json({
      message: `Notification sent to ${users.length} users`,
    });
  } catch (err) {
    console.error("❌ SEND ALL ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   GET USER NOTIFICATIONS
========================= */
exports.getUserNotifications = async (req, res) => {
  try {
    console.log("🔐 FETCH USER:", req.user);
    console.log("🆔 FETCH USER ID:", req.user?._id);

    const notifications = await Notification.find({
      user: mongoose.Types.ObjectId(req.user._id)
    }).sort({ createdAt: -1 });

    console.log("📦 FOUND NOTIFICATIONS:", notifications.length);

    res.json(notifications);
  } catch (err) {
    console.error("❌ FETCH ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   MARK AS READ
========================= */
exports.markAsRead = async (req, res) => {
  try {
    console.log("📌 MARK READ ID:", req.params.id);
    console.log("🔐 USER:", req.user?._id);

    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        message: "Notification not found",
      });
    }

    console.log("✅ UPDATED NOTIFICATION:", notification._id);

    res.json(notification);
  } catch (err) {
    console.error("❌ MARK READ ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

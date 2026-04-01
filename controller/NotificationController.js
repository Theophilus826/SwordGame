const Notification = require("../models/Notification");
const User = require("../models/UserModels");
const mongoose = require("mongoose");

/* =========================
   SEND TO ONE USER
========================= */
exports.sendNotification = async (req, res) => {
  const { userId, message } = req.body;

  if (!userId || !message) {
    return res.status(400).json({ message: "User ID and message are required" });
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: "Invalid user ID" });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const notification = await Notification.create({
      user: user._id,
      message,
      read: false,
    });

    console.log("✅ Notification saved:", notification._id);

    // Removed Socket.IO — frontend will fetch via API
    res.status(201).json({ message: "Notification sent", notification });
  } catch (err) {
    console.error("❌ Send error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   SEND TO ALL USERS
========================= */
exports.sendNotificationToAll = async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ message: "Message is required" });

  try {
    const users = await User.find({}, "_id");

    const notifications = users.map((u) => ({
      user: u._id,
      message,
      read: false,
    }));

    const result = await Notification.insertMany(notifications);
    console.log("✅ Sent to all users:", result.length);

    res.json({ message: `Notification sent to ${users.length} users` });
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
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 });

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
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { read: true },
      { new: true }
    );

    if (!notification) return res.status(404).json({ message: "Notification not found" });

    res.json(notification);
  } catch (err) {
    console.error("❌ Mark read error:", err);
    res.status(500).json({ message: err.message });
  }
};

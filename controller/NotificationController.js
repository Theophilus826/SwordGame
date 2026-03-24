const Notification = require("../models/Notification");
const User = require("../models/UserModels");

// Send notification to a specific user
exports.sendNotification = async (req, res) => {
  const { userId, message } = req.body;

  if (!userId || !message) {
    return res.status(400).json({ message: "User ID and message are required" });
  }

  try {
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const notification = await Notification.create({
      user: userId,
      message,
      read: false,
    });

    res.json({
      message: "Notification sent",
      notification,
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// Send notification to ALL users
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

    await Notification.insertMany(notifications);

    res.json({
      message: `Notification sent to ${users.length} users`,
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// Fetch notifications for logged-in user
exports.getUserNotifications = async (req, res) => {
  try {
    const notifications = await Notification
      .find({ user: req.user._id })
      .sort({ createdAt: -1 });

    res.json(notifications);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// Mark notification as read
exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id }, // 🔒 ensure user owns it
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    res.json(notification);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

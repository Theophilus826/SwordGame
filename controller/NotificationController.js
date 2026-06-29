const mongoose = require("mongoose");
const Notification = require("../models/Notification");
const User = require("../models/UserModels");
const {
  notify,
} = require("../config/NotificationService");
const {
  addNotificationClient,
  removeNotificationClient,
} = require("../config/sse");

/* =========================
   HELPERS
========================= */

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/* =========================
   SEND NOTIFICATION (ADMIN/API)
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
      success: true,
      notification,
    });
  } catch (err) {
    console.error("SEND ERROR:", err.message);
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
      success: true,
      message: `Sent to ${users.length} users`,
    });
  } catch (err) {
    console.error("SEND ALL ERROR:", err.message);
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

    res.json({
      success: true,
      notifications,
    });
  } catch (err) {
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

    res.json({
      success: true,
      notification,
    });
  } catch (err) {
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

    res.json({
      success: true,
      message: "Deleted successfully",
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   SSE STREAM
========================= */
const streamNotifications = async (req, res) => {
  try {
    const token = req.query.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("_id");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    const userId = user._id.toString();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    addNotificationClient(userId, res);

    res.write(
      `data: ${JSON.stringify({
        type: "connected",
      })}\n\n`
    );

    const keepAlive = setInterval(() => {
      res.write(
        `data: ${JSON.stringify({
          type: "ping",
        })}\n\n`
      );
    }, 25000);

    req.on("close", () => {
      clearInterval(keepAlive);
      removeNotificationClient(userId, res);
      res.end();
    });
  } catch (err) {
    console.error("SSE ERROR:", err);

    return res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
};

// saveFcm token
const saveFcmToken = async (req, res) => {
  try {
    const userId = req.user._id;
    const { fcmToken } = req.body;

    if (!fcmToken) {
      return res.status(400).json({ message: "FCM token is required" });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // avoid unnecessary DB writes
    if (user.fcmToken === fcmToken) {
      return res.json({
        success: true,
        message: "FCM token already saved",
      });
    }

    user.fcmToken = fcmToken;
    await user.save();

    res.json({
      success: true,
      message: "FCM token saved successfully",
    });
  } catch (err) {
    console.error("SAVE FCM ERROR:", err.message);
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
  streamNotifications,
  saveFcmToken,
};

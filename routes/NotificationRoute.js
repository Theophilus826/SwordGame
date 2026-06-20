const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/AuthMiddleware");
const User = require("../models/UserModels");
const admin = require("../config/firebase");
const {
  sendNotification,
  sendNotificationToAll,
  getUserNotifications,
  markAsRead,
  deleteNotification,
  streamNotifications, // ✅ NEW
   saveFcmToken, // ✅ NEW
} = require("../controller/NotificationController");

/* ==========================
   SSE (MUST BE FIRST)
========================== */

// 🔔 Real-time notifications stream
router.get("/stream", protect, streamNotifications);

/* ==========================
   REST ROUTES
========================== */

// Get user notifications
router.get("/", protect, getUserNotifications);

// Send single notification
router.post("/", protect, sendNotification);

// Broadcast to all users
router.post("/broadcast", protect, sendNotificationToAll);

// Mark as read
router.put("/:id/read", protect, markAsRead);

// Delete notification
router.delete("/:id", protect, deleteNotification);

// Save FCM token
router.post("/fcm-token", protect, saveFcmToken);

router.post("/test-push", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("fcmToken");

    console.log("👤 USER:", user._id);
    console.log("📱 TOKEN:", user.fcmToken);

    if (!user.fcmToken) {
      return res.status(400).json({
        success: false,
        message: "No FCM token found",
      });
    }

    const result = await admin.messaging().send({
      token: user.fcmToken,

      notification: {
        title: "Test Notification (API)",
        body: "If you see this, route works",
      },

      android: {
        priority: "high",
      },
    });

    res.json({
      success: true,
      result,
    });
  } catch (err) {
    console.error("TEST PUSH ERROR:", err);

    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;

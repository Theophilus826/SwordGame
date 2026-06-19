const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/AuthMiddleware");

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

router.post("/test-push", async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    const result = await admin.messaging().send({
      token: user.fcmToken,

      notification: {
        title: "Test Notification",
        body: "If you see this, FCM works.",
      },

      data: {
        type: "system",
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
    console.error(err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;

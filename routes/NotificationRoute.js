const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/AuthMiddleware");
const User = require("../models/UserModels");
const admin = require("../config/firebase");

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

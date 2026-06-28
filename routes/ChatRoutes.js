const express = require("express");
const router = express.Router();

const chatController = require("../controller/ChatController");
const notificationController = require("../controller/NotificationController");

const { protect } = require("../middleware/AuthMiddleware");
const upload = require("../middleware/Upload");

/* ==========================
   SSE STREAMS
========================== */

// 🔥 Chat stream (conversation-based)
router.get(
  "/stream/:userId/:otherUserId",
  chatController.streamChat
);

// 🔔 Notification stream (user-based)
router.get(
  "/notifications/stream",
  protect,
  notificationController.streamNotifications
);

/* ==========================
   MESSAGES
========================== */

// 💬 Send text message
router.post(
  "/messages",
  protect,
  chatController.sendMessage
);

// 🗑️ Delete message
router.delete(
  "/messages/:messageId",
  protect,
  chatController.deleteMessage
);

// 🎤 Send voice message (FIXED + CLEAN)
router.post(
  "/messages/voice",
  protect,
  (req, res, next) => {
    upload.single("audio")(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || "Audio upload failed",
        });
      }
      next();
    });
  },
  chatController.sendVoice
);

// 🖼️ Send image/media (FIXED SYNTAX BUG)
router.post(
  "/messages/media",
  protect,
  (req, res, next) => {
    upload.single("image")(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || "Image upload failed",
        });
      }
      next();
    });
  },
  chatController.sendMedia
);

/* ==========================
   TYPING INDICATORS
========================== */

// ✍️ User typing
router.post(
  "/typing",
  protect,
  chatController.typing
);

// ⛔ Stop typing
router.post(
  "/typing/stop",
  protect,
  chatController.stopTyping
);

module.exports = router;

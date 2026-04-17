// ==========================
// ChatRoutes.js
// ==========================

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
  protect,
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

// 🎤 Send voice message
router.post(
  "/messages/voice",
  protect,
  upload.single("audio"),
  chatController.sendVoice
);

// 🖼️ Send image/media
router.post(
  "/messages/media",
  protect,
  upload.single("image"),
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

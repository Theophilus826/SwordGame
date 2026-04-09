// ==========================
// ChatRoutes.js
// ==========================

const express = require("express");
const router = express.Router();
const chatController = require("../controller/ChatController"); // corrected path
const { protect } = require("../middleware/AuthMiddleware"); // only the protect middleware
const upload = require("../middleware/Upload");

// ==========================
// SSE - Stream Chat
// ==========================
router.get("/stream/:userId/:otherUserId", chatController.streamChat);

// ==========================
// CHAT - Send Text Message
// ==========================
router.post("/send", protect, chatController.sendMessage);

// ==========================
// TYPING - Typing Indicators
// ==========================
router.post("/typing", protect, chatController.typing);
router.post("/stop-typing", protect, chatController.stopTyping);

// ==========================
// VOICE - Send Voice Notes
// ==========================
router.post(
  "/voice",
  protect,
  upload.single("audio"),
  chatController.sendVoice
);

module.exports = router;

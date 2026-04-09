// ==========================
// ChatRoutes.js
// ==========================

const express = require("express");
const router = express.Router();
const chatController = require("../controller/ChatController"); // corrected path
const auth = require("../middleware/AuthMiddleware");
const upload = require("../middleware/Upload");

// ==========================
// SSE - Stream Chat
// ==========================
router.get("/stream/:userId/:otherUserId", chatController.streamChat);

// ==========================
// CHAT - Send Text Message
// ==========================
router.post("/send", auth, chatController.sendMessage);

// ==========================
// TYPING - Typing Indicators
// ==========================
router.post("/typing", auth, chatController.typing);
router.post("/stop-typing", auth, chatController.stopTyping);

// ==========================
// VOICE - Send Voice Notes
// ==========================
router.post(
  "/voice",
  auth,
  upload.single("audio"),
  chatController.sendVoice
);

module.exports = router;

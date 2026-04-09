// routes/ChatRoutes.js
const express = require("express");
const router = express.Router();
const chatController = require("../controller/ChatController");
const auth = require("../middleware/AuthMiddleware");
const upload = require("../middleware/Upload"); // multer for voice notes

/* ================= SSE STREAM ================= */
router.get(
  "/stream/:userId/:otherUserId",
  auth, // Optional: only allow logged-in users
  chatController.streamChat
);

/* ================= SEND MESSAGE ================= */
router.post("/send", auth, chatController.sendMessage);

/* ================= TYPING ================= */
router.post("/typing", auth, chatController.typing);
router.post("/stop-typing", auth, chatController.stopTyping);

/* ================= VOICE NOTE ================= */
router.post(
  "/voice",
  auth,
  upload.single("audio"),
  chatController.sendVoice
);

module.exports = router;

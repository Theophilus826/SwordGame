const express = require("express");
const router = express.Router();
const chatController = require("../controller/ChatController");
const auth = require("../middleware/AuthMiddleware");
const upload = require("../middleware/Upload");

/* ================= SSE ================= */
router.get("/stream/:userId/:otherUserId", chatController.streamChat);

/* ================= CHAT ================= */
router.post("/send", auth, chatController.sendMessage);

/* ================= TYPING ================= */
router.post("/typing", auth, chatController.typing);
router.post("/stop-typing", auth, chatController.stopTyping);

/* ================= VOICE ================= */
router.post(
  "/voice",
  auth,
  upload.single("audio"),
  chatController.sendVoice
);
module.exports = router;

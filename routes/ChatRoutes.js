const express = require("express");
const router = express.Router();
const chatController = require("../controllers/ChatController"); // make sure path is correct
const auth = require("../middleware/AuthMiddleware");
const upload = require("../middleware/Upload");

router.get("/stream/:userId/:otherUserId", auth, chatController.streamChat);
router.post("/send", auth, chatController.sendMessage);
router.post("/typing", auth, chatController.typing);
router.post("/stop-typing", auth, chatController.stopTyping);
router.post("/voice", auth, upload.single("audio"), chatController.sendVoice);

module.exports = router;

const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/AuthMiddleware");

const {
  sendNotification,
  sendNotificationToAll,
  getUserNotifications,
  markAsRead, deleteNotification
} = require("../controller/NotificationController");

router.get("/", protect, getUserNotifications);
router.post("/", protect, sendNotification);
router.post("/broadcast", protect, sendNotificationToAll);
router.put("/:id/read", protect, markAsRead);
router.delete("/:id", protect, deleteNotification);
module.exports = router;

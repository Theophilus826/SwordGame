const express = require("express");
const router = express.Router();

const { protect, admin } = require("../middleware/AuthMiddleware");
const upload = require("../middleware/Upload"); // multer middleware

const {
  createTask,
  getTasks,
  getMyTasks,
  updateTask,
  deleteTask,
  rewardUser,
  getTaskProgress,
} = require("../controller/ShareTaskController");

/* =========================================
   USER ROUTES
========================================= */

// Get all active tasks
router.get("/tasks", protect, getTasks);

// Logged-in user's progress
router.get("/tasks/my", protect, getMyTasks);

/* =========================================
   ADMIN ROUTES
========================================= */

// Create task with image upload
router.post(
  "/tasks",
  protect,
  admin,
  upload.single("image"),
  createTask
);

// Task progress
router.get(
  "/tasks/:id/progress",
  protect,
  admin,
  getTaskProgress
);

// Reward user
router.post(
  "/tasks/:id/reward",
  protect,
  admin,
  rewardUser
);

// Update task (allow replacing image)
router.put(
  "/tasks/:id",
  protect,
  admin,
  upload.single("image"),
  updateTask
);

// Delete task
router.delete(
  "/tasks/:id",
  protect,
  admin,
  deleteTask
);

module.exports = router;

const express = require("express");
const router = express.Router();

const { protect, admin } = require("../middleware/AuthMiddleware");

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

// Create task
router.post("/tasks", protect, admin, createTask);

// Task progress
router.get(
  "/tasks/:id/progress",
  protect,
  admin,
  getTaskProgress
);

// Reward a completed task
router.post(
  "/tasks/:id/reward",
  protect,
  admin,
  rewardUser
);

// Update task
router.put(
  "/tasks/:id",
  protect,
  admin,
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

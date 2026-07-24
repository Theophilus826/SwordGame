const ShareTask = require("../models/ShareTaskModel");
const UserShareTask = require("../models/UserShareTaskModel");
const User = require("../models/UserModels");

/*
 * Track a user's progress on active share tasks.
 */
const trackShareTask = async ({
  userId,
  recipientId,
  messageId = null,
  type = "text", // text | image | voice
  text = "",
}) => {
  try {
    const tasks = await ShareTask.find({
      status: "active",
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });

    if (!tasks.length) return;

    for (const task of tasks) {
      /* ---------- Message type ---------- */

      if (task.allowedTypes?.length && !task.allowedTypes.includes(type)) {
        continue;
      }

      /* ---------- Keyword ---------- */

      if (
        task.requiredKeyword &&
        !text.toLowerCase().includes(task.requiredKeyword.toLowerCase())
      ) {
        continue;
      }

      /* ---------- User Progress ---------- */

      let progress = await UserShareTask.findOne({
        task: task._id,
        user: userId,
      });

      if (!progress) {
        progress = await UserShareTask.create({
          task: task._id,
          user: userId,
          recipients: [],
          messageCount: 0,
        });
      }

      if (progress.rewarded) continue;

      /* ---------- Duplicate recipient ---------- */

      const exists = progress.recipients.some(
        (r) => r.user && r.user.toString() === recipientId.toString(),
      );

      if (exists) continue;

      progress.recipients.push({
        user: recipientId,
        messageId,
        sentAt: new Date(),
      });

      progress.messageCount = progress.recipients.length;

      /* ---------- Complete task ---------- */

      if (
        !progress.completed &&
        progress.messageCount >= task.requiredMessages
      ) {
        progress.completed = true;
        progress.completedAt = new Date();
      }

      /* ---------- Reward ---------- */

      if (
        !progress.completed &&
        progress.messageCount >= task.requiredMessages
      ) {
        progress.completed = true;
        progress.completedAt = new Date();
      }

      await progress.save();
    }
  } catch (err) {
    console.error("trackShareTask:", err);
  }
};

/* =========================================
   CREATE TASK (ADMIN)
========================================= */

const createTask = async (req, res) => {
  try {
    console.log("========== CREATE SHARE TASK ==========");
    console.log("User:", req.user);
    console.log("Body:", JSON.stringify(req.body, null, 2));

    const {
      title,
      description,
      rewardCoins,
      requiredMessages,
      allowedTypes,
      requiredKeyword,
      expiresAt,
      assignedUsers,
    } = req.body;

    // Verify authentication
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "req.user is undefined. Authentication failed.",
      });
    }

    const taskData = {
      title,
      description,
      rewardCoins,
      requiredMessages,
      allowedTypes: allowedTypes || ["text"],
      requiredKeyword: requiredKeyword || "",
      expiresAt: expiresAt || null,
      assignedUsers: assignedUsers || [],
      createdBy: req.user._id,
    };

    console.log("Task Data:", JSON.stringify(taskData, null, 2));

    const task = await ShareTask.create(taskData);

    console.log("Task Created:", task._id);

    return res.status(201).json({
      success: true,
      task,
    });
  } catch (err) {
    console.error("========== CREATE TASK ERROR ==========");
    console.error(err);

    if (err.name === "ValidationError") {
      console.error("Validation Errors:", err.errors);
    }

    if (err.name === "CastError") {
      console.error("Cast Error:", err.path, err.value);
    }

    return res.status(500).json({
      success: false,
      message: err.message,
      errorName: err.name,
      errors: err.errors || null,
      stack:
        process.env.NODE_ENV === "development"
          ? err.stack
          : undefined,
    });
  }
};
/* =========================================
   GET ACTIVE TASKS
========================================= */

const getTasks = async (req, res) => {
  try {
    const tasks = await ShareTask.find({
      status: "active",
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    }).sort({
      createdAt: -1,
    });

    res.json({
      success: true,
      tasks,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* =========================================
   USER PROGRESS
========================================= */

const getMyTasks = async (req, res) => {
  try {
    const tasks = await UserShareTask.find({
      user: req.user._id,
    })
      .populate("task")
      .sort({
        updatedAt: -1,
      });

    res.json({
      success: true,
      tasks,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* =========================================
   UPDATE TASK
========================================= */

const updateTask = async (req, res) => {
  try {
    const task = await ShareTask.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    res.json({
      success: true,
      task,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* =========================================
   DELETE TASK
========================================= */

const deleteTask = async (req, res) => {
  try {
    const task = await ShareTask.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    await UserShareTask.deleteMany({
      task: task._id,
    });

    await task.deleteOne();

    res.json({
      success: true,
      message: "Task deleted",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* =========================================
   MANUAL REWARD
========================================= */

const rewardUser = async (req, res) => {
  try {
    const { userId } = req.body;

    const progress = await UserShareTask.findOne({
      task: req.params.id,
      user: userId,
    }).populate("task");

    if (!progress) {
      return res.status(404).json({
        success: false,
        message: "Progress not found",
      });
    }

    if (progress.rewarded) {
      return res.status(400).json({
        success: false,
        message: "Already rewarded",
      });
    }

    progress.rewarded = true;
    progress.rewardedAt = new Date();

    await progress.save();

    await User.findByIdAndUpdate(userId, {
      $inc: {
        coins: progress.task.rewardCoins,
      },
    });

    res.json({
      success: true,
      message: "Reward sent successfully",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const getTaskProgress = async (req, res) => {
  try {
    const progress = await UserShareTask.find({
      task: req.params.id,
    })
      .populate("user", "name avatar email phone")
      .populate("recipients.user", "name")
      .sort({ updatedAt: -1 });

    res.json({
      success: true,
      progress,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = {
  trackShareTask,
  createTask,
  getTasks,
  getMyTasks,
  updateTask,
  deleteTask,
  rewardUser,
  getTaskProgress,
};

const mongoose = require("mongoose");

const ShareTask = require("../models/ShareTaskModel");
const UserShareTask = require("../models/UserShareTaskModel");

console.log("ShareTask =", ShareTask.modelName);
console.log("UserShareTask =", UserShareTask.modelName);
console.log("Same model =", ShareTask === UserShareTask);
console.log("Registered models =", mongoose.modelNames());

const User = require("../models/UserModels");

/*
 * Track a user's progress on active share tasks.
 */
const trackShareTask = async ({
  userId,
  recipientId,
  messageId = null,
  type = "text",
  text = "",
}) => {
  try {
    console.log("========== trackShareTask ==========");
    console.log({
      userId,
      recipientId,
      messageId,
      type,
      text,
    });

    if (!userId) {
      console.error("trackShareTask: Missing userId");
      return;
    }

    if (!recipientId) {
      console.error("trackShareTask: Missing recipientId");
      return;
    }

    const tasks = await ShareTask.find({
      status: "active",
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } },
      ],
    });

    console.log("Active tasks:", tasks.length);

    if (!tasks.length) {
      console.log("No active share tasks found.");
      return;
    }

    for (const task of tasks) {
      console.log("--------------------------------");
      console.log("Checking task:", task._id.toString());
      console.log("Title:", task.title);

      // Message type check
      if (
        task.allowedTypes?.length &&
        !task.allowedTypes.includes(type)
      ) {
        console.log(
          `Skipped: type "${type}" not allowed (${task.allowedTypes.join(", ")})`
        );
        continue;
      }

      // Keyword check
      if (
        task.requiredKeyword &&
        !text.toLowerCase().includes(task.requiredKeyword.toLowerCase())
      ) {
        console.log(
          `Skipped: keyword "${task.requiredKeyword}" not found`
        );
        continue;
      }

      // Find existing progress
      let progress = await UserShareTask.findOne({
        task: task._id,
        user: userId,
      });

      console.log(
        "Existing progress:",
        progress ? progress._id.toString() : "NONE"
      );

      // Create progress if it doesn't exist
      if (!progress) {
        console.log("Creating UserShareTask...");

        progress = new UserShareTask({
          task: task._id,
          user: userId,
          recipients: [],
          messageCount: 0,
          completed: false,
          rewarded: false,
          status: "pending",
        });

        await progress.save();

        console.log("✅ Progress created:", progress._id);
      }

      if (progress.rewarded) {
        console.log("Skipped: already rewarded");
        continue;
      }

      // Prevent duplicate recipient
      const exists = progress.recipients.some(
        (r) => String(r.user) === String(recipientId)
      );

      if (exists) {
        console.log("Skipped: recipient already counted");
        continue;
      }

      // Add recipient
      progress.recipients.push({
        user: recipientId,
        messageId,
        sentAt: new Date(),
      });

      progress.messageCount = progress.recipients.length;

      console.log(
        `Progress: ${progress.messageCount}/${task.requiredMessages}`
      );

      // Complete task
      if (
        !progress.completed &&
        progress.messageCount >= task.requiredMessages
      ) {
        progress.completed = true;
        progress.completedAt = new Date();

        console.log("✅ Task completed");
      }

      await progress.save();

      console.log("✅ Progress saved");
    }

    console.log("========== trackShareTask END ==========");
  } catch (err) {
    console.error("trackShareTask ERROR");
    console.error(err);
  }
};

/* =========================================
   CREATE TASK (ADMIN)
========================================= */

const createTask = async (req, res) => {
  try {
    console.log("===== CREATE TASK =====");
    console.log("Model:", ShareTask.modelName);
    console.log("Body:", req.body);
    console.log("User:", req.user);

    const data = {
      title: req.body.title,
      description: req.body.description,
      rewardCoins: req.body.rewardCoins,
      requiredMessages: req.body.requiredMessages,
      allowedTypes: req.body.allowedTypes || ["text"],
      requiredKeyword: req.body.requiredKeyword || "",
      expiresAt: req.body.expiresAt || null,
      assignedUsers: req.body.assignedUsers || [],
      createdBy: req.user._id,
    };

    console.log("Creating:", data);

    const task = await ShareTask.create(data);

    console.log("Created:", task);

    return res.status(201).json({
      success: true,
      task,
    });
  } catch (err) {
    console.error("CREATE TASK ERROR");
    console.error("ShareTask model:", ShareTask.modelName);
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
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
      $and: [
        {
          $or: [
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } },
          ],
        },
        {
          $or: [
            { assignedUsers: req.user._id },
            { assignedUsers: { $size: 0 } },
          ],
        },
      ],
    }).sort({ createdAt: -1 });

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
    const progress = await UserShareTask.find({
      user: req.user._id,
    })
      .populate({
        path: "task",
        match: {
          status: "active",
          $and: [
            {
              $or: [
                { expiresAt: null },
                { expiresAt: { $gt: new Date() } },
              ],
            },
            {
              $or: [
                { assignedUsers: req.user._id },
                { assignedUsers: { $size: 0 } },
              ],
            },
          ],
        },
      })
      .populate("recipients.user", "name avatar")
      .sort({ updatedAt: -1 });

    // Remove orphaned or hidden tasks
    const tasks = progress.filter((item) => item.task);

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

const mongoose = require("mongoose");

const ShareTask = require("../models/ShareTaskModel");
const UserShareTask = require("../models/UserShareTaskModel");
const User = require("../models/UserModels");
const cloudinary = require("../config/Cloudinary");

/*
 * Track a user's progress on active share tasks.
 */
const trackShareTask = async ({
  userId,
  recipientId,
  messageId = null,
  type = "text",
  text = "",
  image = "",
}) => {
  try {
    console.log("========== TRACK SHARE TASK ==========");

    console.log({
      userId,
      recipientId,
      messageId,
      type,
      text,
      image,
    });

    if (!userId || !recipientId) {
      console.log("Missing userId or recipientId");
      return;
    }

    const tasks = await ShareTask.find({
      status: "active",
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } },
      ],
      $and: [
        {
          $or: [
            { assignedUsers: { $in: [userId] } },
            { assignedUsers: { $size: 0 } },
            { assignedUsers: { $exists: false } },
          ],
        },
      ],
    });

    console.log(`Found ${tasks.length} active task(s)`);

    if (!tasks.length) return;

    for (const task of tasks) {
      console.log("--------------------------------");
      console.log("Task:", task.title);
      console.log("Allowed:", task.allowedTypes);
      console.log("Incoming:", type);

      /* ================= TYPE ================= */

      if (
        task.allowedTypes?.length &&
        !task.allowedTypes.includes(type)
      ) {
        console.log("Skipped: invalid message type");
        continue;
      }

      /* ================= KEYWORD ================= */

      if (
        type === "text" &&
        task.requiredKeyword &&
        !text.toLowerCase().includes(task.requiredKeyword.toLowerCase())
      ) {
        console.log("Skipped: keyword missing");
        continue;
      }

      /* ================= IMAGE ================= */

      if (type === "image" && !image) {
        console.log("Skipped: image missing");
        continue;
      }

      /* ================= LOAD PROGRESS ================= */

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
          completed: false,
          rewarded: false,
          status: "pending",
        });

        console.log("Created progress:", progress._id);
      }

      if (progress.rewarded) {
        console.log("Already rewarded");
        continue;
      }

      /* ================= PREVENT DUPLICATE MESSAGE ================= */

      if (messageId) {
        const exists = progress.recipients.some(
          (r) => String(r.messageId) === String(messageId)
        );

        if (exists) {
          console.log("Message already counted");
          continue;
        }
      }

      /* ================= SAVE ================= */

      progress.recipients.push({
        user: recipientId,
        messageId,
        type,
        text,
        image,
        sentAt: new Date(),
      });

      progress.messageCount = progress.recipients.length;

      console.log(
        `Progress: ${progress.messageCount}/${task.requiredMessages}`
      );

      if (
        !progress.completed &&
        progress.messageCount >= task.requiredMessages
      ) {
        progress.completed = true;
        progress.completedAt = new Date();

        console.log("Task completed");
      }

      await progress.save();

      console.log("Progress saved");
    }

    console.log("========== TRACK COMPLETE ==========");
  } catch (err) {
    console.error("trackShareTask ERROR:", err);
  }
};

/* =========================================
   CREATE TASK (ADMIN)
========================================= */

const createTask = async (req, res) => {
  try {
    console.log("===== CREATE TASK =====");
    console.log("Body:", req.body);
    console.log("File:", req.file);

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

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: "Title and description are required.",
      });
    }

    const normalizedAssignedUsers = Array.isArray(assignedUsers)
      ? assignedUsers
      : typeof assignedUsers === "string"
        ? [assignedUsers]
        : [];

    const normalizedAllowedTypes = Array.isArray(allowedTypes)
      ? allowedTypes
      : typeof allowedTypes === "string"
        ? [allowedTypes]
        : ["text"];

    const task = await ShareTask.create({
      title: title.trim(),
      description: description.trim(),
      rewardCoins: Number(rewardCoins) || 100,
      requiredMessages: Number(requiredMessages) || 10,
      allowedTypes: normalizedAllowedTypes,
      requiredKeyword: requiredKeyword || "",
      expiresAt: expiresAt || null,
      assignedUsers: normalizedAssignedUsers,
      createdBy: req.user._id,

      image: req.file
        ? `/uploads/shareTasks/${req.file.filename}`
        : "",
    });

    console.log("Task created:", task._id);

    return res.status(201).json({
      success: true,
      message: "Task created successfully.",
      task,
    });
  } catch (err) {
    console.error("CREATE TASK ERROR");
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message || "Unable to create task.",
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
            { assignedUsers: { $in: [req.user._id] } },
            { assignedUsers: { $size: 0 } },
            { assignedUsers: { $exists: false } },
          ],
        },
      ],
    })
      .populate("createdBy", "name avatar email")
      .populate("assignedUsers", "name avatar")
      .sort({
        createdAt: -1,
      });

    return res.status(200).json({
      success: true,
      count: tasks.length,
      tasks,
    });
  } catch (err) {
    console.error("GET TASKS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Unable to load tasks.",
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
                { assignedUsers: { $in: [req.user._id] } },
                { assignedUsers: { $size: 0 } },
                { assignedUsers: { $exists: false } },
              ],
            },
          ],
        },
        populate: [
          {
            path: "createdBy",
            select: "name avatar",
          },
          {
            path: "assignedUsers",
            select: "name avatar",
          },
        ],
      })
      .populate("recipients.user", "name avatar")
      .sort({ updatedAt: -1 });

    // Remove deleted, expired, or inaccessible tasks
    const tasks = progress.filter((item) => item.task);

    return res.status(200).json({
      success: true,
      count: tasks.length,
      tasks,
      summary: {
        completed: tasks.filter((t) => t.completed).length,
        pending: tasks.filter((t) => !t.completed).length,
        rewarded: tasks.filter((t) => t.rewarded).length,
      },
    });
  } catch (err) {
    console.error("GET MY TASKS ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Unable to load your tasks.",
    });
  }
};

/* =========================================
   UPDATE TASK
========================================= */

const fs = require("fs");
const path = require("path");

const updateTask = async (req, res) => {
  try {
    const task = await ShareTask.findById(req.params.id);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    const assignedUsers = req.body.assignedUsers;
    const allowedTypes = req.body.allowedTypes;

    const normalizedAssignedUsers = Array.isArray(assignedUsers)
      ? assignedUsers
      : typeof assignedUsers === "string"
        ? [assignedUsers]
        : task.assignedUsers;

    const normalizedAllowedTypes = Array.isArray(allowedTypes)
      ? allowedTypes
      : typeof allowedTypes === "string"
        ? [allowedTypes]
        : task.allowedTypes;

    const updateData = {
      title: req.body.title ?? task.title,
      description: req.body.description ?? task.description,
      rewardCoins: req.body.rewardCoins ?? task.rewardCoins,
      requiredMessages:
        req.body.requiredMessages ?? task.requiredMessages,
      requiredKeyword:
        req.body.requiredKeyword ?? task.requiredKeyword,
      expiresAt: req.body.expiresAt || null,
      status: req.body.status ?? task.status,
      assignedUsers: normalizedAssignedUsers,
      allowedTypes: normalizedAllowedTypes,
    };

    // Replace image if a new one was uploaded
    if (req.file) {
      if (task.image) {
        const oldImage = path.join(
          __dirname,
          "..",
          task.image.replace(/^\//, "")
        );

        if (fs.existsSync(oldImage)) {
          fs.unlinkSync(oldImage);
        }
      }

      updateData.image = `/uploads/shareTasks/${req.file.filename}`;
    }

    const updatedTask = await ShareTask.findByIdAndUpdate(
      req.params.id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    )
      .populate("createdBy", "name avatar")
      .populate("assignedUsers", "name avatar");

    return res.status(200).json({
      success: true,
      message: "Task updated successfully.",
      task: updatedTask,
    });
  } catch (err) {
    console.error("UPDATE TASK ERROR:", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Unable to update task.",
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

    // Delete all user progress
    await UserShareTask.deleteMany({
      task: task._id,
    });

    // Delete task image from Cloudinary
    if (task.imagePublicId) {
      try {
        await cloudinary.uploader.destroy(task.imagePublicId);
      } catch (err) {
        console.error("Cloudinary delete failed:", err.message);
      }
    }

    await task.deleteOne();

    res.json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (err) {
    console.error("DELETE TASK ERROR:", err);

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

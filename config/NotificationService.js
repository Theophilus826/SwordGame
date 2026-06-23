const Notification = require("../models/Notification");
const User = require("../models/UserModels");
const mongoose = require("mongoose");
const admin = require("../config/firebase");
const { pushNotification } = require("../config/sse");

/* =========================
   HELPERS
========================= */

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/* =========================
   MESSAGE BUILDER
========================= */

const buildMessage = ({ type, senderName }) => {
  switch (type) {
    case "like":
      return `👍 ${senderName} liked your post`;
    case "love":
      return `❤️ ${senderName} loved your post`;
    case "comment":
      return `💬 ${senderName} commented on your post`;
    case "chat":
      return `💬 New message from ${senderName}`;
    default:
      return `🔔 Notification from ${senderName}`;
  }
};

/* =========================
   CORE NOTIFY SERVICE
========================= */

const notify = async ({
  user,
  sender = null,
  type = "system",
  message,
  postId = null,
  chatUserId = null,
}) => {
  if (!user || !isValidId(user)) return null;

  try {
    const senderName = sender?.name || "Someone";
    const finalMessage = message || buildMessage({ type, senderName });

    // Save notification
    const notification = await Notification.create({
      user,
      sender: sender?._id || sender || null,
      type,
      message: finalMessage,
      postId,
      chatUserId: type === "chat" ? chatUserId || sender?._id : null,
      read: false,
    });

    // SSE
    try {
      pushNotification(user.toString(), {
        type: "new",
        notification,
      });
    } catch (err) {
      console.error("SSE error:", err.message);
    }

    // FCM
    try {
      const targetUser = await User.findById(user);

      if (!targetUser) {
        console.log("Target user not found:", user);
        return notification;
      }

      if (!targetUser.fcmToken) {
        console.log("No FCM token for user:", user);
        return notification;
      }

      console.log("Sending FCM to:", targetUser._id);

      console.log("SERVER TIME:", new Date().toISOString());
      console.log("EPOCH:", Date.now());

      const response = await admin.messaging().send({
        token: targetUser.fcmToken,

        notification: {
          title: "TinkReward",
          body: finalMessage,
        },

        android: {
          priority: "high",
          notification: {
            channelId: "tinkreward_notifications",
            sound: "default",
          },
        },

        apns: {
          payload: {
            aps: {
              sound: "default",
            },
          },
        },

        data: {
          notificationId: String(notification._id),
          type: String(type),
          postId: String(postId || ""),
          chatUserId: String(chatUserId || ""),
        },
      });

      console.log("FCM SUCCESS:", response);
    } catch (err) {
      console.error("FCM ERROR:", err);
    }

    return notification;
  } catch (err) {
    console.error("notify service error:", err.message);
    return null;
  }
};

/* ================= WRAPPERS ================= */

const notifyChatMessage = async ({ receiverId, sender, messageType }) => {
  const senderName = sender?.name || "Someone";

  const map = {
    text: `💬 New message from ${senderName}`,
    voice: `🎤 Voice message from ${senderName}`,
    image: `🖼️ Image from ${senderName}`,
  };

  return notify({
    user: receiverId,
    sender,
    type: "chat",
    message: map[messageType] || `New message from ${senderName}`,
    chatUserId: sender?._id,
  });
};

const notifyPostReaction = async ({ postOwnerId, sender, type, postId }) => {
  const senderName = sender?.name || "Someone";

  const message =
    type === "like"
      ? `👍 ${senderName} liked your post`
      : `❤️ ${senderName} loved your post`;

  return notify({
    user: postOwnerId,
    sender,
    type,
    message,
    postId,
  });
};

module.exports = {
  notify,
  notifyChatMessage,
  notifyPostReaction,
};

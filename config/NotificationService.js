const Notification = require("../models/Notification");
const { pushNotification } = require("../config/sse");

/* ================= CORE ================= */
const createAndPush = async ({
  user,
  sender,
  type,
  message,
  postId = null,
  chatUserId = null,
}) => {
  try {
    if (!user) {
      console.warn("⚠️ Notification skipped: missing user");
      return null;
    }

    const notification = await Notification.create({
      user,
      sender: sender?._id || sender || null,
      type,
      message,
      postId,
      chatUserId,
      read: false,
    });

    // Push safely (never crash app)
    try {
      pushNotification(user, notification);
    } catch (err) {
      console.error("SSE push error:", err.message);
    }

    return notification;
  } catch (err) {
    console.error("Notification DB error:", err.message);
    return null; // 🔥 NEVER throw (prevents 502 crash)
  }
};

/* ================= CHAT ================= */
const notifyChatMessage = async ({ receiverId, sender, messageType }) => {
  try {
    if (!receiverId || !sender) return null;

    const senderName = sender?.name || "Someone";

    const textMap = {
      text: `💬 New message from ${senderName}`,
      voice: `🎤 Voice message from ${senderName}`,
      image: `🖼️ Image from ${senderName}`,
    };

    return await createAndPush({
      user: receiverId,
      sender,
      type: "chat",
      message:
        textMap[messageType] || `New message from ${senderName}`,
      chatUserId: sender?._id,
    });
  } catch (err) {
    console.error("notifyChatMessage error:", err.message);
    return null;
  }
};

/* ================= POST REACTIONS ================= */
const notifyPostReaction = async ({
  postOwnerId,
  sender,
  type,
  postId,
}) => {
  try {
    if (!postOwnerId || !sender) return null;

    const senderName = sender?.name || "Someone";

    const message =
      type === "like"
        ? `👍 ${senderName} liked your post`
        : `❤️ ${senderName} loved your post`;

    return await createAndPush({
      user: postOwnerId,
      sender,
      type,
      message,
      postId,
    });
  } catch (err) {
    console.error("notifyPostReaction error:", err.message);
    return null;
  }
};

module.exports = {
  createAndPush,
  notifyChatMessage,
  notifyPostReaction,
};

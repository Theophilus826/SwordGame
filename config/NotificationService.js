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
  const notification = await Notification.create({
    user,
    sender: sender?._id || sender,
    type,
    message,
    postId,
    chatUserId,
    read: false,
  });

  pushNotification(user, notification);

  return notification;
};

/* ================= CHAT ================= */
const notifyChatMessage = async ({ receiverId, sender, messageType }) => {
  const textMap = {
    text: `💬 New message from ${sender.name}`,
    voice: `🎤 Voice message from ${sender.name}`,
    image: `🖼️ Image from ${sender.name}`,
  };

  return createAndPush({
    user: receiverId,
    sender,
    type: "chat",
    message: textMap[messageType] || `New message from ${sender.name}`,
    chatUserId: sender._id,
  });
};

/* ================= POST REACTIONS ================= */
const notifyPostReaction = async ({ postOwnerId, sender, type, postId }) => {
  const message =
    type === "like"
      ? `👍 ${sender.name} liked your post`
      : `❤️ ${sender.name} loved your post`;

  return createAndPush({
    user: postOwnerId,
    sender,
    type,
    message,
    postId,
  });
};

module.exports = {
  createAndPush,
  notifyChatMessage,
  notifyPostReaction,
};

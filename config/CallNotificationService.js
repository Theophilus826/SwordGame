const admin = require("./firebase");
const User = require("../models/UserModels");

const sendIncomingCall = async (
  receiverId,
  caller,
  callId,
  type
) => {

  const user = await User.findById(receiverId);

  if (!user || !user.fcmTokens.length) return;

  await admin.messaging().sendEachForMulticast({
    tokens: user.fcmTokens,

    notification: {
      title: caller.name,
      body:
        type === "video"
          ? "Incoming video call"
          : "Incoming voice call",
    },

    data: {
      type: "incoming_call",
      callId,
      callerId: String(caller._id),
      callerName: caller.name,
      callType: type,
    },
  });
};

module.exports = {
  sendIncomingCall,
};

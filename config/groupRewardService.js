const CoinTransaction = require("../models/CoinTransaction");
const { updateCoins } = require("../controller/AccountController");

const GROUP_REWARDS = {
  CREATE_GROUP: 50,
  SEND_MESSAGE: 1,
  ADD_MEMBER: 20,
  DAILY_ACTIVE: 5,
  INVITE_ACCEPTED: 25,
};

const rewardGroupAction = async ({
  userId,
  groupId,
  action,
  description,
}) => {
  const amount = GROUP_REWARDS[action];

  if (!amount) return null;

  // 🔥 ANTI-SPAM CHECK
  if (action === "SEND_MESSAGE") {
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);

    const recent = await CoinTransaction.findOne({
      user: userId,
      type: "GROUP_MESSAGE_REWARD",
      createdAt: { $gte: oneMinuteAgo },
    });

    if (recent) {
      return null;
    }
  }

  return await updateCoins({
    userId,
    amount,
    type: `GROUP_${action}`,
    description:
      description || `Reward for ${action} in group ${groupId}`,
  });
};

module.exports = {
  rewardGroupAction,
};

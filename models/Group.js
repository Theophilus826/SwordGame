const mongoose = require("mongoose");
const crypto = require("crypto");

/* ================= HELPERS ================= */

const generateInviteCode = () => {
  return crypto.randomBytes(5).toString("hex").toUpperCase();
};

/* ================= REWARD CONSTANTS ================= */

const GROUP_CREATE_REWARD = 50;
const MESSAGE_MILESTONE = 10;
const MESSAGE_REWARD = 20;

/* ================= MEMBER SCHEMA ================= */

const memberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    role: {
      type: String,
      enum: ["admin", "moderator", "member"],
      default: "member",
      index: true,
    },

    joinedAt: {
      type: Date,
      default: Date.now,
    },

    /* ================= REWARDS ================= */

    coinsEarned: {
      type: Number,
      default: 0,
    },

    xp: {
      type: Number,
      default: 0,
    },

    level: {
      type: Number,
      default: 1,
    },

    streak: {
      type: Number,
      default: 0,
    },

    lastRewardAt: {
      type: Date,
      default: null,
    },

    lastActiveAt: {
      type: Date,
      default: null,
    },

    messagesCount: {
      type: Number,
      default: 0,
    },

    invitesCount: {
      type: Number,
      default: 0,
    },

    /* ================= MESSAGE TRACKING ================= */

    rewardProgress: {
      type: Number,
      default: 0,
    },

    rewardedMilestones: {
      type: Number,
      default: 0,
    },

    /* ================= READ STATUS ================= */

    lastSeenMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupMessages",
      default: null,
    },
  },
  { _id: false },
);

/* ================= GROUP SCHEMA ================= */

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    members: [memberSchema],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    avatar: {
      type: String,
      default: null,
    },

    inviteCode: {
      type: String,
      unique: true,
      index: true,
    },

    inviteLinkEnabled: {
      type: Boolean,
      default: true,
    },

    /* ================= GROUP REWARDS ================= */

    rewards: {
      /* master toggle */
      enabled: {
        type: Boolean,
        default: true,
      },

      /* reward for creating group */
      groupCreatedReward: {
        type: Number,
        default: GROUP_CREATE_REWARD,
      },

      /* reward every X messages */
      messageMilestone: {
        type: Number,
        default: MESSAGE_MILESTONE,
      },

      /* coins per milestone */
      messageRewardCoins: {
        type: Number,
        default: MESSAGE_REWARD,
      },

      /* optional future rewards */
      inviteRewardCoins: {
        type: Number,
        default: 10,
      },

      dailyActiveRewardCoins: {
        type: Number,
        default: 5,
      },
    },

    /* ================= STATS ================= */

    stats: {
      totalMessages: {
        type: Number,
        default: 0,
      },

      totalCoinsDistributed: {
        type: Number,
        default: 0,
      },

      totalXpDistributed: {
        type: Number,
        default: 0,
      },

      totalMembersJoined: {
        type: Number,
        default: 0,
      },

      totalMediaMessages: {
        type: Number,
        default: 0,
      },

      activeToday: {
        type: Number,
        default: 0,
      },
    },

    /* ================= LEVEL SYSTEM ================= */

    level: {
      type: Number,
      default: 1,
    },

    xp: {
      type: Number,
      default: 0,
    },

    milestones: [String],

    /* ================= SETTINGS ================= */

    settings: {
      onlyAdminsCanMessage: {
        type: Boolean,
        default: false,
      },

      onlyAdminsCanAddMembers: {
        type: Boolean,
        default: false,
      },

      rewardMessages: {
        type: Boolean,
        default: true,
      },

      rewardInvites: {
        type: Boolean,
        default: true,
      },

      rewardDailyActivity: {
        type: Boolean,
        default: true,
      },
    },
  },
  { timestamps: true },
);

/* ================= INDEXES ================= */

groupSchema.index({ "members.user": 1 });
groupSchema.index({ createdBy: 1 });
groupSchema.index({ inviteCode: 1 });
groupSchema.index({ xp: -1 });
groupSchema.index({ "stats.totalMessages": -1 });

/* ================= PRE SAVE ================= */

groupSchema.pre("save", async function () {
  if (!this.isNew) return;

  let exists = true;

  while (exists) {
    const code = generateInviteCode();

    const found = await mongoose.models.Group.findOne({
      inviteCode: code,
    });

    if (!found) {
      this.inviteCode = code;
      exists = false;
    }
  }
});

/* ================= METHODS ================= */

groupSchema.methods.isMember = function (userId) {
  return this.members.some((m) => m.user.toString() === userId.toString());
};

groupSchema.methods.addMember = function (userId, role = "member") {
  if (!this.isMember(userId)) {
    this.members.push({
      user: userId,
      role,
    });

    this.stats.totalMembersJoined += 1;
  }
};

groupSchema.methods.removeMember = function (userId) {
  this.members = this.members.filter(
    (m) => m.user.toString() !== userId.toString(),
  );
};

groupSchema.methods.getRole = function (userId) {
  const member = this.members.find(
    (m) => m.user.toString() === userId.toString(),
  );

  return member?.role || null;
};

groupSchema.methods.isAdmin = function (userId) {
  return this.getRole(userId) === "admin";
};

groupSchema.methods.canModerate = function (userId) {
  const role = this.getRole(userId);

  return role === "admin" || role === "moderator";
};

/* ================= MESSAGE REWARD ================= */

groupSchema.methods.trackMessageReward = function (userId) {
  const member = this.members.find(
    (m) => m.user.toString() === userId.toString(),
  );

  if (!member) {
    return {
      rewarded: false,
      coins: 0,
      progress: 0,
    };
  }

  member.messagesCount += 1;

  this.stats.totalMessages += 1;

  /* ================= REWARDS DISABLED ================= */

  if (!this.rewards?.enabled) {
    return {
      rewarded: false,
      coins: 0,
      progress: 0,
      disabled: true,
    };
  }

  member.rewardProgress += 1;

  const milestone = this.rewards.messageMilestone;

  const rewardCoins = this.rewards.messageRewardCoins;

  let rewarded = false;

  if (member.rewardProgress >= milestone) {
    rewarded = true;

    member.rewardProgress = 0;

    member.rewardedMilestones += 1;

    member.coinsEarned += rewardCoins;

    member.lastRewardAt = new Date();

    this.stats.totalCoinsDistributed += rewardCoins;
  }

  return {
    rewarded,
    coins: rewarded ? rewardCoins : 0,
    progress: member.rewardProgress,
    nextMilestone: milestone,
    rewardsEnabled: true,
  };
};

/* ================= GROUP CREATE REWARD ================= */

groupSchema.methods.getCreateReward = function () {
  return this.rewards.groupCreatedReward;
};
/* ================= REWARD TOGGLE ================= */

groupSchema.methods.enableRewards = function () {
  this.rewards.enabled = true;
};

groupSchema.methods.disableRewards = function () {
  this.rewards.enabled = false;
};

groupSchema.methods.toggleRewards = function () {
  this.rewards.enabled = !this.rewards.enabled;

  return this.rewards.enabled;
};

/* ================= EXPORT ================= */

module.exports = mongoose.model("Group", groupSchema);

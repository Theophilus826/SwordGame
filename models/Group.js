const mongoose = require("mongoose");
const crypto = require("crypto");

/* ================= HELPERS ================= */

const generateInviteCode = () => {
  return crypto.randomBytes(5).toString("hex").toUpperCase();
};

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

    coinsEarned: { type: Number, default: 0 },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    streak: { type: Number, default: 0 },
    lastRewardAt: { type: Date, default: null },
    lastActiveAt: { type: Date, default: null },
    messagesCount: { type: Number, default: 0 },
    invitesCount: { type: Number, default: 0 },

    lastSeenMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupMessages",
      default: null,
    },
  },
  { _id: false }
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

    avatar: { type: String, default: null },

    inviteCode: { type: String, unique: true, index: true },
    inviteLinkEnabled: { type: Boolean, default: true },

    stats: {
      totalMessages: { type: Number, default: 0 },
      totalCoinsDistributed: { type: Number, default: 0 },
      totalXpDistributed: { type: Number, default: 0 },
      totalMembersJoined: { type: Number, default: 0 },
      totalMediaMessages: { type: Number, default: 0 },
      activeToday: { type: Number, default: 0 },
    },

    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },

    milestones: [String],

    settings: {
      onlyAdminsCanMessage: { type: Boolean, default: false },
      onlyAdminsCanAddMembers: { type: Boolean, default: false },
      rewardMessages: { type: Boolean, default: true },
      rewardInvites: { type: Boolean, default: true },
      rewardDailyActivity: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
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
  return this.members.some(
    (m) => m.user.toString() === userId.toString()
  );
};

groupSchema.methods.addMember = function (userId, role = "member") {
  if (!this.isMember(userId)) {
    this.members.push({ user: userId, role });
    this.stats.totalMembersJoined += 1;
  }
};

groupSchema.methods.removeMember = function (userId) {
  this.members = this.members.filter(
    (m) => m.user.toString() !== userId.toString()
  );
};

groupSchema.methods.getRole = function (userId) {
  const member = this.members.find(
    (m) => m.user.toString() === userId.toString()
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

/* ================= EXPORT ================= */

module.exports = mongoose.model("Group", groupSchema);

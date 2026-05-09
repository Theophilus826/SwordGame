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

    // 🔥 READ RECEIPTS
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
    /* ✅ GROUP NAME */
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    /* 👥 MEMBERS */
    members: [memberSchema],

    /* 👤 CREATOR */
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    /* 🖼️ GROUP AVATAR */
    avatar: {
      type: String,
      default: null,
    },

    /* 🔗 INVITE SYSTEM */
    inviteCode: {
      type: String,
      unique: true,
      index: true,
    },

    inviteLinkEnabled: {
      type: Boolean,
      default: true,
    },

    /* ⚙️ SETTINGS */
    settings: {
      onlyAdminsCanMessage: {
        type: Boolean,
        default: false,
      },

      onlyAdminsCanAddMembers: {
        type: Boolean,
        default: false,
      },
    },
  },
  {
    timestamps: true,
  }
);

/* ================= INDEXES ================= */

groupSchema.index({ "members.user": 1 });

groupSchema.index({ createdBy: 1 });

groupSchema.index({ inviteCode: 1 });

/* ================= PRE SAVE ================= */

/**
 * Generate unique invite code
 */
groupSchema.pre("save", async function (next) {
  try {
    if (!this.isNew) {
      return next();
    }

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

    next();
  } catch (err) {
    next(err);
  }
});

/* ================= METHODS ================= */

/**
 * Get member role
 */
groupSchema.methods.getRole = function (userId) {
  const member = this.members.find(
    (m) => m.user.toString() === userId.toString()
  );

  return member?.role || null;
};

/**
 * Admin check
 */
groupSchema.methods.isAdmin = function (userId) {
  return this.getRole(userId) === "admin";
};

/**
 * Moderator or admin
 */
groupSchema.methods.canModerate = function (userId) {
  const role = this.getRole(userId);

  return (
    role === "admin" ||
    role === "moderator"
  );
};

/**
 * Check membership
 */
groupSchema.methods.isMember = function (userId) {
  return this.members.some(
    (m) => m.user.toString() === userId.toString()
  );
};

/**
 * Get member object quickly
 */
groupSchema.methods.getMember = function (userId) {
  return this.members.find(
    (m) => m.user.toString() === userId.toString()
  );
};

/**
 * Add member safely
 */
groupSchema.methods.addMember = function (
  userId,
  role = "member"
) {
  if (!this.isMember(userId)) {
    this.members.push({
      user: userId,
      role,
    });
  }
};

/**
 * Remove member
 */
groupSchema.methods.removeMember = function (
  userId
) {
  this.members = this.members.filter(
    (m) =>
      m.user.toString() !==
      userId.toString()
  );
};

/* ================= EXPORT ================= */

module.exports = mongoose.model(
  "Group",
  groupSchema
);

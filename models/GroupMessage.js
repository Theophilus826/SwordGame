const mongoose = require("mongoose");
const crypto = require("crypto");

/* ================= HELPERS ================= */

const generateInviteCode = () => {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
};

/* ================= MEMBER SCHEMA ================= */

const memberSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    role: {
      type: String,
      enum: ["admin", "moderator", "member"],
      default: "member",
    },

    joinedAt: {
      type: Date,
      default: Date.now,
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
    },

    // 👥 MEMBERS WITH ROLES
    members: [memberSchema],

    // 👤 CREATOR
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // 🖼️ GROUP AVATAR
    avatar: {
      type: String,
      default: null,
    },

    // 🔗 INVITE SYSTEM
    inviteCode: {
      type: String,
      unique: true,
      default: generateInviteCode,
      index: true,
    },

    inviteLinkEnabled: {
      type: Boolean,
      default: true,
    },

    // ⚙️ SETTINGS (future-proof)
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
  { timestamps: true }
);

/* ================= INDEXING ================= */

groupSchema.index({ "members.user": 1 });
groupSchema.index({ inviteCode: 1 });

/* ================= HELPERS (MODEL METHODS) ================= */

// Get user role
groupSchema.methods.getRole = function (userId) {
  const member = this.members.find(
    (m) => m.user.toString() === userId.toString()
  );
  return member?.role || null;
};

// Check if user is admin
groupSchema.methods.isAdmin = function (userId) {
  return this.getRole(userId) === "admin";
};

// Check if user is moderator or admin
groupSchema.methods.canModerate = function (userId) {
  const role = this.getRole(userId);
  return role === "admin" || role === "moderator";
};

// Check membership
groupSchema.methods.isMember = function (userId) {
  return this.members.some(
    (m) => m.user.toString() === userId.toString()
  );
};

module.exports = mongoose.model("Group", groupSchema);

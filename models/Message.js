// models/Message.js
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    fromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    toUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    /* ================= OLD FIELD (KEEP) ================= */
    message: {
      type: String,
      default: "", // backward compatibility
    },

    /* ================= NEW FIELDS ================= */
    text: {
      type: String,
      default: "",
    },

    audio: {
      type: String, // voice note URL
      default: null,
    },

    type: {
      type: String,
      enum: ["text", "voice"],
      default: "text",
    },

    status: {
      type: String,
      enum: ["sent", "delivered", "seen"],
      default: "sent",
    },
  },
  {
    timestamps: true, // replaces createdAt
  }
);

const Message = mongoose.model("Message", messageSchema);

module.exports = Message; // ✅ CommonJS export

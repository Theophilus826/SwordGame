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

    /* ================= BACKWARD COMPATIBILITY ================= */
    message: {
      type: String,
      default: "",
    },

    /* ================= MESSAGE CONTENT ================= */
    text: {
      type: String,
      default: "",
    },

    image: {
      type: String, // Cloudinary image URL
      default: null,
    },

    audio: {
      type: String, // Cloudinary voice note URL
      default: null,
    },

    /* ================= MESSAGE TYPE ================= */
    type: {
      type: String,
      enum: [
        "text",
        "image",
        "voice",
        "video",
        "document",
      ],
      default: "text",
    },

    /* ================= DELIVERY STATUS ================= */
    status: {
      type: String,
      enum: ["sent", "delivered", "seen"],
      default: "sent",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Message", messageSchema);

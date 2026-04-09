// models/Message.js
import mongoose from "mongoose";

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
      default: "", // no longer required (important!)
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
export default Message;

const mongoose = require("mongoose");

const callSchema = new mongoose.Schema(
  {
    callId: {
      type: String,
      required: true,
      unique: true,
    },

    caller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: {
      type: String,
      enum: ["voice", "video"],
      default: "voice",
    },

    status: {
      type: String,
      enum: [
        "ringing",
        "accepted",
        "rejected",
        "missed",
        "cancelled",
        "busy",
        "ended",
      ],
      default: "ringing",
    },

    startedAt: Date,

    endedAt: Date,

    duration: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Call", callSchema);

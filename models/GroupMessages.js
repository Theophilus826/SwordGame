const mongoose = require("mongoose");

const groupMessageSchema =
  new mongoose.Schema(
    {
      group: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref: "Group",

        required: true,

        index: true,
      },

      fromUser: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref: "User",

        required: true,
      },

      text: {
        type: String,

        trim: true,

        maxlength: 5000,

        default: "",
      },

      /* ✅ FILES */
      image: {
        type: String,
        default: null,
      },

      video: {
        type: String,
        default: null,
      },

      audio: {
        type: String,
        default: null,
      },

      file: {
        type: String,
        default: null,
      },

      /* ✅ SYSTEM EVENTS */
      isSystemMessage: {
        type: Boolean,
        default: false,
      },

      systemType: {
        type: String,
        default: null,
      },

      /* ✅ READ BY */
      readBy: [
        {
          user: {
            type:
              mongoose.Schema.Types.ObjectId,

            ref: "User",
          },

          readAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],

      /* ✅ EDIT */
      edited: {
        type: Boolean,
        default: false,
      },

      editedAt: {
        type: Date,
        default: null,
      },

      /* ✅ DELETE */
      deletedForEveryone: {
        type: Boolean,
        default: false,
      },
    },

    {
      timestamps: true,
    }
  );

/* ================= INDEXES ================= */

groupMessageSchema.index({
  group: 1,
  createdAt: 1,
});

groupMessageSchema.index({
  fromUser: 1,
});

/* ================= EXPORT ================= */

module.exports = mongoose.model(
  "GroupMessage",
  groupMessageSchema
);

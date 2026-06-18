const mongoose = require("mongoose");

const AppVersionSchema = new mongoose.Schema(
  {
    version: {
      type: String,
      required: true,
      trim: true,
    },

    versionCode: {
      type: Number,
      required: true,
      unique: true,
    },

    changelog: {
      type: String,
      default: "",
    },

    apkUrl: {
      type: String,
      required: true,
    },

    forceUpdate: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("AppVersion", AppVersionSchema);

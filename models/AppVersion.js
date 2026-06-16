const mongoose = require("mongoose");

const AppVersionSchema = new mongoose.Schema({
  version: String,
  changelog: String,
  apkUrl: String,
  forceUpdate: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model(
  "AppVersion",
  AppVersionSchema
);

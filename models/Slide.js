const mongoose = require("mongoose");

const slideSchema = new mongoose.Schema(
  {
    src: {
      type: String,
      required: true,
    },

    public_id: {
      type: String,
      required: true, // needed for Cloudinary delete
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Slide", slideSchema);

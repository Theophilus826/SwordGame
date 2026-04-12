const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/Cloudinary");

/* ================= STORAGE ================= */
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "chat-voice-notes",

    // ✅ FIX: MUST be "raw" for audio files
    resource_type: "raw",

    // keep webm format for recordings
    format: async () => "webm",

    public_id: (req, file) => {
      return "voice-" + Date.now();
    },
  },
});

/* ================= FILTER ================= */
const fileFilter = (req, file, cb) => {
  const allowed = [
    "audio/webm",
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
  ];

  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only audio files are allowed"), false);
  }
};

/* ================= UPLOAD ================= */
const upload = multer({
  storage,
  fileFilter,

  // ✅ safe limit for voice notes
  limits: { fileSize: 10 * 1024 * 1024 },
});

module.exports = upload;

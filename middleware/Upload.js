const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/Cloudinary");

/* ================= STORAGE ================= */
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "chat-voice-notes",
    resource_type: "video", // ⚠️ IMPORTANT for audio/webm
    format: async (req, file) => "webm",
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

  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Only audio allowed"), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

module.exports = upload;

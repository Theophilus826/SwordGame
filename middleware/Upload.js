const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/Cloudinary");

/* ================= STORAGE ================= */
const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    let folder = "uploads";

    // auto-route by file type
    if (file.mimetype.startsWith("image/")) {
      folder = "carousel-images";
    } else if (file.mimetype.startsWith("audio/")) {
      folder = "chat-voice-notes";
    } else if (file.mimetype.startsWith("video/")) {
      folder = "videos";
    }

    return {
      folder,

      // IMPORTANT: let Cloudinary decide type correctly
      resource_type: "auto",

      public_id: `${folder}-${Date.now()}`,
    };
  },
});

/* ================= FILTER ================= */
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    // images (carousel)
    "image/jpeg",
    "image/png",
    "image/webp",

    // audio
    "audio/webm",
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",

    // optional video
    "video/mp4",
    "video/webm",
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Unsupported file type"), false);
  }
};

/* ================= UPLOAD ================= */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

module.exports = upload;

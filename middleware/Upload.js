const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/Cloudinary");

/* ================= STORAGE ================= */
const storage = new CloudinaryStorage({
  cloudinary,
  params: (req, file) => {
    let folder = "uploads";

    if (file.mimetype.startsWith("image/")) {
      folder = "carousel-images";
    } else if (file.mimetype.startsWith("audio/")) {
      folder = "chat-voice-notes";
    } else if (file.mimetype.startsWith("video/")) {
      folder = "videos";
    } else if (
      file.mimetype === "application/vnd.android.package-archive" ||
      file.originalname?.endsWith(".apk")
    ) {
      folder = "apk-files";
    }

    return {
      folder,

      // IMPORTANT for APK + non-media files
      resource_type: "auto",

      public_id: `${folder}-${Date.now()}`,
    };
  },
});

/* ================= FILE FILTER ================= */
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    // images
    "image/jpeg",
    "image/png",
    "image/webp",

    // audio
    "audio/webm",
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",

    // video
    "video/mp4",
    "video/webm",

    // apk (varies by browser/device)
    "application/vnd.android.package-archive",
    "application/octet-stream",
    "application/x-zip-compressed",
  ];

  const isApk = file.originalname?.toLowerCase().endsWith(".apk");

  if (allowedMimeTypes.includes(file.mimetype) || isApk) {
    cb(null, true);
  } else {
    cb(new Error("Unsupported file type"), false);
  }
};

/* ================= UPLOAD CONFIG ================= */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB (APK-safe)
  },
});

module.exports = upload;

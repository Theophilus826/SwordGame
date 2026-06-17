const express = require("express");
const router = express.Router();

const { protect, admin } = require("../middleware/AuthMiddleware");
const upload = require("../middleware/Upload");

const {
  getPendingDeposits,
  approveDeposit,
  rejectDeposit,
  adminCreditCoins,
  uploadCarousel,
  getSlides,
  deleteSlide,
  getTactical,
  getTransactions,
  markDepositAsRead,
  uploadReceipt,
  approveWithdrawal,
  rejectWithdrawal,
  getWithdrawalFeed,
  uploadAppVersion,
  getLatestAppVersion,
  getApks,
  deleteApk,
} = require("../controller/AdminController");

// ================= COINS =================
router.put("/credit-coins", protect, admin, adminCreditCoins);

// ================= TACTICAL =================
router.get("/tactical", protect, admin, getTactical);

// ================= TRANSACTIONS =================
router.get("/transactions", protect, admin, getTransactions);

// ================= DEPOSITS =================
router.get("/deposits/pending", protect, admin, getPendingDeposits);
router.put("/deposits/approve/:depositId", protect, admin, approveDeposit);
router.put("/deposits/reject/:depositId", protect, admin, rejectDeposit);
router.put("/deposits/read/:depositId", protect, admin, markDepositAsRead);

// 👇 USER upload receipt (correct)
router.put(
  "/deposits/upload-receipt",
  protect,
  upload.single("receipt"),
  uploadReceipt
);

// ================= WITHDRAWALS (🔥 FIXED) =================

// ✅ FETCH withdrawals (THIS WAS MISSING)
router.get("/withdrawals", protect, admin, getWithdrawalFeed);

// ✅ APPROVE withdrawal
router.put(
  "/withdrawals/approve/:id",
  protect,
  admin,
  approveWithdrawal
);

// ✅ REJECT withdrawal
router.put(
  "/withdrawals/reject/:id",
  protect,
  admin,
  rejectWithdrawal
);

// ================= CAROUSEL =================
router.post(
  "/carousel/upload",
  protect,
  admin,
  upload.array("images", 10),
  uploadCarousel
);

router.get("/carousel/slides", getSlides);
router.delete("/carousel/delete/:id", protect, admin, deleteSlide);

// ================= APK MANAGER =================

// list all APKs
router.get(
  "/apk",
  protect,
  admin,
  getApks
);

// upload APK
router.post(
  "/apk/upload",
  protect,
  admin,
  (req, res, next) => {
    console.log("UPLOAD REQUEST RECEIVED");

    upload.single("apk")(req, res, (err) => {
      if (err) {
        console.error("MULTER/CLOUDINARY ERROR:", err);

        return res.status(500).json({
          success: false,
          message: err.message,
          stack: process.env.NODE_ENV !== "production"
            ? err.stack
            : undefined,
        });
      }

      console.log("UPLOAD MIDDLEWARE PASSED");
      console.log("FILE:", req.file);

      next();
    });
  },
  uploadAppVersion
);

// delete APK
router.delete(
  "/apk/:id",
  protect,
  admin,
  deleteApk
);

// public latest APK
router.get(
  "/app/latest",
  getLatestAppVersion
);

module.exports = router;

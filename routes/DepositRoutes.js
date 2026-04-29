const express = require("express");

const {
  generateDepositAccount,
  confirmDeposit,
  getDepositHistory,
  virtualAccountWebhook,
  uploadReceipt,
} = require("../controller/DepositController");

const { getWalletBalance } = require("../controller/AccountController");

const { protect } = require("../middleware/AuthMiddleware"); // ✅ FIX ADDED

const upload = require("../middleware/Upload");

const router = express.Router();

// ==========================
// Protected routes
// ==========================
router.post("/deposit-account", protect, generateDepositAccount);
router.post("/confirm", protect, confirmDeposit);
router.get("/deposit-history", protect, getDepositHistory);
router.get("/balance", protect, getWalletBalance);
router.post(
  "/upload-receipt",
  protect,
  upload.single("receipt"), // ✅ IMPORTANT (matches frontend)
  uploadReceipt,
);
// ==========================
// Public webhook route
// ==========================
router.post("/webhook/virtual-account", virtualAccountWebhook);

module.exports = router;

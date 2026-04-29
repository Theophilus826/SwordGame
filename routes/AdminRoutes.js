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
  getTransactions,markDepositAsRead,
} = require("../controller/AdminController");

// COINS
router.put("/credit-coins", protect, admin, adminCreditCoins);
// TACTICAL
router.get("/tactical", protect, admin, getTactical);

// TRANSACTIONS
router.get("/transactions", protect, admin, getTransactions);
// DEPOSITS
router.get("/deposits/pending", protect, admin, getPendingDeposits);
router.put("/deposits/approve/:depositId", protect, admin, approveDeposit);
router.put("/deposits/reject/:depositId", protect, admin, rejectDeposit);
router.put(
  "/deposits/read/:depositId",
  protect,
  admin,
  markDepositAsRead
);
router.put("/deposits/upload-receipt/:id")
// CAROUSEL
router.post(
  "/carousel/upload",
  protect,
  admin,
  upload.array("images", 10),
  uploadCarousel
);
router.get("/carousel/slides", getSlides);
router.delete("/carousel/delete/:id", protect, admin, deleteSlide);

module.exports = router;

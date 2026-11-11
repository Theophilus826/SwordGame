
const express = require("express");
const router = express.Router();

const {
  submitPayment,
  getMyPayments,
  getAllPayments,
  verifyPayment,
  rejectPayment,
  approveTeam,
  getPaymentById,
} = require("../controller/TournamentPaymentController");

const { protect, admin  } = require("../middleware/AuthMiddleware");

// --------------------------------------------------
// ADMIN AUTHORIZATION
// --------------------------------------------------

const adminOnly = (req, res, next) => {
  const role = String(req.user?.role || "").toLowerCase();

  if (!["admin", "superadmin"].includes(role)) {
    return res.status(403).json({
      success: false,
      message: "Admin access required.",
    });
  }

  next();
};

// --------------------------------------------------
// TEAM / USER PAYMENT ROUTES
// --------------------------------------------------

// Submit payment
router.post("/", protect, submitPayment);

// Get logged-in user's payments
router.get("/my-payments", protect, getMyPayments);

// Get individual payment details
router.get("/:paymentId", protect, getPaymentById);

// --------------------------------------------------
// ADMIN PAYMENT ROUTES
// --------------------------------------------------

// Get all payments, optionally filtered by status/tournament
router.get("/", protect, adminOnly, getAllPayments);

// Verify payment
router.patch(
  "/:paymentId/verify",
  protect,
  admin,
  verifyPayment
);

// Reject payment
router.patch(
  "/:paymentId/reject",
  protect,
  admin,
  rejectPayment
);

// --------------------------------------------------
// ADMIN TEAM APPROVAL
// --------------------------------------------------

router.patch(
  "/teams/:teamId/approve",
  protect,
  admin,
  approveTeam
);

module.exports = router;

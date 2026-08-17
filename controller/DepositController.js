const asyncHandler = require("express-async-handler");
const Payment = require("../models/PaymentModel");

const { updateCoins } = require("./AccountController");

// ============================================================
// AUTH HELPER
// ============================================================
const getUserFromRequest = (req) => {
  if (!req.user) {
    throw new Error("User not authenticated");
  }

  return {
    id: req.user.id || req.user._id,
    name: req.user.name || "User",
    email: req.user.email || "",
  };
};

// ============================================================
const generateDepositAccount = asyncHandler(async (req, res) => {
  try {
    // =========================
    // AUTH
    // =========================
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    // =========================
    // USER INPUT
    // =========================
    const { amount, method = "bank" } = req.body || {};

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount < 500) {
      return res.status(400).json({
        success: false,
        message: "Minimum deposit is ₦500",
      });
    }

    // =========================
    // METHOD
    // =========================
    const normalizedMethod = String(method)
      .trim()
      .toLowerCase();

    const allowedMethods = [
      "bank",
      "custom",
      "manual",
      "link",
      "opay",
      "palmpay",
    ];

    if (!allowedMethods.includes(normalizedMethod)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    // =========================
    // GET ADMIN PAYMENT SETTINGS
    // =========================
    const payment = await Payment.findOne().sort({
      updatedAt: -1,
    });

    if (!payment) {
      return res.status(400).json({
        success: false,
        message: "Payment account has not been configured by admin",
      });
    }

    // =========================
    // PAYMENT DETAILS
    // =========================
    const bankName = String(payment.bankName || "").trim();
    const accountName = String(payment.accountName || "").trim();
    const accountNumber = String(payment.accountNumber || "").trim();
    const paymentLink = String(payment.paymentLink || "").trim();

    // =========================
    // VALIDATE SETTINGS
    // =========================
    if (!accountNumber && !paymentLink) {
      return res.status(400).json({
        success: false,
        message:
          "Payment account number or payment link has not been configured",
      });
    }

    if (accountNumber && (!bankName || !accountName)) {
      return res.status(400).json({
        success: false,
        message:
          "Payment bank name and account name are required",
      });
    }

    // =========================
    // RETURN PAYMENT ACCOUNT
    // =========================
    return res.status(200).json({
      success: true,
      message: "Payment account loaded successfully",

      deposit: {
        amount: numericAmount,
        method: normalizedMethod,

        bankName: bankName || "Payment Link",
        accountName: accountName || "Payment Link",
        accountNumber,
        paymentLink,
      },
    });

  } catch (error) {
    console.error("GENERATE PAYMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load payment account",
      error: error.message,
    });
  }
});


// ============================================================
const confirmDeposit = asyncHandler(
  async (req, res) => {
    try {
      const { id: userId } =
        getUserFromRequest(req);

      const { depositId } = req.body;

      if (!depositId) {
        return res.status(400).json({
          success: false,
          message:
            "Deposit ID is required",
        });
      }

      const deposit =
        await Deposit.findById(
          depositId,
        );

      if (!deposit) {
        return res.status(404).json({
          success: false,
          message: "Deposit not found",
        });
      }

      // ========================================================
      // SECURITY
      // ========================================================
      if (
        deposit.user.toString() !==
        userId.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized",
        });
      }

      // ========================================================
      // ALREADY COMPLETED
      // ========================================================
      if (
        deposit.status === "COMPLETED"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Deposit already completed",
        });
      }

      // ========================================================
      // ALREADY REJECTED
      // ========================================================
      if (
        deposit.status === "FAILED"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Deposit has been rejected",
        });
      }

      // ========================================================
      // DO NOT CREDIT HERE
      // ========================================================
      //
      // The user is only informing the system that they have
      // supposedly made the payment.
      //
      // Admin must verify the receipt and approve it.
      // ========================================================
      deposit.reviewStatus =
        "PENDING_REVIEW";

      await deposit.save();

      // ========================================================
      // NOTIFY ADMIN
      // ========================================================
      if (req.io) {
        req.io.emit(
          "admin:deposit-review",
          {
            depositId:
              deposit._id,
            userId:
              userId.toString(),
          },
        );
      }

      return res.status(200).json({
        success: true,
        message:
          "Payment submitted for admin review",
        deposit,
      });
    } catch (err) {
      console.error(
        "CONFIRM DEPOSIT ERROR:",
        err,
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to submit deposit for review",
        error: err.message,
      });
    }
  },
);

// ============================================================
// GET DEPOSIT HISTORY
// ============================================================
const getDepositHistory = asyncHandler(
  async (req, res) => {
    try {
      const { id: userId } =
        getUserFromRequest(req);

      const history =
        await Deposit.find({
          user: userId,
        }).sort({
          createdAt: -1,
        });

      return res.status(200).json({
        success: true,
        deposits: history,
      });
    } catch (err) {
      console.error(
        "GET DEPOSIT HISTORY ERROR:",
        err,
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to get deposit history",
        error: err.message,
      });
    }
  },
);

// ============================================================
// MONNIFY WEBHOOK
// ============================================================
// This is separate from manual receipt approval.
//
// If you use Monnify virtual accounts, Monnify can automatically
// confirm the payment.
//
// IMPORTANT:
//
// The webhook should be protected using Monnify's recommended
// signature/authentication verification in production.
// ============================================================
const virtualAccountWebhook =
  asyncHandler(async (req, res) => {
    try {
      const {
        eventType,
        eventData,
      } = req.body;

      // ========================================================
      // IGNORE OTHER EVENTS
      // ========================================================
      if (
        eventType !==
        "SUCCESSFUL_TRANSACTION"
      ) {
        return res.sendStatus(200);
      }

      if (!eventData) {
        return res.sendStatus(200);
      }

      const {
        accountReference,
        amountPaid,
        paymentReference,
      } = eventData;

      // ========================================================
      // VALIDATE REFERENCE
      // ========================================================
      if (!accountReference) {
        console.error(
          "MONNIFY WEBHOOK: Missing accountReference",
        );

        return res.sendStatus(200);
      }

      // ========================================================
      // VALIDATE AMOUNT
      // ========================================================
      const paidAmount =
        Number(amountPaid);

      if (
        !Number.isFinite(paidAmount) ||
        paidAmount <= 0
      ) {
        console.error(
          "MONNIFY WEBHOOK: Invalid amount:",
          amountPaid,
        );

        return res.sendStatus(200);
      }

      // ========================================================
      // FIND DEPOSIT
      // ========================================================
      const deposit =
        await Deposit.findOne({
          reference:
            accountReference,
        });

      if (!deposit) {
        console.warn(
          "MONNIFY WEBHOOK: Deposit not found:",
          accountReference,
        );

        return res.sendStatus(200);
      }

      // ========================================================
      // PREVENT DOUBLE CREDIT
      // ========================================================
      if (
        deposit.status ===
        "COMPLETED"
      ) {
        return res.sendStatus(200);
      }

      // ========================================================
      // EXPECTED AMOUNT
      // ========================================================
      const expectedAmount =
        Number(
          deposit.expectedAmount,
        );

      // ========================================================
      // AMOUNT MISMATCH
      // ========================================================
      if (
        Number.isFinite(
          expectedAmount,
        ) &&
        paidAmount !== expectedAmount
      ) {
        console.warn(
          "MONNIFY WEBHOOK: Amount mismatch",
          {
            depositId:
              deposit._id,
            expectedAmount,
            paidAmount,
          },
        );

        deposit.paymentReference =
          paymentReference || "";

        deposit.reviewStatus =
          "PENDING_REVIEW";

        await deposit.save();

        return res.sendStatus(200);
      }

      // ========================================================
      // COMPLETE DEPOSIT
      // ========================================================
      deposit.status = "COMPLETED";

      deposit.amount =
        paidAmount;

      deposit.paymentReference =
        paymentReference || "";

      deposit.reviewStatus =
        "APPROVED";

      await deposit.save();

      // ========================================================
      // CREDIT WALLET
      // ========================================================
      const result =
        await updateCoins({
          userId:
            deposit.user.toString(),
          amount:
            paidAmount,
          type: "DEPOSIT",
          description: `Monnify deposit (${
            paymentReference ||
            "N/A"
          })`,
        });

      // ========================================================
      // SOCKET UPDATE
      // ========================================================
      if (req.io) {
        req.io
          .to(
            deposit.user.toString(),
          )
          .emit(
            "wallet:update",
            {
              coins:
                result.coins,
              depositId:
                deposit._id,
            },
          );
      }

      return res.sendStatus(200);
    } catch (err) {
      console.error(
        "MONNIFY WEBHOOK ERROR:",
        err,
      );

      return res.status(500).json({
        success: false,
        message:
          "Webhook failed",
      });
    }
  });

// ============================================================
// UPLOAD RECEIPT
// ============================================================
const uploadReceipt = asyncHandler(
  async (req, res) => {
    try {
      const { id: userId } =
        getUserFromRequest(req);

      const { depositId } = req.body;

      // ========================================================
      // VALIDATE DEPOSIT ID
      // ========================================================
      if (!depositId) {
        return res.status(400).json({
          success: false,
          message:
            "Deposit ID required",
        });
      }

      // ========================================================
      // VALIDATE FILE
      // ========================================================
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message:
            "No receipt file uploaded",
        });
      }

      // ========================================================
      // FIND DEPOSIT
      // ========================================================
      const deposit =
        await Deposit.findById(
          depositId,
        );

      if (!deposit) {
        return res.status(404).json({
          success: false,
          message:
            "Deposit not found",
        });
      }

      // ========================================================
      // SECURITY
      // ========================================================
      if (
        deposit.user.toString() !==
        userId.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized",
        });
      }

      // ========================================================
      // PREVENT UPLOAD AFTER COMPLETION
      // ========================================================
      if (
        deposit.status ===
        "COMPLETED"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This deposit has already been completed",
        });
      }

      // ========================================================
      // PREVENT UPLOAD AFTER REJECTION
      // ========================================================
      if (
        deposit.status ===
        "FAILED"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This deposit has been rejected",
        });
      }

      // ========================================================
      // PREVENT DUPLICATE RECEIPT
      // ========================================================
      if (deposit.receipt) {
        return res.status(400).json({
          success: false,
          message:
            "Receipt already uploaded",
        });
      }

      // ========================================================
      // SAVE RECEIPT
      // ========================================================
      deposit.receipt =
        req.file.path;

      deposit.reviewStatus =
        "PENDING_REVIEW";

      await deposit.save();

      // ========================================================
      // NOTIFY ADMIN
      // ========================================================
      if (req.io) {
        req.io.emit(
          "admin:new-receipt",
          {
            depositId:
              deposit._id,
            userId:
              userId.toString(),
          },
        );
      }

      return res.status(200).json({
        success: true,
        message:
          "Receipt uploaded successfully",
        deposit,
      });
    } catch (err) {
      console.error(
        "UPLOAD RECEIPT ERROR:",
        err,
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to upload receipt",
        error: err.message,
      });
    }
  },
);

// ============================================================
// ADMIN: GET PAYMENT SETTINGS
// ============================================================
const getPaymentSettings =
  asyncHandler(async (req, res) => {
    try {
      const payment =
        await Payment.findOne().sort({
          updatedAt: -1,
        });

      if (!payment) {
        return res.status(200).json({
          success: true,
          data: {
            bankName: "",
            accountName: "",
            accountNumber: "",
            paymentLink: "",
          },
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          bankName:
            payment.bankName || "",
          accountName:
            payment.accountName || "",
          accountNumber:
            payment.accountNumber ||
            "",
          paymentLink:
            payment.paymentLink || "",
        },
      });
    } catch (err) {
      console.error(
        "GET PAYMENT SETTINGS ERROR:",
        err,
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to get payment settings",
      });
    }
  });

// ============================================================
// ADMIN: UPDATE PAYMENT SETTINGS
// ============================================================
// This is where the admin enters:
//
// Bank Name
// Account Name
// Account Number
// Payment Link
//
// Example:
//
// PUT /admin/payment-settings
//
// {
//   "bankName": "OPay",
//   "accountName": "Theophilus Telecom",
//   "accountNumber": "1234567890",
//   "paymentLink": "https://..."
// }
// ============================================================
const updatePaymentSettings =
  asyncHandler(async (req, res) => {
    try {
      const {
        bankName,
        accountName,
        accountNumber,
        paymentLink,
      } = req.body;

      // ========================================================
      // VALIDATION
      // ========================================================
      if (
        !bankName ||
        !bankName.trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Bank name is required",
        });
      }

      if (
        !accountName ||
        !accountName.trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Account name is required",
        });
      }

      if (
        !accountNumber ||
        !accountNumber.trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Account number is required",
        });
      }

      // ========================================================
      // FIND EXISTING SETTINGS
      // ========================================================
      let payment =
        await Payment.findOne();

      // ========================================================
      // CREATE IF NOT FOUND
      // ========================================================
      if (!payment) {
        payment =
          new Payment();
      }

      // ========================================================
      // SAVE SETTINGS
      // ========================================================
      payment.bankName =
        bankName.trim();

      payment.accountName =
        accountName.trim();

      payment.accountNumber =
        accountNumber.trim();

      payment.paymentLink =
        paymentLink?.trim() || "";

      await payment.save();

      // ========================================================
      // RESPONSE
      // ========================================================
      return res.status(200).json({
        success: true,
        message:
          "Payment settings saved successfully",
        data: {
          bankName:
            payment.bankName,
          accountName:
            payment.accountName,
          accountNumber:
            payment.accountNumber,
          paymentLink:
            payment.paymentLink ||
            "",
        },
      });
    } catch (err) {
      console.error(
        "UPDATE PAYMENT SETTINGS ERROR:",
        err,
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to save payment settings",
      });
    }
  });

// ============================================================
// EXPORT
// ============================================================
module.exports = {
  generateDepositAccount,
  confirmDeposit,
  getDepositHistory,
  virtualAccountWebhook,
  uploadReceipt,

  // ADMIN PAYMENT SETTINGS
  getPaymentSettings,
  updatePaymentSettings,
};

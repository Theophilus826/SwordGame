const express = require("express");
const router = express.Router();

const User = require("../models/UserModels");
const {
  Referral,
  AdminSettings,
} = require("../models/ShareModels");

const {
  completeReferralTask,
  getSettings,
  updateSettings,
  getAllReferrals,
  rewardReferral
} = require("../controller/ShareControllers");

const { protect, admin  } = require("../middleware/AuthMiddleware");

/* ==========================================
   REFERRAL STATS
========================================== */

router.get("/referral-stats", protect, async (req, res) => {
  try {
    let settings = await AdminSettings.findOne();

    if (!settings) {
      settings = await AdminSettings.create({
        referralsRequired: 5,
        rewardCoins: 10,
      });
    }

    const user = await User.findById(req.user._id);

    const referrals = await Referral.countDocuments({
      referrer: req.user._id,
    });

    const rewarded = await Referral.countDocuments({
      referrer: req.user._id,
      rewarded: true,
    });

    const invitees = await Referral.find({
      referrer: req.user._id,
    })
      .populate("referredUser", "name email phone")
      .select("referredUser completed rewarded createdAt")
      .sort({ createdAt: -1 });

    res.json({
      success: true,

      cash: user?.coins || 0,

      referrals,

      rewarded,

      required: settings.referralsRequired,

      reward: settings.rewardCoins,

      milestones: [
        {
          users: 2,
          reward: 2400,
        },
        {
          users: 5,
          reward: 5200,
        },
        {
          users: 8,
          reward: 18000,
        },
      ],

      invitees,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Unable to fetch referral stats",
    });
  }
});

/* ==========================================
   COMPLETE REFERRAL TASK
========================================== */

router.post(
  "/complete-task",
  protect,
  completeReferralTask
);

/* ==========================================
   REWARD HISTORY
========================================== */

router.get("/reward-history", protect, async (req, res) => {
  try {
    const history = await Referral.find({
      referrer: req.user._id,
      rewarded: true,
    })
      .populate("referredUser", "name email phone")
      .select("referredUser rewarded completed updatedAt")
      .sort({ updatedAt: -1 });

    res.json({
      success: true,
      history,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Unable to load reward history",
    });
  }
});

/* ==========================================
   WITHDRAW
========================================== */

router.post("/withdraw", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user || user.coins <= 0) {
      return res.status(400).json({
        success: false,
        message: "No balance available",
      });
    }

    /*
      TODO:
      Replace with your payout logic
      Flutterwave
      Paystack
      Bank Transfer
      Mobile Money
    */

    user.coins = 0;

    await user.save();

    res.json({
      success: true,
      message: "Withdrawal request submitted",
      balance: user.coins,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Withdrawal failed",
    });
  }
});

router.get("/admin/settings", protect, admin, getSettings);

router.put("/admin/settings", protect, admin, updateSettings);

router.get("/admin/referrals", protect, admin, getAllReferrals);

router.post("/admin/reward/:id", protect, admin, rewardReferral);
module.exports = router;

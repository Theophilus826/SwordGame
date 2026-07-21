const User = require("../models/UserModels");
const { Referral, AdminSettings } = require("../models/ShareModels");

/* ===========================
   GENERATE REFERRAL CODE
=========================== */

const generateReferralCode = async () => {
  let code;
  let exists = true;

  while (exists) {
    code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const user = await User.findOne({ referralCode: code });

    if (!user) exists = false;
  }

  return code;
};

/* ===========================
   SAVE REFERRAL
=========================== */

const handleReferral = async (newUserId, referralCode) => {
  try {
    if (!referralCode) return;

    const referrer = await User.findOne({
      referralCode,
    });

    if (!referrer) return;

    if (referrer._id.toString() === newUserId.toString()) return;

    const exists = await Referral.findOne({
      referredUser: newUserId,
    });

    if (exists) return;

    await Referral.create({
      referrer: referrer._id,
      referredUser: newUserId,
      completed: false,
      rewarded: false,
    });

    await User.findByIdAndUpdate(newUserId, {
      referredBy: referrer._id,
    });
  } catch (err) {
    console.error("Referral Error:", err.message);
  }
};

/* ===========================
   USER COMPLETES TASK
=========================== */

const completeReferralTask = async (req, res) => {
  try {
    const referral = await Referral.findOne({
      referredUser: req.user._id,
    });

    if (!referral) {
      return res.json({
        success: true,
        message: "No referral found",
      });
    }

    if (referral.completed) {
      return res.json({
        success: true,
        message: "Task already completed",
      });
    }

    referral.completed = true;

    await referral.save();

    res.json({
      success: true,
      message: "Referral task completed and waiting for admin approval.",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* ===========================
   ADMIN SETTINGS
=========================== */

const getSettings = async (req, res) => {
  try {
    let settings = await AdminSettings.findOne();

    if (!settings) {
      settings = await AdminSettings.create({
        referralsRequired: 5,
        rewardCoins: 10,
      });
    }

    res.json({
      success: true,
      settings,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const updateSettings = async (req, res) => {
  try {
    const { referralsRequired, rewardCoins } = req.body;

    let settings = await AdminSettings.findOne();

    if (!settings) {
      settings = await AdminSettings.create({
        referralsRequired,
        rewardCoins,
      });
    } else {
      settings.referralsRequired = referralsRequired;
      settings.rewardCoins = rewardCoins;
      await settings.save();
    }

    res.json({
      success: true,
      settings,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* ===========================
   ADMIN GET REFERRALS
=========================== */

const getAllReferrals = async (req, res) => {
  try {
    const referrals = await Referral.find()
      .populate("referrer", "name email phone")
      .populate("referredUser", "name email phone")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      referrals,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* ===========================
   ADMIN REWARD
=========================== */

const rewardReferral = async (req, res) => {
  try {
    const referral = await Referral.findById(req.params.id);

    if (!referral) {
      return res.status(404).json({
        success: false,
        message: "Referral not found",
      });
    }

    if (!referral.completed) {
      return res.status(400).json({
        success: false,
        message: "Referral task not completed",
      });
    }

    if (referral.rewarded) {
      return res.status(400).json({
        success: false,
        message: "Already rewarded",
      });
    }

    let settings = await AdminSettings.findOne();

    if (!settings) {
      settings = await AdminSettings.create({
        referralsRequired: 5,
        rewardCoins: 10,
      });
    }

    await User.findByIdAndUpdate(referral.referrer, {
      $inc: {
        coins: settings.rewardCoins,
      },
    });

    referral.rewarded = true;

    await referral.save();

    res.json({
      success: true,
      message: "Reward sent successfully.",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = {
  generateReferralCode,
  handleReferral,
  completeReferralTask,

  getSettings,
  updateSettings,

  getAllReferrals,
  rewardReferral,
};

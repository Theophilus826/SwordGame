const bcrypt = require("bcryptjs");
const User = require("../models/UserModels");
const { Referral, AdminSettings } = require("../models/ShareModels");

/* ---------------- GENERATE UNIQUE REFERRAL CODE ---------------- */
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

/* ---------------- HANDLE REFERRAL ---------------- */
const handleReferral = async (newUserId, referralCode) => {
  try {
    if (!referralCode) return;

    const referrer = await User.findOne({ referralCode });

    if (!referrer) return;

    if (referrer._id.toString() === newUserId.toString()) return;

    const existingReferral = await Referral.findOne({
      referredUser: newUserId,
    });

    if (existingReferral) return;

    /* Save referral */
    await Referral.create({
      referrer: referrer._id,
      referredUser: newUserId,
    });

    /* Mark who referred the user */
    await User.findByIdAndUpdate(newUserId, {
      referredBy: referrer._id,
    });

    /* Get admin settings */
    let settings = await AdminSettings.findOne();

    if (!settings) {
      settings = await AdminSettings.create({
        referralsRequired: 5,
        rewardCoins: 10,
      });
    }

    const required = settings.referralsRequired;
    const reward = settings.rewardCoins;

    /* Count un-rewarded referrals */
    const pendingReferrals = await Referral.find({
      referrer: referrer._id,
      rewarded: false,
    }).limit(required);

    /* Reward when requirement reached */
    if (pendingReferrals.length === required) {
      await User.findByIdAndUpdate(referrer._id, {
        $inc: { coins: reward },
      });

      await Referral.updateMany(
        { _id: { $in: pendingReferrals.map((r) => r._id) } },
        { rewarded: true }
      );
    }
  } catch (err) {
    console.error("Referral Error:", err.message);
  }
};

/* ---------------- REGISTER USER ---------------- */
const register = async (req, res) => {
  try {
    const { name, email, password, referralCode } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email and password are required",
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newReferralCode = await generateReferralCode();

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      referralCode: newReferralCode,
    });

    /* Process referral */
    await handleReferral(user._id, referralCode);

    const safeUser = {
      _id: user._id,
      name: user.name,
      email: user.email,
      referralCode: user.referralCode,
      coins: user.coins,
    };

    res.status(201).json({
      success: true,
      message: "User created successfully",
      user: safeUser,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = {
  register,
  handleReferral,
};

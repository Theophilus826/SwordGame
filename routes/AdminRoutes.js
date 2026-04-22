const express = require("express");
const router = express.Router();

const { protect, admin } = require("../middleware/AuthMiddleware");
const { adminCreditCoins } = require("../controller/AccountController");
const { playersByUser } = require("../games/gameState");
const CoinTransaction = require("../models/CoinTransaction");
const Slide = require("../models/Slide");
const upload = require("../middleware/upload");
const cloudinary = require("../config/Cloudinary");

/* ===================== COINS ===================== */
router.put("/credit-coins", protect, admin, adminCreditCoins);

/* ===================== TACTICAL MONITOR ===================== */
router.get("/tactical", protect, admin, (req, res) => {
  try {
    const players = [];

    playersByUser.forEach((player) => {
      if (!player.room) return;

      players.push({
        userId: player.userId,
        username: player.username,
        position: player.position,
        health: player.health,
        room: player.room,
      });
    });

    return res.status(200).json({ players });
  } catch (err) {
    console.error("Tactical error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ===================== TRANSACTIONS ===================== */
router.get("/transactions", protect, admin, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 50);
    const skip = (page - 1) * limit;

    const { search = "", type } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { referenceId: { $regex: search, $options: "i" } },
        { "user.username": { $regex: search, $options: "i" } },
      ];
    }

    if (type) query.type = type;

    const transactions = await CoinTransaction.find(query)
      .populate("user", "username email")
      .populate("performedBy", "username email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.status(200).json({ transactions });
  } catch (err) {
    console.error("Transaction error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ===================== CAROUSEL UPLOAD ===================== */
router.post(
  "/carousel/upload",
  protect,
  admin,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image uploaded" });
      }

      const slide = await Slide.create({
        src: req.file.path,
        public_id: req.file.filename,
      });

      return res.status(200).json({
        success: true,
        slide,
      });
    } catch (err) {
      console.error("Upload error:", err);
      return res.status(500).json({ message: "Upload failed" });
    }
  }
);

/* ===================== GET CAROUSEL SLIDES ===================== */
router.get("/carousel/slides", async (req, res) => {
  try {
    const slides = await Slide.find().sort({ createdAt: -1 });

    return res.status(200).json({ slides });
  } catch (err) {
    console.error("Fetch slides error:", err);
    return res.status(500).json({ message: "Failed to load slides" });
  }
});

/* ===================== DELETE CAROUSEL SLIDE ===================== */
router.delete("/carousel/delete/:id", protect, admin, async (req, res) => {
  try {
    const slide = await Slide.findById(req.params.id);

    if (!slide) {
      return res.status(404).json({ message: "Slide not found" });
    }

    // delete from Cloudinary
    if (slide.public_id) {
      await cloudinary.v2.uploader.destroy(slide.public_id);
    }

    await slide.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Slide deleted",
    });
  } catch (err) {
    console.error("Delete error:", err);
    return res.status(500).json({ message: "Delete failed" });
  }
});

module.exports = router;

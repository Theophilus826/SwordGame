const express = require("express");
const path = require("path");
const router = express.Router();
const { protect, adminOnly } = require("../middleware/AuthMiddleware");

router.get("/", protect, adminOnly, (req, res) => {
  res.sendFile(
    path.join(__dirname, "../public/admin/monitor.html")
  );
});

module.exports = router;

const express = require("express");
const router = express.Router();

const {
  createGroup,
  getMyGroups,
  getGroup,
  addMember,
  removeMember,
  leaveGroup,
  changeRole,
  deleteGroup,
} = require("../controller/GroupController");

// ✅ FIX: destructure protect from middleware
const { protect } = require("../middleware/AuthMiddleware");

/* ================= GROUP CORE ================= */

// Create group
router.post("/", protect, createGroup);
router.post("/create", protect, createGroup);
// Get my groups
router.get("/", protect, getMyGroups);

// Get single group
router.get("/:groupId", protect, getGroup);

// Delete group
router.delete("/:groupId", protect, deleteGroup);

/* ================= MEMBERS ================= */

// Add member
router.post("/:groupId/members", protect, addMember);

// Remove member
router.delete("/:groupId/members/:memberId", protect, removeMember);

// Leave group
router.delete("/:groupId/members/me", protect, leaveGroup);

/* ================= ROLES ================= */

// Change role
router.patch("/:groupId/members/:memberId/role", protect, changeRole);
router.get("/stream/:groupId/:userId", protect, async (req, res) => {
  const { groupId } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  req.on("close", () => {
    res.end();
  });

  // optional: send initial ping
  res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);
});

module.exports = router;

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

module.exports = router;

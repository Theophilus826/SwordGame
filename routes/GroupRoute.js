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

const auth = require("../middleware/AuthMiddleware");

/* ================= GROUP CORE ================= */

// Create group
router.post("/", auth, createGroup);

// Get my groups
router.get("/", auth, getMyGroups);

// Get single group
router.get("/:groupId", auth, getGroup);

// Delete group
router.delete("/:groupId", auth, deleteGroup);

/* ================= MEMBERS ================= */

// Add member
router.post("/:groupId/members", auth, addMember);

// Remove member
router.delete("/:groupId/members/:memberId", auth, removeMember);

// Leave group
router.delete("/:groupId/members/me", auth, leaveGroup);

/* ================= ROLES ================= */

// Change role
router.patch("/:groupId/members/:memberId/role", auth, changeRole);

module.exports = router;

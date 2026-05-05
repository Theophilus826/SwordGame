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

// middleware (adjust to your auth file)
const auth = require("../middleware/AuthMiddleware");

/* ================= GROUP CORE ================= */

// Create group
router.post("/create", auth, createGroup);

// Get my groups
router.get("/my", auth, getMyGroups);

// Get single group
router.get("/:groupId", auth, getGroup);

/* ================= MEMBERSHIP ================= */

// Add member (admin/mod only)
router.post("/add-member", auth, addMember);

// Remove member (admin/mod only)
router.post("/remove-member", auth, removeMember);

// Leave group
router.post("/leave", auth, leaveGroup);

/* ================= ROLES ================= */

// Change role (admin only)
router.post("/change-role", auth, changeRole);

/* ================= DELETE ================= */

// Delete group (creator only)
router.delete("/delete", auth, deleteGroup);

module.exports = router;

const mongoose = require("mongoose");
const Group = require("../models/GroupMessage");

/* ================= HELPERS ================= */

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/* ================= ROLE HELPER ================= */

const getRole = (group, userId) => {
  const member = group.members.find(
    (m) => m.user.toString() === userId.toString()
  );
  return member?.role || null;
};

const isAdmin = (group, userId) =>
  getRole(group, userId) === "admin";

const canModerate = (group, userId) => {
  const role = getRole(group, userId);
  return role === "admin" || role === "moderator";
};

/* ================= CREATE GROUP ================= */

const createGroup = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, members = [] } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ error: "Group name required" });
    }

    const validMembers = members.filter(isValidId);

    const group = await Group.create({
      name: name.trim(),
      members: [
        {
          user: userId,
          role: "admin",
        },
        ...validMembers.map((id) => ({
          user: id,
          role: "member",
        })),
      ],
      createdBy: userId,
    });

    res.json({ group });
  } catch (err) {
    console.error("CREATE GROUP ERROR:", err);
    res.status(500).json({ error: "Failed to create group" });
  }
};

/* ================= GET USER GROUPS ================= */

const getMyGroups = async (req, res) => {
  try {
    const userId = req.user._id;

    const groups = await Group.find({
      "members.user": userId,
    }).populate("members.user", "name avatar");

    res.json({ groups });
  } catch (err) {
    console.error("GET GROUPS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch groups" });
  }
};

/* ================= GET SINGLE GROUP ================= */

const getGroup = async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!isValidId(groupId)) {
      return res.status(400).json({ error: "Invalid group" });
    }

    const group = await Group.findById(groupId)
      .populate("members.user", "name avatar");

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    res.json({ group });
  } catch (err) {
    console.error("GET GROUP ERROR:", err);
    res.status(500).json({ error: "Failed to fetch group" });
  }
};

/* ================= ADD MEMBER ================= */

const addMember = async (req, res) => {
  try {
    const userId = req.user._id;
    const { groupId, memberId } = req.body;

    if (!isValidId(groupId) || !isValidId(memberId)) {
      return res.status(400).json({ error: "Invalid IDs" });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    if (!canModerate(group, userId)) {
      return res.status(403).json({ error: "Not allowed" });
    }

    const exists = group.members.some(
      (m) => m.user.toString() === memberId
    );

    if (!exists) {
      group.members.push({
        user: memberId,
        role: "member",
      });
    }

    await group.save();

    res.json({ message: "Member added", group });
  } catch (err) {
    console.error("ADD MEMBER ERROR:", err);
    res.status(500).json({ error: "Failed to add member" });
  }
};

/* ================= REMOVE MEMBER ================= */

const removeMember = async (req, res) => {
  try {
    const userId = req.user._id;
    const { groupId, memberId } = req.body;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    if (!canModerate(group, userId)) {
      return res.status(403).json({ error: "Not allowed" });
    }

    group.members = group.members.filter(
      (m) => m.user.toString() !== memberId
    );

    await group.save();

    res.json({ message: "Member removed", group });
  } catch (err) {
    console.error("REMOVE MEMBER ERROR:", err);
    res.status(500).json({ error: "Failed to remove member" });
  }
};

/* ================= LEAVE GROUP ================= */

const leaveGroup = async (req, res) => {
  try {
    const userId = req.user._id;
    const { groupId } = req.body;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    group.members = group.members.filter(
      (m) => m.user.toString() !== userId.toString()
    );

    await group.save();

    res.json({ message: "Left group" });
  } catch (err) {
    console.error("LEAVE GROUP ERROR:", err);
    res.status(500).json({ error: "Failed to leave group" });
  }
};

/* ================= PROMOTE / DEMOTE ROLE ================= */

const changeRole = async (req, res) => {
  try {
    const userId = req.user._id;
    const { groupId, memberId, role } = req.body;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    if (!isAdmin(group, userId)) {
      return res.status(403).json({ error: "Only admin allowed" });
    }

    const member = group.members.find(
      (m) => m.user.toString() === memberId
    );

    if (!member) {
      return res.status(404).json({ error: "User not in group" });
    }

    member.role = role; // admin | moderator | member

    await group.save();

    res.json({ message: "Role updated", group });
  } catch (err) {
    console.error("CHANGE ROLE ERROR:", err);
    res.status(500).json({ error: "Failed to update role" });
  }
};

/* ================= DELETE GROUP ================= */

const deleteGroup = async (req, res) => {
  try {
    const userId = req.user._id;
    const { groupId } = req.body;

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: "Group not found" });

    if (group.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({ error: "Only creator can delete" });
    }

    await Group.findByIdAndDelete(groupId);

    res.json({ message: "Group deleted" });
  } catch (err) {
    console.error("DELETE GROUP ERROR:", err);
    res.status(500).json({ error: "Failed to delete group" });
  }
};

/* ================= EXPORT ================= */

module.exports = {
  createGroup,
  getMyGroups,
  getGroup,
  addMember,
  removeMember,
  leaveGroup,
  changeRole,
  deleteGroup,
};

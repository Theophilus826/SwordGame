const mongoose = require("mongoose");

/* ================= MODELS ================= */

const Group = require("../models/Group");
const GroupMessage = require("../models/GroupMessages");

const { pushGroupMessage } = require("../config/sse");

/* ================= HELPERS ================= */

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/* ================= ROLE HELPERS ================= */

const getMember = (group, userId) =>
  group.members.find((m) => m.user.toString() === userId.toString());

const getRole = (group, userId) => {
  const member = getMember(group, userId);

  return member?.role || null;
};

const isAdmin = (group, userId) => getRole(group, userId) === "admin";

const canModerate = (group, userId) => {
  const role = getRole(group, userId);

  return role === "admin" || role === "moderator";
};

const allowedRoles = ["admin", "moderator", "member"];

/* ================= CREATE GROUP ================= */

const createGroup = async (req, res) => {
  try {
    const userId = req.user._id;

    const { name, members = [], avatar = null } = req.body;

    /* ✅ VALIDATION */
    if (!name?.trim()) {
      return res.status(400).json({
        error: "Group name required",
      });
    }

    /* ✅ FILTER VALID IDS */
    const validMembers = members.filter(isValidId);

    /* ✅ REMOVE DUPLICATES */
    const uniqueMembers = [...new Set(validMembers.map((id) => id.toString()))];

    /* ✅ CREATE GROUP */
    const group = await Group.create({
      name: name.trim(),

      avatar,

      members: [
        {
          user: userId,
          role: "admin",
        },

        ...uniqueMembers
          .filter((id) => id !== userId.toString())
          .map((id) => ({
            user: id,
            role: "member",
          })),
      ],

      createdBy: userId,
    });

    /* ✅ POPULATE */
    const populated = await Group.findById(group._id)
      .populate("members.user", "name avatar")
      .populate("createdBy", "name avatar");

    /* ✅ SSE EVENT */
    pushGroupMessage(group._id, {
      type: "group_event",
      event: "group_created",
      group: populated,
    });

    return res.status(201).json({
      success: true,
      group: populated,
    });
  } catch (err) {
    console.error("CREATE GROUP ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to create group",
    });
  }
};

/* ================= GET MY GROUPS ================= */

const getMyGroups = async (req, res) => {
  try {
    const userId = req.user._id;

    const groups = await Group.find({
      "members.user": userId,
    })
      .populate("members.user", "name avatar")
      .populate("createdBy", "name avatar")
      .sort({ updatedAt: -1 });

    return res.json({
      success: true,
      groups,
    });
  } catch (err) {
    console.error("GET GROUPS ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch groups",
    });
  }
};

/* ================= GET SINGLE GROUP ================= */

const getGroup = async (req, res) => {
  try {
    const userId = req.user._id;
    const { groupId } = req.params;

    const group = await Group.findById(groupId)
      .populate("members.user", "name avatar")
      .populate("createdBy", "name avatar");

    if (!group) {
      return res.status(404).json({
        success: false,
        error: "Group not found",
      });
    }

    // 🔥 FIXED MEMBERSHIP CHECK
    const isMember = group.members.some(
      (m) => m.user._id.toString() === userId.toString(),
    );

    if (!isMember) {
      return res.status(403).json({
        success: false,
        error: "Not in group",
      });
    }

    return res.json({
      success: true,
      group,
    });
  } catch (err) {
    console.error("GET GROUP ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch group",
    });
  }
};

/* ================= SEND MESSAGE ================= */

const sendGroupMessage = async (req, res) => {
  try {
    const userId = req.user._id;

    const {
      groupId,
      text = "",
      image = null,
      video = null,
      audio = null,
      file = null,
    } = req.body;

    /* ✅ VALIDATE GROUP ID */
    if (!isValidId(groupId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid group ID",
      });
    }

    /* ✅ REQUIRE CONTENT */
    const hasContent = text?.trim() || image || video || audio || file;

    if (!hasContent) {
      return res.status(400).json({
        success: false,
        error: "Message content required",
      });
    }

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({
        success: false,
        error: "Group not found",
      });
    }

    /* ✅ MUST BE MEMBER */
    const member = getMember(group, userId);

    if (!member) {
      return res.status(403).json({
        success: false,
        error: "Not in group",
      });
    }

    /* ✅ ONLY ADMINS CAN MESSAGE */
    if (group.settings?.onlyAdminsCanMessage && member.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Only admins can send messages",
      });
    }

    /* ✅ CREATE MESSAGE */
    const message = await GroupMessage.create({
      group: groupId,

      fromUser: userId,

      text: text?.trim() || "",

      image,
      video,
      audio,
      file,

      readBy: [
        {
          user: userId,
        },
      ],
    });

    /* ✅ POPULATE */
    const populated = await GroupMessage.findById(message._id)
      .populate("fromUser", "name avatar")
      .populate("readBy.user", "name avatar");

    /* ✅ UPDATE GROUP ACTIVITY */
    group.updatedAt = new Date();

    await group.save();

    /* ✅ SSE PUSH */
    pushGroupMessage(groupId, {
      type: "new_message",
      message: populated,
    });

    return res.status(201).json({
      success: true,
      message: populated,
    });
  } catch (err) {
    console.error("SEND GROUP MESSAGE ERROR:", err);

    return res.status(500).json({
      success: false,
      error: err.message || "Failed to send message",
    });
  }
};

/* ================= GET MESSAGES ================= */

const getGroupMessages = async (req, res) => {
  try {
    const userId = req.user._id;

    const { groupId } = req.params;

    if (!isValidId(groupId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid group ID",
      });
    }

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({
        success: false,
        error: "Group not found",
      });
    }

    /* ✅ MUST BE MEMBER */
    if (!group.isMember(userId)) {
      return res.status(403).json({
        success: false,
        error: "Not in group",
      });
    }

    const messages = await GroupMessage.find({
      group: groupId,
      deletedForEveryone: false,
    })
      .populate("fromUser", "name avatar")
      .populate("readBy.user", "name avatar")
      .sort({ createdAt: 1 });

    return res.json({
      success: true,
      messages,
    });
  } catch (err) {
    console.error("GET GROUP MESSAGES ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch messages",
    });
  }
};

/* ================= ADD MEMBER ================= */

const addMember = async (req, res) => {
  try {
    const userId = req.user._id;

    const { groupId } = req.params;

    const { memberId } = req.body;

    if (!isValidId(memberId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid member ID",
      });
    }

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({
        success: false,
        error: "Group not found",
      });
    }

    /* ✅ SETTINGS CHECK */
    if (group.settings?.onlyAdminsCanAddMembers && !isAdmin(group, userId)) {
      return res.status(403).json({
        success: false,
        error: "Only admins can add members",
      });
    }

    if (!canModerate(group, userId)) {
      return res.status(403).json({
        success: false,
        error: "Not allowed",
      });
    }

    /* ✅ ALREADY MEMBER */
    if (group.isMember(memberId)) {
      return res.status(400).json({
        success: false,
        error: "Already in group",
      });
    }

    group.addMember(memberId);

    await group.save();

    const populated = await Group.findById(groupId).populate(
      "members.user",
      "name avatar",
    );

    pushGroupMessage(groupId, {
      type: "group_event",
      event: "member_added",
      memberId,
      addedBy: userId,
    });

    return res.json({
      success: true,
      message: "Member added",
      group: populated,
    });
  } catch (err) {
    console.error("ADD MEMBER ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to add member",
    });
  }
};

/* ================= REMOVE MEMBER ================= */

const removeMember = async (req, res) => {
  try {
    const userId = req.user._id;

    const { groupId, memberId } = req.params;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({
        success: false,
        error: "Group not found",
      });
    }

    if (!canModerate(group, userId)) {
      return res.status(403).json({
        success: false,
        error: "Not allowed",
      });
    }

    if (!group.isMember(memberId)) {
      return res.status(404).json({
        success: false,
        error: "User not in group",
      });
    }

    group.removeMember(memberId);

    await group.save();

    pushGroupMessage(groupId, {
      type: "group_event",
      event: "member_removed",
      memberId,
      removedBy: userId,
    });

    return res.json({
      success: true,
      message: "Member removed",
      group,
    });
  } catch (err) {
    console.error("REMOVE MEMBER ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to remove member",
    });
  }
};

/* ================= LEAVE GROUP ================= */

const leaveGroup = async (req, res) => {
  try {
    const userId = req.user._id;

    const { groupId } = req.params;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({
        success: false,
        error: "Group not found",
      });
    }

    if (!group.isMember(userId)) {
      return res.status(400).json({
        success: false,
        error: "Not in group",
      });
    }

    group.removeMember(userId);

    /* ✅ AUTO DELETE IF EMPTY */
    if (group.members.length === 0) {
      await Group.findByIdAndDelete(groupId);

      await GroupMessage.deleteMany({
        group: groupId,
      });

      return res.json({
        success: true,
        message: "Group deleted automatically",
      });
    }

    await group.save();

    pushGroupMessage(groupId, {
      type: "group_event",
      event: "member_left",
      userId,
    });

    return res.json({
      success: true,
      message: "Left group",
    });
  } catch (err) {
    console.error("LEAVE GROUP ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to leave group",
    });
  }
};

/* ================= CHANGE ROLE ================= */

const changeRole = async (req, res) => {
  try {
    const userId = req.user._id;

    const { groupId, memberId } = req.params;

    const { role } = req.body;

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: "Invalid role",
      });
    }

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({
        success: false,
        error: "Group not found",
      });
    }

    /* ✅ ONLY ADMINS */
    if (!isAdmin(group, userId)) {
      return res.status(403).json({
        success: false,
        error: "Only admins allowed",
      });
    }

    const member = group.getMember(memberId);

    if (!member) {
      return res.status(404).json({
        success: false,
        error: "User not in group",
      });
    }

    member.role = role;

    await group.save();

    pushGroupMessage(groupId, {
      type: "group_event",
      event: "role_changed",
      memberId,
      role,
      changedBy: userId,
    });

    return res.json({
      success: true,
      message: "Role updated",
      group,
    });
  } catch (err) {
    console.error("CHANGE ROLE ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to update role",
    });
  }
};

/* ================= DELETE GROUP ================= */

const deleteGroup = async (req, res) => {
  try {
    const userId = req.user._id;

    const { groupId } = req.params;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({
        success: false,
        error: "Group not found",
      });
    }

    /* ✅ ONLY CREATOR */
    if (group.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        error: "Only creator can delete",
      });
    }

    await Group.findByIdAndDelete(groupId);

    await GroupMessage.deleteMany({
      group: groupId,
    });

    pushGroupMessage(groupId, {
      type: "group_event",
      event: "group_deleted",
    });

    return res.json({
      success: true,
      message: "Group deleted",
    });
  } catch (err) {
    console.error("DELETE GROUP ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to delete group",
    });
  }
};

/* ================= EXPORT ================= */

module.exports = {
  createGroup,
  getMyGroups,
  getGroup,

  sendGroupMessage,
  getGroupMessages,

  addMember,
  removeMember,
  leaveGroup,

  changeRole,
  deleteGroup,
};

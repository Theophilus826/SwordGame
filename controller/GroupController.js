const mongoose = require("mongoose");

/* ================= MODELS ================= */

const Group = require("../models/Group");
const GroupMessage = require("../models/GroupMessages");

const { pushGroupMessage } = require("../config/sse");
const { rewardGroupAction } = require("../config/groupRewardService");

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
    const uniqueMembers = [
      ...new Set(validMembers.map((id) => id.toString())),
    ];

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

      /* 🔥 INIT STATS (optional but recommended) */
      stats: {
        totalMessages: 0,
        totalCoinsDistributed: 0,
        totalMembersJoined: uniqueMembers.length + 1,
      },
    });

    /* ================= REWARD (COINS) ================= */
    try {
      await rewardGroupAction({
        userId,
        groupId: group._id,
        action: "CREATE_GROUP",
        description: "Created a new group",
      });
    } catch (rewardErr) {
      console.error("CREATE_GROUP reward error:", rewardErr);
    }

    /* ================= POPULATE ================= */
    const populated = await Group.findById(group._id)
      .populate("members.user", "name avatar")
      .populate("createdBy", "name avatar");

    /* ================= SSE EVENT ================= */
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
    const { groupId, text = "", image, video, audio, file } = req.body;

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({
        success: false,
        error: "Group not found",
      });
    }

    const member = group.members.find(
      (m) => m.user.toString() === userId.toString(),
    );

    if (!member) {
      return res.status(403).json({
        success: false,
        error: "Not in group",
      });
    }

    /* ================= CREATE MESSAGE ================= */
    const message = await GroupMessage.create({
      group: groupId,
      fromUser: userId,
      text: text?.trim() || "",
      image,
      video,
      audio,
      file,
      readBy: [{ user: userId }],
    });

    const populated = await GroupMessage.findById(
      message._id,
    ).populate("fromUser", "name avatar");

    /* ================= UPDATE GROUP STATS ================= */
    group.stats.totalMessages =
      (group.stats.totalMessages || 0) + 1;

    if (image || video || audio || file) {
      group.stats.totalMediaMessages =
        (group.stats.totalMediaMessages || 0) + 1;
    }

    group.updatedAt = new Date();

    await group.save();

    /* ================= COIN REWARDS ================= */
    try {
      await rewardGroupAction({
        userId,
        groupId,
        action: "SEND_MESSAGE",
        description: "Sent a group message",
      });

      /* 🔥 MEDIA BONUS */
      if (image || video || audio || file) {
        await rewardGroupAction({
          userId,
          groupId,
          action: "MEDIA_MESSAGE",
          description: "Sent media in group",
        });
      }
    } catch (rewardErr) {
      console.error("MESSAGE reward error:", rewardErr);
    }

    /* ================= MILESTONE CHECK ================= */
    try {
      if (group.stats.totalMessages === 100) {
        for (const m of group.members) {
          await rewardGroupAction({
            userId: m.user,
            groupId,
            action: "GROUP_MILESTONE_100",
            description: "Group reached 100 messages",
          });
        }
      }

      if (group.stats.totalMessages === 1000) {
        for (const m of group.members) {
          await rewardGroupAction({
            userId: m.user,
            groupId,
            action: "GROUP_MILESTONE_1000",
            description: "Group reached 1000 messages",
          });
        }
      }
    } catch (err) {
      console.error("Milestone reward error:", err);
    }

    /* ================= SSE BROADCAST ================= */
    pushGroupMessage(groupId, {
      type: "new_message",
      message: populated,
    });

    return res.status(201).json({
      success: true,
      message: populated,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message,
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
    const isMember = group.members.some(
      (m) => (m.user?._id || m.user)?.toString() === userId.toString(),
    );

    if (!isMember) {
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

    /* ================= PERMISSION CHECK ================= */
    if (
      group.settings?.onlyAdminsCanAddMembers &&
      !isAdmin(group, userId)
    ) {
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

    /* ================= ALREADY MEMBER ================= */
    if (group.isMember(memberId)) {
      return res.status(400).json({
        success: false,
        error: "Already in group",
      });
    }

    /* ================= ADD MEMBER ================= */
    group.addMember(memberId);
    await group.save();

    /* ================= POPULATE ================= */
    const populated = await Group.findById(groupId).populate(
      "members.user",
      "name avatar"
    );

    /* ================= COIN REWARDS ================= */
    try {
      // reward inviter
      await rewardGroupAction({
        userId,
        groupId,
        action: "ADD_MEMBER",
        description: "Invited a member to group",
      });

      // reward invited user
      await rewardGroupAction({
        userId: memberId,
        groupId,
        action: "JOINED_GROUP",
        description: "Joined group via invite",
      });

      // optional group growth bonus
      if (group.members.length % 10 === 0) {
        await rewardGroupAction({
          userId,
          groupId,
          action: "GROUP_GROWTH_MILESTONE",
          description: "Group reached growth milestone",
        });
      }
    } catch (rewardErr) {
      console.error("ADD MEMBER reward error:", rewardErr);
    }

    /* ================= SSE EVENT ================= */
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

    /* ================= PERMISSION CHECK ================= */
    if (!canModerate(group, userId)) {
      return res.status(403).json({
        success: false,
        error: "Not allowed",
      });
    }

    /* ================= MEMBER CHECK ================= */
    if (!group.isMember(memberId)) {
      return res.status(404).json({
        success: false,
        error: "User not in group",
      });
    }

    /* ================= PREVENT SELF-REMOVAL EDGE CASE ================= */
    if (memberId === userId.toString()) {
      return res.status(400).json({
        success: false,
        error: "You cannot remove yourself. Use leave group instead.",
      });
    }

    /* ================= REMOVE MEMBER ================= */
    group.removeMember(memberId);
    await group.save();

    /* ================= COIN REWARDS ================= */
    try {
      // moderator reward
      await rewardGroupAction({
        userId,
        groupId,
        action: "REMOVE_MEMBER",
        description: "Removed a member from group",
      });

      // optional penalty or neutral adjustment for removed user
      await rewardGroupAction({
        userId: memberId,
        groupId,
        action: "REMOVED_FROM_GROUP",
        description: "Removed from group by moderator",
      });
    } catch (rewardErr) {
      console.error("REMOVE MEMBER reward error:", rewardErr);
    }

    /* ================= SSE EVENT ================= */
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

    // ✅ FIX
    const memberExists = group.members.some(
      (m) => m.user.toString() === userId.toString(),
    );

    if (!memberExists) {
      return res.status(400).json({
        success: false,
        error: "Not in group",
      });
    }

    group.removeMember(userId);

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

    /* ================= ONLY ADMINS ================= */
    if (!isAdmin(group, userId)) {
      return res.status(403).json({
        success: false,
        error: "Only admins allowed",
      });
    }

    const member = group.members.find(
      (m) => m.user.toString() === memberId.toString()
    );

    if (!member) {
      return res.status(404).json({
        success: false,
        error: "User not in group",
      });
    }

    /* ================= NO CHANGE ================= */
    if (member.role === role) {
      return res.status(400).json({
        success: false,
        error: "User already has this role",
      });
    }

    const oldRole = member.role;
    member.role = role;

    await group.save();

    /* ================= COIN REWARDS ================= */
    try {
      // admin reward for moderation action
      await rewardGroupAction({
        userId,
        groupId,
        action: "ROLE_CHANGE",
        description: `Changed role from ${oldRole} to ${role}`,
      });

      // role-based bonuses
      if (role === "moderator") {
        await rewardGroupAction({
          userId: memberId,
          groupId,
          action: "PROMOTED_MODERATOR",
          description: "Promoted to moderator",
        });
      }

      if (role === "admin") {
        await rewardGroupAction({
          userId: memberId,
          groupId,
          action: "PROMOTED_ADMIN",
          description: "Promoted to admin",
        });
      }

      if (role === "member" && oldRole !== "member") {
        await rewardGroupAction({
          userId: memberId,
          groupId,
          action: "DEMOTED",
          description: "Role downgraded",
        });
      }
    } catch (rewardErr) {
      console.error("CHANGE ROLE reward error:", rewardErr);
    }

    /* ================= SSE EVENT ================= */
    pushGroupMessage(groupId, {
      type: "group_event",
      event: "role_changed",
      memberId,
      role,
      oldRole,
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

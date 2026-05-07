const mongoose = require("mongoose");
const Group = require("../models/GroupMessage");
const GroupMessage = require("../models/GroupMessages");
const {
  pushGroupMessage,
} = require("../config/sse");

/* ================= HELPERS ================= */

const isValidId = (id) =>
  mongoose.Types.ObjectId.isValid(id);

/* ================= ROLE HELPERS ================= */

const getMember = (group, userId) =>
  group.members.find(
    (m) => m.user.toString() === userId.toString()
  );

const getRole = (group, userId) => {
  const member = getMember(group, userId);
  return member?.role || null;
};

const isAdmin = (group, userId) =>
  getRole(group, userId) === "admin";

const canModerate = (group, userId) => {
  const role = getRole(group, userId);
  return role === "admin" || role === "moderator";
};

const allowedRoles = [
  "admin",
  "moderator",
  "member",
];

/* ================= CREATE GROUP ================= */

const createGroup = async (req, res) => {
  try {
    const userId = req.user._id;

    const {
      name,
      members = [],
    } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({
        error: "Group name required",
      });
    }

    const validMembers = members.filter(isValidId);

    /* ✅ REMOVE DUPLICATES */
    const uniqueMembers = [
      ...new Set(
        validMembers.map((id) => id.toString())
      ),
    ];

    const group = await Group.create({
      name: name.trim(),

      members: [
        {
          user: userId,
          role: "admin",
        },

        ...uniqueMembers
          .filter(
            (id) =>
              id !== userId.toString()
          )
          .map((id) => ({
            user: id,
            role: "member",
          })),
      ],

      createdBy: userId,
    });

    const populated =
      await Group.findById(group._id)
        .populate(
          "members.user",
          "name avatar"
        );

    pushGroupMessage(group._id, {
      type: "group_event",
      event: "group_created",
      group: populated,
    });

    res.json({
      group: populated,
    });

  } catch (err) {
    console.error(
      "CREATE GROUP ERROR:",
      err
    );

    res.status(500).json({
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
      .populate(
        "members.user",
        "name avatar"
      )
      .sort({ updatedAt: -1 });

    res.json({ groups });

  } catch (err) {
    console.error(
      "GET GROUPS ERROR:",
      err
    );

    res.status(500).json({
      error: "Failed to fetch groups",
    });
  }
};

/* ================= GET SINGLE GROUP ================= */

const getGroup = async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!isValidId(groupId)) {
      return res.status(400).json({
        error: "Invalid group",
      });
    }

    const group = await Group.findById(
      groupId
    ).populate(
      "members.user",
      "name avatar"
    );

    if (!group) {
      return res.status(404).json({
        error: "Group not found",
      });
    }

    res.json({ group });

  } catch (err) {
    console.error(
      "GET GROUP ERROR:",
      err
    );

    res.status(500).json({
      error: "Failed to fetch group",
    });
  }
};

/* ================= SEND MESSAGE ================= */

const sendGroupMessage = async (
  req,
  res
) => {
  try {
    const userId = req.user._id;

    const {
      groupId,
      text,
    } = req.body;

    if (!text?.trim()) {
      return res.status(400).json({
        error: "Message required",
      });
    }

    const group = await Group.findById(
      groupId
    );

    if (!group) {
      return res.status(404).json({
        error: "Group not found",
      });
    }

    /* ✅ MUST BE MEMBER */
    const member = getMember(
      group,
      userId
    );

    if (!member) {
      return res.status(403).json({
        error: "Not in group",
      });
    }

    /* ✅ ONLY ADMINS CAN MESSAGE */
    if (
      group.settings
        ?.onlyAdminsCanMessage &&
      member.role !== "admin"
    ) {
      return res.status(403).json({
        error:
          "Only admins can send messages",
      });
    }

    /* ✅ CREATE MESSAGE */
    const message =
      await GroupMessage.create({
        group: groupId,

        fromUser: userId,

        text: text.trim(),
      });

    const populated =
      await GroupMessage.findById(
        message._id
      ).populate(
        "fromUser",
        "name avatar"
      );

    /* ✅ UPDATE LAST ACTIVITY */
    group.updatedAt = new Date();

    await group.save();

    /* ✅ REALTIME PUSH */
    pushGroupMessage(groupId, {
      type: "new_message",
      message: populated,
    });

    res.json({
      message: populated,
    });

  } catch (err) {
    console.error(
      "SEND GROUP MESSAGE ERROR:",
      err
    );

    res.status(500).json({
      error: "Failed to send message",
    });
  }
};

/* ================= GET MESSAGES ================= */

const getGroupMessages = async (
  req,
  res
) => {
  try {
    const userId = req.user._id;

    const { groupId } = req.params;

    const group = await Group.findById(
      groupId
    );

    if (!group) {
      return res.status(404).json({
        error: "Group not found",
      });
    }

    /* ✅ MUST BE MEMBER */
    if (!getMember(group, userId)) {
      return res.status(403).json({
        error: "Not in group",
      });
    }

    const messages =
      await GroupMessage.find({
        group: groupId,
      })
        .populate(
          "fromUser",
          "name avatar"
        )
        .sort({ createdAt: 1 });

    res.json({ messages });

  } catch (err) {
    console.error(
      "GET GROUP MESSAGES ERROR:",
      err
    );

    res.status(500).json({
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

    const group = await Group.findById(
      groupId
    );

    if (!group) {
      return res.status(404).json({
        error: "Group not found",
      });
    }

    if (
      !canModerate(group, userId)
    ) {
      return res.status(403).json({
        error: "Not allowed",
      });
    }

    const exists =
      group.members.some(
        (m) =>
          m.user.toString() ===
          memberId.toString()
      );

    if (exists) {
      return res.status(400).json({
        error: "Already in group",
      });
    }

    group.members.push({
      user: memberId,
      role: "member",
    });

    await group.save();

    pushGroupMessage(groupId, {
      type: "group_event",
      event: "member_added",
      memberId,
      addedBy: userId,
    });

    res.json({
      message: "Member added",
      group,
    });

  } catch (err) {
    console.error(
      "ADD MEMBER ERROR:",
      err
    );

    res.status(500).json({
      error: "Failed to add member",
    });
  }
};

/* ================= REMOVE MEMBER ================= */

const removeMember = async (
  req,
  res
) => {
  try {
    const userId = req.user._id;

    const {
      groupId,
      memberId,
    } = req.params;

    const group = await Group.findById(
      groupId
    );

    if (!group) {
      return res.status(404).json({
        error: "Group not found",
      });
    }

    if (
      !canModerate(group, userId)
    ) {
      return res.status(403).json({
        error: "Not allowed",
      });
    }

    group.members =
      group.members.filter(
        (m) =>
          m.user.toString() !==
          memberId.toString()
      );

    await group.save();

    pushGroupMessage(groupId, {
      type: "group_event",
      event: "member_removed",
      memberId,
    });

    res.json({
      message: "Member removed",
      group,
    });

  } catch (err) {
    console.error(
      "REMOVE MEMBER ERROR:",
      err
    );

    res.status(500).json({
      error: "Failed to remove member",
    });
  }
};

/* ================= LEAVE GROUP ================= */

const leaveGroup = async (
  req,
  res
) => {
  try {
    const userId = req.user._id;

    const { groupId } = req.params;

    const group = await Group.findById(
      groupId
    );

    if (!group) {
      return res.status(404).json({
        error: "Group not found",
      });
    }

    group.members =
      group.members.filter(
        (m) =>
          m.user.toString() !==
          userId.toString()
      );

    await group.save();

    pushGroupMessage(groupId, {
      type: "group_event",
      event: "member_left",
      userId,
    });

    res.json({
      message: "Left group",
    });

  } catch (err) {
    console.error(
      "LEAVE GROUP ERROR:",
      err
    );

    res.status(500).json({
      error: "Failed to leave group",
    });
  }
};

/* ================= CHANGE ROLE ================= */

const changeRole = async (
  req,
  res
) => {
  try {
    const userId = req.user._id;

    const {
      groupId,
      memberId,
    } = req.params;

    const { role } = req.body;

    if (
      !allowedRoles.includes(role)
    ) {
      return res.status(400).json({
        error: "Invalid role",
      });
    }

    const group = await Group.findById(
      groupId
    );

    if (!group) {
      return res.status(404).json({
        error: "Group not found",
      });
    }

    if (!isAdmin(group, userId)) {
      return res.status(403).json({
        error:
          "Only admin allowed",
      });
    }

    const member =
      group.members.find(
        (m) =>
          m.user.toString() ===
          memberId.toString()
      );

    if (!member) {
      return res.status(404).json({
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
    });

    res.json({
      message: "Role updated",
      group,
    });

  } catch (err) {
    console.error(
      "CHANGE ROLE ERROR:",
      err
    );

    res.status(500).json({
      error: "Failed to update role",
    });
  }
};

/* ================= DELETE GROUP ================= */

const deleteGroup = async (
  req,
  res
) => {
  try {
    const userId = req.user._id;

    const { groupId } = req.params;

    const group = await Group.findById(
      groupId
    );

    if (!group) {
      return res.status(404).json({
        error: "Group not found",
      });
    }

    if (
      group.createdBy.toString() !==
      userId.toString()
    ) {
      return res.status(403).json({
        error:
          "Only creator can delete",
      });
    }

    await Group.findByIdAndDelete(
      groupId
    );

    await GroupMessage.deleteMany({
      group: groupId,
    });

    pushGroupMessage(groupId, {
      type: "group_event",
      event: "group_deleted",
    });

    res.json({
      message: "Group deleted",
    });

  } catch (err) {
    console.error(
      "DELETE GROUP ERROR:",
      err
    );

    res.status(500).json({
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

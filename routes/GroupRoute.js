const express = require("express");
const router = express.Router();

const {
  createGroup,
  getMyGroups,
  getGroup,

  /* ✅ CHAT */
  sendGroupMessage,
  getGroupMessages,

  addMember,
  removeMember,
  leaveGroup,
  changeRole,
  deleteGroup,
} = require("../controller/GroupController");

const { protect } = require("../middleware/AuthMiddleware");

/* ✅ SSE HELPERS */
const {
  addGroupClient,
  removeGroupClient,
} = require("../config/sse");

/* ================= GROUP CORE ================= */

// Create group
router.post("/", protect, createGroup);

// Optional alias
router.post("/create", protect, createGroup);

// Get my groups
router.get("/", protect, getMyGroups);

// Get single group
router.get("/:groupId", protect, getGroup);

// Delete group
router.delete("/:groupId", protect, deleteGroup);

/* ================= GROUP CHAT ================= */

/* ✅ SEND MESSAGE */
router.post(
  "/send-message",
  protect,
  sendGroupMessage
);

/* ✅ GET GROUP MESSAGES */
router.get(
  "/:groupId/messages",
  protect,
  getGroupMessages
);

/* ================= MEMBERS ================= */

// Add member
router.post(
  "/:groupId/members",
  protect,
  addMember
);

// Remove member
router.delete(
  "/:groupId/members/:memberId",
  protect,
  removeMember
);

// Leave group
router.delete(
  "/:groupId/members/me",
  protect,
  leaveGroup
);

/* ================= ROLES ================= */

// Change role
router.patch(
  "/:groupId/members/:memberId/role",
  protect,
  changeRole
);

/* ================= SSE STREAM ================= */

router.get(
  "/stream/:groupId/:userId",
  protect,
  async (req, res) => {
    try {
      const {
        groupId,
        userId,
      } = req.params;

      /* ✅ REGISTER CLIENT */
      addGroupClient(
        groupId,
        userId,
        res
      );

      /* ✅ SSE HEADERS */
      res.writeHead(200, {
        "Content-Type":
          "text/event-stream",

        "Cache-Control":
          "no-cache",

        Connection: "keep-alive",
      });

      /* ✅ CONNECTED EVENT */
      res.write(
        `data: ${JSON.stringify({
          type: "connected",
          groupId,
        })}\n\n`
      );

      /* ✅ HEARTBEAT */
      const interval =
        setInterval(() => {
          res.write(
            `data: ${JSON.stringify({
              type: "ping",
            })}\n\n`
          );
        }, 25000);

      /* ✅ CLEANUP */
      req.on("close", () => {
        clearInterval(interval);

        removeGroupClient(
          groupId,
          userId,
          res
        );

        res.end();
      });

    } catch (err) {
      console.error(
        "GROUP STREAM ERROR:",
        err
      );

      res.end();
    }
  }
);

module.exports = router;

const express = require("express");

const router = express.Router();

const {
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
} = require("../controller/GroupController");

const {
  protect,
} = require("../middleware/AuthMiddleware");

const {
  addGroupClient,
  removeGroupClient,
} = require("../config/sse");

const sseProtect = require("../middleware/sseProtect");

/* ================= GROUP CORE ================= */

router.post(
  "/",
  protect,
  createGroup
);

router.post(
  "/create",
  protect,
  createGroup
);

router.get(
  "/",
  protect,
  getMyGroups
);

router.get(
  "/:groupId",
  protect,
  getGroup
);

router.delete(
  "/:groupId",
  protect,
  deleteGroup
);

/* ================= GROUP CHAT ================= */

router.post(
  "/send-message",
  protect,
  sendGroupMessage
);

router.get(
  "/:groupId/messages",
  protect,
  getGroupMessages
);

/* ================= MEMBERS ================= */

router.post(
  "/:groupId/members",
  protect,
  addMember
);

router.delete(
  "/:groupId/members/:memberId",
  protect,
  removeMember
);

router.delete(
  "/:groupId/members/me",
  protect,
  leaveGroup
);

router.patch(
  "/:groupId/members/:memberId/role",
  protect,
  changeRole
);

/* ================= SSE STREAM (FIXED) ================= */

router.get(
  "/stream/:groupId/:userId",
  sseProtect,
  async (req, res) => {
    try {
      const {
        groupId,
        userId,
      } = req.params;

      /* ================= SSE HEADERS ================= */

      res.writeHead(200, {
        "Content-Type":
          "text/event-stream",

        "Cache-Control":
          "no-cache",

        Connection:
          "keep-alive",

        "X-Accel-Buffering":
          "no",
      });

      /* ================= REGISTER CLIENT ================= */

      addGroupClient(
        groupId,
        userId,
        res
      );

      /* ================= INITIAL CONNECT ================= */

      res.write(
        `data: ${JSON.stringify({
          type: "connected",
          groupId,
          userId,
        })}\n\n`
      );

      /* ================= HEARTBEAT ================= */

      const interval =
        setInterval(() => {
          res.write(
            `data: ${JSON.stringify(
              {
                type: "ping",
                groupId,
              }
            )}\n\n`
          );
        }, 25000);

      /* ================= CLEANUP ================= */

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
        "❌ GROUP STREAM ERROR:",
        err
      );

      res.end();
    }
  }
);

module.exports = router;

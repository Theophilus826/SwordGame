const express = require("express");
const router = express.Router();

/* ================= CONTROLLER ================= */
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
  deleteGroupMessage,
  toggleGroupRewards,
  deleteGroup,
} = require("../controller/GroupController");

/* ================= MIDDLEWARE ================= */
const { protect } = require("../middleware/AuthMiddleware");
const sseProtect = require("../middleware/sseProtect");

const {
  addGroupClient,
  removeGroupClient,
} = require("../config/sse");

/* ================= GROUP CORE ================= */

router.post("/", protect, createGroup);
router.post("/create", protect, createGroup);

router.get("/", protect, getMyGroups);

/* ================= GROUP CHAT ================= */

router.post(
  "/send-message",
  protect,
  sendGroupMessage
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

router.patch(
  "/:groupId/members/:memberId/role",
  protect,
  changeRole
);

router.post(
  "/:groupId/leave",
  protect,
  leaveGroup
);

/* ================= REWARDS ================= */

router.patch(
  "/:groupId/reward-toggle",
  protect,
  toggleGroupRewards
);

/* ================= MESSAGES ================= */

router.get(
  "/:groupId/messages",
  protect,
  getGroupMessages
);

router.delete(
  "/:groupId/messages/:messageId",
  protect,
  deleteGroupMessage
);

/* ================= DELETE GROUP ================= */

router.delete(
  "/:groupId",
  protect,
  deleteGroup
);

/* ================= SSE STREAM ================= */

router.get(
  "/stream/:groupId",
  sseProtect,
  (req, res) => {
    const { groupId } = req.params;

    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).end();
    }

    req.setTimeout(0);
    res.setTimeout(0);

    res.writeHead(200, {
      "Content-Type":
        "text/event-stream",
      "Cache-Control":
        "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    res.flushHeaders?.();

    addGroupClient(groupId, userId, res);

    res.write(
      `data: ${JSON.stringify({
        type: "connected",
        scope: "group",
        groupId,
        userId,
      })}\n\n`
    );

    const interval = setInterval(() => {
      res.write(
        `data: ${JSON.stringify({
          type: "ping",
          scope: "group",
          groupId,
        })}\n\n`
      );
    }, 25000);

    const cleanup = () => {
      clearInterval(interval);

      try {
        removeGroupClient(groupId, userId, res);
      } catch (e) {
        console.error(
          "cleanup error:",
          e.message
        );
      }

      res.end();
    };

    req.on("close", cleanup);
  }
);

/* ================= GET SINGLE GROUP ================= */
/* KEEP THIS LAST */

router.get(
  "/:groupId",
  protect,
  getGroup
);

/* ================= SAFE SSE WRITE ================= */

function safeSseWrite(res, data) {
  try {
    if (!res || res.writableEnded)
      return;

    res.write(
      `data: ${JSON.stringify(
        data
      )}\n\n`
    );
  } catch (err) {
    console.error(
      "SSE WRITE ERROR:",
      err.message
    );
  }
}

module.exports = router;

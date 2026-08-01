const {
  createCall,
  getCall,
  updateCall,
  removeCall,
  setCallTimeout,
  clearCallTimeout,
  userInCall,
  getActiveCalls,
} = require("../config/CallManager");
const { sendIncomingCall } = require("../config/CallNotificationService");
const { pushCallEvent } = require("../config/sse");

const User = require("../models/UserModels");
/* =========================================================
   START CALL
========================================================= */

const startCall = async (req, res) => {
  try {
    const callerId = String(req.user._id);
    const { receiverId, type = "voice" } = req.body;

    /* ================= VALIDATION ================= */

    if (!receiverId) {
      return res.status(400).json({
        success: false,
        error: "Receiver ID is required",
      });
    }

    if (callerId === String(receiverId)) {
      return res.status(400).json({
        success: false,
        error: "You cannot call yourself.",
      });
    }

    const receiver = await User.findById(receiverId);

    if (!receiver) {
      return res.status(404).json({
        success: false,
        error: "Receiver not found.",
      });
    }

    /* ================= CLEANUP STALE CALLS ================= */

    for (const active of getActiveCalls()) {
      if (
        ["ended", "cancelled", "rejected", "timeout"].includes(active.status)
      ) {
        console.log("Removing stale call:", active.id);
        removeCall(active.id);
      }
    }

    /* ================= DEBUG ================= */

    console.log("========== START CALL ==========");
    console.log("Caller:", callerId);
    console.log("Receiver:", String(receiverId));
    console.log(
      "Active Calls:",
      getActiveCalls().map((c) => ({
        id: c.id,
        callerId: c.callerId,
        receiverId: c.receiverId,
        status: c.status,
      }))
    );

    /* ================= BUSY CHECK ================= */

    if (userInCall(callerId)) {
      return res.status(409).json({
        success: false,
        status: "busy",
        message: "You are already in another call.",
        activeCalls: getActiveCalls(),
      });
    }

    if (userInCall(receiverId)) {
      return res.status(409).json({
        success: false,
        status: "busy",
        message: "User is already in another call.",
        activeCalls: getActiveCalls(),
      });
    }

    /* ================= CREATE CALL ================= */

    const call = createCall(callerId, receiverId, type);

    console.log("Call created:", call.id);

    /* ================= SEND RINGING ================= */

    pushCallEvent(callerId, receiverId, {
      type: "incoming_call",
      call,
    });

    /* ================= RING TIMEOUT ================= */

    const timeout = setTimeout(() => {
      const active = getCall(call.id);

      if (!active || active.status !== "ringing") return;

      console.log("Call timed out:", active.id);

      updateCall(active.id, {
        status: "timeout",
        endedAt: Date.now(),
      });

      pushCallEvent(active.callerId, active.receiverId, {
        type: "call_timeout",
        callId: active.id,
      });

      pushCallEvent(active.receiverId, active.callerId, {
        type: "call_timeout",
        callId: active.id,
      });

      removeCall(active.id);
    }, 30000);

    setCallTimeout(call.id, timeout);

    /* ================= RESPONSE ================= */

    return res.status(200).json({
      success: true,
      message: "Calling...",
      call,
    });
  } catch (err) {
    console.error("START CALL ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to start call",
      details: err.message,
    });
  }
};

/* =========================================================
   ACCEPT CALL
========================================================= */

const acceptCall = (req, res) => {
  try {
    const { callId } = req.body;

    if (!callId) {
      return res.status(400).json({
        error: "Call ID is required",
      });
    }

    const call = getCall(callId);

    if (!call) {
      return res.status(404).json({
        error: "Call not found",
      });
    }

    // Prevent accepting an inactive call
    if (call.status !== "ringing") {
      return res.status(409).json({
        error: `Call is already ${call.status}.`,
      });
    }

    // Stop the timeout timer
    clearCallTimeout(callId);

    // Update call status
    const updatedCall = updateCall(callId, {
      status: "accepted",
      acceptedAt: Date.now(),
    });

    // Notify caller
    pushCallEvent(call.receiverId, call.callerId, {
      type: "call_accepted",
      callId,
      call: updatedCall,
    });

    // Notify receiver
    pushCallEvent(call.callerId, call.receiverId, {
      type: "call_accepted",
      callId,
      call: updatedCall,
    });

    return res.json({
      success: true,
      message: "Call accepted.",
      call: updatedCall,
    });
  } catch (err) {
    console.error("ACCEPT CALL ERROR:", err);

    return res.status(500).json({
      error: "Failed to accept call",
    });
  }
};

/* =========================================================
   REJECT CALL
========================================================= */

const rejectCall = async (req, res) => {
  try {
    const { callId } = req.body;

    if (!callId) {
      return res.status(400).json({
        error: "Call ID is required",
      });
    }

    const call = getCall(callId);

    if (!call) {
      return res.status(404).json({
        error: "Call not found",
      });
    }

    // Stop the timeout timer
    clearCallTimeout(callId);

    // Update status
    updateCall(callId, {
      status: "rejected",
      endedAt: Date.now(),
    });

    // Notify the caller
    pushCallEvent(call.receiverId, call.callerId, {
      type: "call_rejected",
      callId,
    });

    // Optional: notify the receiver too so their UI closes
    pushCallEvent(call.callerId, call.receiverId, {
      type: "call_rejected",
      callId,
    });

    // Remove from active calls
    removeCall(callId);

    return res.json({
      success: true,
      message: "Call rejected.",
    });
  } catch (err) {
    console.error("REJECT CALL ERROR:", err);

    return res.status(500).json({
      error: "Failed to reject call",
    });
  }
};

/* =========================================================
   END CALL
========================================================= */

const endCall = (req, res) => {
  try {
    const { callId } = req.body;

    if (!callId) {
      return res.status(400).json({
        success: false,
        error: "Call ID is required",
      });
    }

    const call = getCall(callId);

    if (!call) {
      // Treat as already cleaned up
      return res.status(200).json({
        success: true,
        message: "Call already ended.",
      });
    }

    console.log("========== END CALL ==========");
    console.log("Call ID:", callId);
    console.log("Status:", call.status);

    // Always stop timeout
    clearCallTimeout(callId);

    const endedAt = Date.now();

    const duration = call.acceptedAt
      ? Math.floor((endedAt - call.acceptedAt) / 1000)
      : 0;

    // Only update if not already ended
    let updatedCall = call;

    if (call.status !== "ended") {
      updatedCall = updateCall(callId, {
        status: "ended",
        endedAt,
        duration,
      });

      // Notify caller
      pushCallEvent(call.callerId, call.receiverId, {
        type: "call_ended",
        callId,
        duration,
        call: updatedCall,
      });

      // Notify receiver
      pushCallEvent(call.receiverId, call.callerId, {
        type: "call_ended",
        callId,
        duration,
        call: updatedCall,
      });
    }

    // Always remove the call
    removeCall(callId);

    console.log("Call removed:", callId);
    console.log("Remaining active calls:", getActiveCalls());

    return res.status(200).json({
      success: true,
      message: "Call ended successfully.",
      duration,
      call: updatedCall,
    });
  } catch (err) {
    console.error("END CALL ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to end call",
      details: err.message,
    });
  }
};
/* =========================================================
   CANCEL CALL (Caller cancels before answer)
========================================================= */

const cancelCall = (req, res) => {
  try {
    const { callId } = req.body;

    if (!callId) {
      return res.status(400).json({
        success: false,
        error: "Call ID is required",
      });
    }

    const call = getCall(callId);

    // Already cleaned up
    if (!call) {
      return res.status(200).json({
        success: true,
        message: "Call already cancelled.",
      });
    }

    console.log("========== CANCEL CALL ==========");
    console.log("Call ID:", callId);
    console.log("Status:", call.status);

    // Always clear timeout
    clearCallTimeout(callId);

    let updatedCall = call;

    // Only notify if the call was still ringing
    if (call.status === "ringing") {
      updatedCall = updateCall(callId, {
        status: "cancelled",
        endedAt: Date.now(),
      });

      // Notify receiver
      pushCallEvent(call.callerId, call.receiverId, {
        type: "call_cancelled",
        callId,
        call: updatedCall,
      });

      // Notify caller
      pushCallEvent(call.receiverId, call.callerId, {
        type: "call_cancelled",
        callId,
        call: updatedCall,
      });
    } else {
      console.log(
        `Cancel requested for ${call.status} call. Cleaning up anyway.`
      );
    }

    // Always remove the call
    removeCall(callId);

    console.log("Call removed:", callId);
    console.log(
      "Remaining active calls:",
      getActiveCalls().map((c) => ({
        id: c.id,
        callerId: c.callerId,
        receiverId: c.receiverId,
        status: c.status,
      }))
    );

    return res.status(200).json({
      success: true,
      message: "Call cancelled successfully.",
      call: updatedCall,
    });
  } catch (err) {
    console.error("CANCEL CALL ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to cancel call",
      details: err.message,
    });
  }
};
/* =========================================================
   WEBRTC OFFER
========================================================= */

const offer = (req, res) => {
  try {
    const { callId, offer } = req.body;

    if (!callId) {
      return res.status(400).json({
        error: "Call ID is required",
      });
    }

    if (!offer) {
      return res.status(400).json({
        error: "SDP offer is required",
      });
    }

    const call = getCall(callId);

    if (!call) {
      return res.status(404).json({
        error: "Call not found",
      });
    }

    // Offer can only be exchanged after the call is accepted
    if (call.status !== "accepted" && call.status !== "connecting") {
      return res.status(409).json({
        error: `Cannot send offer while call is ${call.status}.`,
      });
    }

    const updatedCall = updateCall(callId, {
      status: "connecting",
      offer,
    });

    // Send SDP offer to receiver
    pushCallEvent(call.callerId, call.receiverId, {
      type: "offer",
      callId,
      offer,
    });

    return res.json({
      success: true,
      message: "Offer sent successfully.",
      call: updatedCall,
    });
  } catch (err) {
    console.error("OFFER ERROR:", err);

    return res.status(500).json({
      error: "Failed to send offer",
    });
  }
};

/* =========================================================
   WEBRTC ANSWER
========================================================= */

const answer = (req, res) => {
  try {
    const { callId, answer } = req.body;

    if (!callId) {
      return res.status(400).json({
        error: "Call ID is required",
      });
    }

    if (!answer) {
      return res.status(400).json({
        error: "SDP answer is required",
      });
    }

    const call = getCall(callId);

    if (!call) {
      return res.status(404).json({
        error: "Call not found",
      });
    }

    // Answer is only valid after an offer has been sent
    if (call.status !== "connecting" && call.status !== "accepted") {
      return res.status(409).json({
        error: `Cannot send answer while call is ${call.status}.`,
      });
    }

    const updatedCall = updateCall(callId, {
      status: "connected",
      answer,
      connectedAt: Date.now(),
    });

    // Send SDP answer back to caller
    pushCallEvent(call.receiverId, call.callerId, {
      type: "answer",
      callId,
      answer,
    });

    return res.json({
      success: true,
      message: "Answer sent successfully.",
      call: updatedCall,
    });
  } catch (err) {
    console.error("ANSWER ERROR:", err);

    return res.status(500).json({
      error: "Failed to send answer",
    });
  }
};

const getRecentCalls = async (req, res) => {
  const userId = req.user._id;

  const calls = await Call.find({
    $or: [
      {
        caller: userId,
      },

      {
        receiver: userId,
      },
    ],
  })
    .populate("caller", "name avatar")
    .populate("receiver", "name avatar")
    .sort({
      createdAt: -1,
    });

  res.json(calls);
};

/* =========================================================
   ICE CANDIDATE
========================================================= */

const ice = (req, res) => {
  try {
    const { callId, candidate } = req.body;

    console.log("========== ICE ==========");
    console.log("Request Body:", req.body);

    /* ================= VALIDATION ================= */

    if (!callId) {
      return res.status(400).json({
        success: false,
        error: "Call ID is required",
      });
    }

    // WebRTC fires one final event with candidate === null.
    // This is not an error.
    if (candidate == null) {
      return res.status(200).json({
        success: true,
        message: "ICE gathering complete.",
      });
    }

    const call = getCall(callId);

    if (!call) {
      return res.status(404).json({
        success: false,
        error: "Call not found",
      });
    }

    /* ================= STATE CHECK ================= */

    if (!["connecting", "connected"].includes(call.status)) {
      return res.status(409).json({
        success: false,
        error: `Cannot exchange ICE while call is ${call.status}.`,
      });
    }

    /* ================= STORE ICE ================= */

    if (!Array.isArray(call.iceCandidates)) {
      call.iceCandidates = [];
    }

    call.iceCandidates.push(candidate);

    // Prevent unlimited memory growth
    if (call.iceCandidates.length > 100) {
      call.iceCandidates.shift();
    }

    console.log(
      `ICE candidate received (${call.iceCandidates.length} stored)`
    );

    /* ================= RELAY ICE ================= */

    pushCallEvent(call.callerId, call.receiverId, {
      type: "ice",
      callId,
      candidate,
    });

    pushCallEvent(call.receiverId, call.callerId, {
      type: "ice",
      callId,
      candidate,
    });

    return res.status(200).json({
      success: true,
      message: "ICE candidate sent.",
    });
  } catch (err) {
    console.error("ICE ERROR:", err);

    return res.status(500).json({
      success: false,
      error: "Failed to exchange ICE candidate",
      details: err.message,
    });
  }
};

const getCallStatus = (req, res) => {
  try {
    const { callId } = req.params;

    if (!callId) {
      return res.status(400).json({
        error: "Call ID is required",
      });
    }

    const call = getCall(callId);

    if (!call) {
      return res.status(404).json({
        error: "Call not found",
      });
    }

    return res.json({
      success: true,
      call,
    });
  } catch (err) {
    console.error("GET CALL STATUS ERROR:", err);

    return res.status(500).json({
      error: "Failed to get call status",
    });
  }
};

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  startCall,
  acceptCall,
  rejectCall,
  endCall,
  cancelCall,
  offer,
  answer,
  ice,
  getRecentCalls,
  getCallStatus,
};

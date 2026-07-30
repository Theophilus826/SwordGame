const crypto = require("crypto");

const activeCalls = new Map();

/* =========================================================
   CREATE CALL
========================================================= */

function createCall(callerId, receiverId, type = "voice") {
  const callId = crypto.randomUUID();

  const call = {
    id: callId,
    callerId: String(callerId),
    receiverId: String(receiverId),

    type,

    status: "ringing",

    createdAt: Date.now(),
    acceptedAt: null,
    endedAt: null,

    timeout: null,
  };

  activeCalls.set(callId, call);

  return call;
}

/* =========================================================
   GET CALL
========================================================= */

function getCall(callId) {
  return activeCalls.get(callId) || null;
}

/* =========================================================
   UPDATE CALL
========================================================= */

function updateCall(callId, data) {
  const call = activeCalls.get(callId);

  if (!call) return null;

  Object.assign(call, data);

  return call;
}

/* =========================================================
   REMOVE CALL
========================================================= */

function removeCall(callId) {
  const call = activeCalls.get(callId);

  if (!call) return;

  if (call.timeout) {
    clearTimeout(call.timeout);
  }

  activeCalls.delete(callId);
}

/* =========================================================
   SET TIMEOUT
========================================================= */

function setCallTimeout(callId, timeout) {
  const call = activeCalls.get(callId);

  if (!call) return;

  call.timeout = timeout;
}

/* =========================================================
   CLEAR TIMEOUT
========================================================= */

function clearCallTimeout(callId) {
  const call = activeCalls.get(callId);

  if (!call) return;

  if (call.timeout) {
    clearTimeout(call.timeout);
    call.timeout = null;
  }
}

/* =========================================================
   USER IN CALL
========================================================= */

function userInCall(userId) {
  const id = String(userId);

  for (const call of activeCalls.values()) {
    if (
      (call.status === "ringing" ||
        call.status === "connecting" ||
        call.status === "accepted" ||
        call.status === "connected") &&
      (call.callerId === id || call.receiverId === id)
    ) {
      return true;
    }
  }

  return false;
}

/* =========================================================
   ACTIVE CALLS
========================================================= */

function getActiveCalls() {
  return [...activeCalls.values()];
}

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  createCall,
  getCall,
  updateCall,
  removeCall,

  setCallTimeout,
  clearCallTimeout,

  userInCall,
  getActiveCalls,
};

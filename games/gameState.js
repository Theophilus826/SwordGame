const players = new Map();          // socketId -> player
const playersByUser = new Map();    // userId -> player

const PLAYER_TIMEOUT = 1000 * 60 * 5;   // 5 min idle cleanup

/* =========================================================
   CLEANUP LOOP (Prevents memory leaks)
========================================================= */

setInterval(() => {
    const now = Date.now();

    playersByUser.forEach((player, userId) => {
        if (now - player.lastSeen > PLAYER_TIMEOUT) {

            console.log("🧹 Cleaning idle player:", player.username);

            playersByUser.delete(userId);

            if (player.socketId) {
                players.delete(player.socketId);
            }
        }
    });

}, 1000 * 30); // Every 30 sec


/* =========================================================
   CREATE / RESTORE PLAYER
========================================================= */

function getOrCreatePlayer(socket) {

    if (!socket.user) {
        throw new Error("Socket missing authenticated user");
    }

    const userId = socket.user._id.toString();

    let player = playersByUser.get(userId);

    /* =========================
       FIRST CONNECTION EVER
    ========================= */

    if (!player) {
        player = {
            userId,
            username: socket.user.name,

            position: { x: 0, y: 1, z: 0 },
            rotation: 0,

            health: 100,
            room: "lobby",

            socketId: socket.id,
            lastSeen: Date.now(),

            // ✅ Important multiplayer flags
            isAlive: true,
            isMoving: false,
            lastDamageAt: 0,
        };

        playersByUser.set(userId, player);
    }

    /* =========================
       RECONNECT / TAB SWITCH
    ========================= */

    player.socketId = socket.id;
    player.lastSeen = Date.now();

    return player;
}


/* =========================================================
   SAFE PLAYER UPDATE HELPERS
========================================================= */

function touchPlayer(socketId) {
    const player = players.get(socketId);
    if (!player) return;

    player.lastSeen = Date.now();
}

function damagePlayer(player, amount) {
    if (!player || player.health <= 0) return;

    player.health = Math.max(0, player.health - amount);
    player.lastDamageAt = Date.now();

    if (player.health <= 0) {
        player.isAlive = false;
    }
}

function resetPlayer(player) {
    if (!player) return;

    player.health = 100;
    player.isAlive = true;
    player.position = { x: 0, y: 1, z: 0 };
}


/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
    players,
    playersByUser,
    getOrCreatePlayer,
    touchPlayer,
    damagePlayer,
    resetPlayer
};

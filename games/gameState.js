const players = new Map();          // socketId -> player
const playersByUser = new Map();    // userId -> player

function getOrCreatePlayer(socket) {
    const userId = socket.user._id.toString();

    let player = playersByUser.get(userId);

    // First time this user ever connects
    if (!player) {
        player = {
            userId,
            username: socket.user.name,
            position: { x: 0, y: 1, z: 0 },
            rotation: 0,
            health: 100,
            room: "lobby",
            lastSeen: Date.now()
        };

        playersByUser.set(userId, player);
    }

    // Always update socket binding
    player.socketId = socket.id;
    player.lastSeen = Date.now();

    return player;
}

module.exports = {
    players,          // active sockets
    playersByUser,    // persistent players
    getOrCreatePlayer
};

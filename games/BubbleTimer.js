const BubbleGame = require("../models/BubbleGame");
const { processGameCoins } = require("../config/gameCoinService");

async function startTimer(io, socket, session, sessions) {

    session.timer = setInterval(async () => {

        session.timeRemaining--;

        socket.emit("timer", session.timeRemaining);

        if (session.timeRemaining > 0) return;

        clearInterval(session.timer);

        try {

            const game = await BubbleGame.findById(session.gameId);

            if (!game || game.status === "Finished") {
                sessions.delete(socket.id);
                return;
            }

            await processGameCoins({
                gameId: game._id,
                action: "PLAYER_LOST",
                amount: game.coin,
            });

            game.status = "Finished";
            game.endedAt = new Date();

            await game.save();

            sessions.delete(socket.id);

            io.to(session.gameId).emit("timeUp");

            io.to(session.gameId).emit("gameFinished", {
                winner: null,
                status: "Finished",
                reason: "TIME_UP",
            });

            io.emit("bubble:updated", game);

        } catch (err) {
            console.error(err);
        }

    }, 1000);

}

module.exports = startTimer;

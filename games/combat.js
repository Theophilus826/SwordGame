const HIT_RANGE = 2.5;
const DAMAGE = 20;

function handlePvPAttack(attacker, players) {
    const hits = [];

    for (const [_, target] of players) {
        if (target.userId === attacker.userId) continue;
        if (target.room !== attacker.room) continue;
        if (target.health <= 0) continue;

        const dx = attacker.position.x - target.position.x;
        const dz = attacker.position.z - target.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist <= HIT_RANGE) {
            target.health -= DAMAGE;
            hits.push({
                targetId: target.userId,
                health: target.health
            });
        }
    }

    return hits;
}

module.exports = { handlePvPAttack };

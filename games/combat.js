const HIT_RANGE = 2.5;
const DAMAGE = 20;
const ATTACK_COOLDOWN = 500; // ms

/*
=========================================================
UTILITY
=========================================================
*/

function distance2D(a, b) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
}

/*
Check if target is within forward attack cone
Prevents 360° spin attacks
*/
function isInAttackCone(attacker, target) {

    const dx = target.position.x - attacker.position.x;
    const dz = target.position.z - attacker.position.z;

    const angleToTarget = Math.atan2(dx, dz);

    const diff = Math.abs(normalizeAngle(angleToTarget - attacker.rotation));

    const ATTACK_ARC = Math.PI / 3; // 60° cone

    return diff <= ATTACK_ARC;
}

function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}

/*
=========================================================
MAIN PvP ATTACK
=========================================================
*/

function handlePvPAttack(attacker, playersByUser) {

    const now = Date.now();

    // ✅ Anti spam / macro / exploit
    if (now - attacker.lastAttackAt < ATTACK_COOLDOWN) {
        return [];
    }

    attacker.lastAttackAt = now;

    const hits = [];

    for (const [_, target] of playersByUser) {

        if (target.userId === attacker.userId) continue;
        if (target.room !== attacker.room) continue;
        if (target.health <= 0) continue;

        // ✅ Distance check
        const dist = distance2D(attacker.position, target.position);

        if (dist > HIT_RANGE) continue;

        // ✅ Directional check (huge realism + cheat prevention)
        if (!isInAttackCone(attacker, target)) continue;

        // ✅ Damage normalization
        target.health = Math.max(0, target.health - DAMAGE);

        hits.push({
            userId: target.userId,
            damage: DAMAGE,
            health: target.health
        });

        // ✅ Death flag
        if (target.health <= 0) {
            target.isAlive = false;
        }
    }

    return hits;
}

module.exports = { handlePvPAttack };

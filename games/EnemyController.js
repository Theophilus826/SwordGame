export class EnemyController {
  constructor({ enemy, player, attackRange = 2.5, aiDamage = 5, moveRange = 15, attackCooldown = 1.5 }) {
    this.enemy = enemy;       // Enemy mesh/object from CreateEnemy
    this.player = player;     // Player mesh/object
    this.attackRange = attackRange;
    this.aiDamage = aiDamage;
    this.moveRange = moveRange;
    this.attackCooldown = attackCooldown;
    this.lastAttackTime = 0;
  }

  update(now) {
    if (!this.enemy || !this.player || this.enemy.currentHealth <= 0 || this.player.currentHealth <= 0) return;

    const dx = this.player.characterBox.position.x - this.enemy.enemyBox.position.x;
    const dz = this.player.characterBox.position.z - this.enemy.enemyBox.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist <= this.attackRange) this.attack(now);
    else if (dist <= this.moveRange) this.moveToPlayer(dx, dz, dist);
    else this.stop();
  }

  attack(now) {
    if (!this.lastAttackTime || now - this.lastAttackTime > this.attackCooldown) {
      const dmg = this.aiDamage;
      const received = this.player.controller.receiveDamage(dmg, false);
      this.player.takeDamage?.(received);
      this.lastAttackTime = now;
    }
  }

  moveToPlayer(dx, dz, dist) {
    const factor = 0.05 / dist;
    this.enemy.enemyBox.position.x += dx * factor;
    this.enemy.enemyBox.position.z += dz * factor;
  }

  stop() {
    // idle animation or stop movement
  }

  takeDamage(amount) {
    this.enemy.currentHealth -= amount;
    if (this.enemy.currentHealth < 0) this.enemy.currentHealth = 0;
  }

  getState() {
    return {
      id: this.enemy.id,
      position: { ...this.enemy.enemyBox.position },
      health: this.enemy.currentHealth,
    };
  }
}

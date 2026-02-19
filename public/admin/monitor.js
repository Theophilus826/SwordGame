const socket = io("/admin", { withCredentials: true });

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

const state = {
  player: null,    // tracked player
  enemies: [],     // array of enemy objects
};

// Smoothed positions for animation
const smoothState = {
  player: null,
  enemies: [],
};

// ------------------ UTILS ------------------

// Map 3D world coords to 2D canvas
function mapToCanvas(pos) {
  return {
    x: pos.x * 10 + canvas.width / 2,
    y: pos.z * 10 + canvas.height / 2, // z axis is vertical on canvas
  };
}

// Linear interpolation
function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ------------------ DRAWING ------------------
function drawBoard() {
  ctx.fillStyle = "#0a7f4f"; // background
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function animatePositions() {
  // Player smooth movement
  if (state.player) {
    if (!smoothState.player) smoothState.player = { ...state.player.position };
    smoothState.player.x = lerp(smoothState.player.x, state.player.position.x, 0.1);
    smoothState.player.z = lerp(smoothState.player.z, state.player.position.z, 0.1);
  }

  // Enemies smooth movement
  state.enemies.forEach((enemy, idx) => {
    if (!smoothState.enemies[idx]) smoothState.enemies[idx] = { ...enemy.position };
    smoothState.enemies[idx].x = lerp(smoothState.enemies[idx].x, enemy.position.x, 0.1);
    smoothState.enemies[idx].z = lerp(smoothState.enemies[idx].z, enemy.position.z, 0.1);
  });
}

function render() {
  drawBoard();

  // Draw player
  if (smoothState.player) {
    const { x, y } = mapToCanvas(smoothState.player);
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fillStyle = "blue";
    ctx.fill();
  }

  // Draw enemies
  smoothState.enemies.forEach((e, idx) => {
    const enemyData = state.enemies[idx];
    if (!enemyData) return;

    const { x, y } = mapToCanvas(e);
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = enemyData.health > 0 ? "red" : "gray";
    ctx.fill();

    // Optional: show enemy ID or health
    ctx.fillStyle = "white";
    ctx.font = "10px Arial";
    ctx.fillText(`${enemyData.id.slice(0, 4)}:${enemyData.health}`, x - 10, y - 10);
  });

  // Animate next frame
  requestAnimationFrame(() => {
    animatePositions();
    render();
  });
}

// ------------------ SOCKET UPDATES ------------------
socket.on("tacticalUpdate", newState => {
  // Backend sends player + multiple enemies
  state.player = newState.player || null;
  state.enemies = newState.enemies || [];
});

// ------------------ START ------------------
render();

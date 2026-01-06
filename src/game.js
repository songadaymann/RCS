// Debug toggles live at top per project rules
const debug_options = {
  showTileBounds: false,
  logTileMoves: false,
  logPlayerPosition: false,
  lightDebugMode: false, // Disable split-screen light debugging
  rcsDebugMode: true, // Enable RCS positioning debug controls
};

// Level selection: "canyon", "city", or "boss"
// Check if we should load a specific level (from level transition)
const nextLevel = sessionStorage.getItem('nextLevel');
console.log("=== GAME LOADING ===");
console.log("nextLevel from sessionStorage:", nextLevel);
if (nextLevel) {
  sessionStorage.removeItem('nextLevel'); // Clear it
}
const currentLevel = nextLevel || "canyon"; // Default to canyon (first level)

// ========== BACKGROUND MUSIC SYSTEM ==========
let bgMusic = null;
let musicFadingOut = false;

function initBackgroundMusic() {
  const musicFiles = {
    canyon: "./assets/sound/level1.mp3",
    city: "./assets/sound/level2.mp3",
    boss: "./assets/sound/level3.mp3"
  };
  
  const musicFile = musicFiles[currentLevel];
  if (!musicFile) return;
  
  bgMusic = new Audio(musicFile);
  bgMusic.loop = true;
  bgMusic.volume = 0.7; // 70% volume
  
  // Start playing on first user interaction (required by browsers)
  const startMusic = () => {
    if (bgMusic && bgMusic.paused) {
      bgMusic.play().catch(e => console.log("Music autoplay blocked:", e));
    }
    document.removeEventListener('click', startMusic);
    document.removeEventListener('keydown', startMusic);
  };
  
  document.addEventListener('click', startMusic);
  document.addEventListener('keydown', startMusic);
  
  console.log(`🎵 Background music loaded: ${currentLevel}`);
}

function fadeOutMusic(duration = 2000) {
  if (!bgMusic || musicFadingOut) return;
  musicFadingOut = true;
  
  const startVolume = bgMusic.volume;
  const fadeSteps = 20;
  const stepTime = duration / fadeSteps;
  const volumeStep = startVolume / fadeSteps;
  
  let step = 0;
  const fadeInterval = setInterval(() => {
    step++;
    bgMusic.volume = Math.max(0, startVolume - (volumeStep * step));
    
    if (step >= fadeSteps) {
      clearInterval(fadeInterval);
      bgMusic.pause();
      bgMusic.volume = 0;
      console.log("🎵 Music faded out");
    }
  }, stepTime);
}

// Expose on window for city.js access
window.fadeOutMusic = fadeOutMusic;
// =============================================

// Per-level RCS settings (scale, distance, height)
const levelRCSSettings = {
  canyon: {
    scale: 0.018446744073709574,
    distance: 160,
    heightOffset: -6,
    rotation: { pitch: 3.14, yaw: 1.54, roll: 3.14 },
    useBakedModel: true,  // Use RCS-walking.glb for better performance
  },
  city: {
    scale: 0.015,         // Bigger RCS (was 0.005)
    distance: 20,         // Starts close for testing
    heightOffset: 0,      // Pivot is at feet, so 0 = standing on ground
    walkSpeed: 5,         // Slightly faster walk
    rotation: { pitch: 3.14, yaw: 3.14, roll: 3.14 },
    useBakedModel: true,  // Use RCS-walking.glb instead of rcs.glb + retargeting
  },
  boss: {
    scale: 0.025,         // Larger RCS for boss fight
    distance: 30,         // Closer since it's an arena
    heightOffset: 15,     // Raised up a bit
    walkSpeed: 1.5,       // Much slower, menacing pace
    runSpeed: 4,          // Faster when running toward player
    rotation: { pitch: 3.14, yaw: 3.14, roll: 3.14 },
    useBakedModel: true,
    modelFile: "RCS-walking-seperated.glb", // Has separate GLASSES mesh for hitbox
  },
};

// Per-level RCS spotlight settings
const levelRCSLightSettings = {
  canyon: {
    intensity: 430,    // Bright spotlight on RCS
    range: 200,        // Longer range to reach RCS
    color: { r: 0.6, g: 0.7, b: 0.9 }, // Slightly brighter blue
    angle: 4,
    exponent: 1.5,
    offsetX: 70,       // Position light between camera and RCS
    offsetZ: 0,
    offsetY: 30,       // Lower since RCS is now at height -6
  },
  city: {
    intensity: 0,      // No spotlight on RCS in city
    range: 150,
    color: { r: 0.5, g: 0.6, b: 0.8 },
    angle: 3,
    exponent: 1.5,
    offsetX: 150,
    offsetZ: 0,
    offsetY: 80,
  },
  boss: {
    intensity: 100,    // Dramatic spotlight on boss
    range: 100,
    color: { r: 1.0, g: 0.3, b: 0.2 }, // Red/orange menacing glow
    angle: 4,
    exponent: 1.2,
    offsetX: 0,
    offsetZ: 0,
    offsetY: 50,
  },
};

// Per-level player light settings
const levelLightSettings = {
  canyon: {
    intensity: 10,
    range: 1,
    color: { r: 1.0, g: 0.95, b: 0.9 }, // Bright daylight-ish
  },
  city: {
    intensity: 50,
    range: 30,
    color: { r: 0.7, g: 0.7, b: 0.9 }, // Cool urban lighting
  },
  boss: {
    intensity: 8,
    range: 15,
    color: { r: 0.6, g: 0.3, b: 0.3 }, // Dim, spooky red-tinted lighting
  },
};

window.debug_options = debug_options;

const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true, {
  preserveDrawingBuffer: false,
  stencil: false,
  disableWebGL2Support: false,
  doNotHandleContextLost: false,
  powerPreference: "high-performance", // Request discrete GPU if available
});

// Aim for perf on mobile by lowering render scale a bit
// More aggressive on city level which has more geometry
const hwScale = currentLevel === "city" 
  ? Math.min(window.devicePixelRatio || 1, 1.0)  // City: cap at 1x
  : Math.min(window.devicePixelRatio || 1, 1.5);
engine.setHardwareScalingLevel(hwScale);

const toDispose = [];
const inputState = {
  forward: false,
  back: false,
  left: false,
  right: false,
  shoot: false,
  jump: false,
};

// Jump physics - varies per level
let playerVelocityY = 0;
const jumpForce = (currentLevel === "city" || currentLevel === "boss") ? 50 : 6; // Super jump in city/boss
const gravity = 30;
let jumpsRemaining = 0; // For multi-jump
const maxJumps = (currentLevel === "city" || currentLevel === "boss") ? 3 : 1; // City/boss=quad jump, canyon=single
let jumpKeyWasReleased = true; // Prevent holding jump to multi-jump instantly

// Health system
let playerHealth = 100;
const maxHealth = 100;
const healthRegenRate = 5; // HP per second
const enemyDamage = 15; // Damage per enemy hit
let hitFlashTimer = 0;
const hitFlashDuration = 0.15; // seconds

// Kill counter
let killCount = 0;

// End-game stats tracking (persisted across level transitions via sessionStorage)
let totalShotsFired = parseInt(sessionStorage.getItem('totalShotsFired') || '0');
let totalGriftersKilled = parseInt(sessionStorage.getItem('totalGriftersKilled') || '0');
let levelStartTime = performance.now();
let canyonClearTime = parseFloat(sessionStorage.getItem('canyonClearTime') || '0');  // Time to survive canyon waves
let collectiblesCompleteTime = parseFloat(sessionStorage.getItem('collectiblesCompleteTime') || '0');  // Time to collect all 8
let bossDefeatTime = 0;  // Time to defeat boss (no need to persist - final level)

// Wave system (canyon level)
const WAVE_DURATION = 120; // 2 minutes total
const WAVE_TIMINGS = [
  { start: 0, name: "SURVIVE", className: "survive" },
  { start: 3, name: "FIRST WAVE", className: "" },
  { start: 40, name: "SECOND WAVE", className: "" },
  { start: 80, name: "FINAL WAVE", className: "final" },
];
// Spawn rates per wave (enemies per second)
const WAVE_SPAWN_RATES = {
  0: 0.5,   // Before first wave
  1: 0.7,   // First wave
  2: 1.0,   // Second wave  
  3: 1.5,   // Final wave
};
let waveTimer = 0;
let currentWave = 0;
let waveComplete = false;
let levelTransitioning = false;
let announcedWaves = new Set();

function updateWaveTimerHUD() {
  const timerEl = document.getElementById('waveTimer');
  if (!timerEl) return;
  
  const remaining = Math.max(0, WAVE_DURATION - waveTimer);
  const mins = Math.floor(remaining / 60);
  const secs = Math.floor(remaining % 60);
  timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  
  // Add urgent class when under 30 seconds
  if (remaining < 30) {
    timerEl.classList.add('urgent');
  } else {
    timerEl.classList.remove('urgent');
  }
  
  // Hide timer when complete
  if (remaining <= 0) {
    timerEl.textContent = "CLEAR!";
  }
}

// Health and kill HUD functions
function updateHealthHUD() {
  const healthBar = document.getElementById('healthBar');
  const healthText = document.getElementById('healthText');
  if (healthBar) {
    healthBar.style.width = `${(playerHealth / maxHealth) * 100}%`;
  }
  if (healthText) {
    healthText.textContent = Math.ceil(playerHealth);
  }
}

function updateKillHUD() {
  const killCountEl = document.getElementById('killCount');
  if (killCountEl) {
    killCountEl.textContent = killCount;
  }
}

function showEnemiesRemainingHUD(show) {
  const el = document.getElementById('enemiesRemaining');
  if (el) {
    el.style.display = show ? 'block' : 'none';
  }
}

function updateEnemiesRemainingHUD(count) {
  const el = document.getElementById('enemiesRemainingCount');
  if (el) {
    el.textContent = count;
  }
}

function damagePlayer(amount) {
  playerHealth = Math.max(0, playerHealth - amount);
  hitFlashTimer = hitFlashDuration;
  updateHealthHUD();
  
  // Show hit flash
  const hitFlash = document.getElementById('hitFlash');
  if (hitFlash) {
    hitFlash.classList.add('active');
    setTimeout(() => hitFlash.classList.remove('active'), 150);
  }
  
  // Check for death
  if (playerHealth <= 0) {
    console.log("PLAYER DIED!");
    // TODO: Game over screen
  }
}
// Expose for city level laser damage
window.damagePlayer = damagePlayer;

// Expose stats for city level to access before transition
window.levelStartTime = levelStartTime;
window.totalShotsFired = totalShotsFired;
window.totalGriftersKilled = totalGriftersKilled;

function addKill() {
  killCount++;
  totalGriftersKilled++;
  window.totalGriftersKilled = totalGriftersKilled;
  updateKillHUD();
}

function showWaveAnnouncement(text, className = "") {
  const announce = document.getElementById('waveAnnounce');
  if (announce) {
    announce.textContent = text;
    announce.className = className ? `visible ${className}` : 'visible';
    
    // Hide after 2 seconds
    setTimeout(() => {
      announce.classList.remove('visible');
    }, 2000);
  }
}

function getCurrentWaveIndex() {
  for (let i = WAVE_TIMINGS.length - 1; i >= 0; i--) {
    if (waveTimer >= WAVE_TIMINGS[i].start) {
      return i;
    }
  }
  return 0;
}

// Format seconds as "Xm Ys" 
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

// Show end-game stats tally
function showEndGameStats() {
  // Calculate boss defeat time
  bossDefeatTime = (performance.now() - levelStartTime) / 1000;
  
  // Update window refs to latest values
  window.totalShotsFired = totalShotsFired;
  window.totalGriftersKilled = totalGriftersKilled;
  
  console.log("=== END GAME STATS ===");
  console.log("Total grifters killed:", totalGriftersKilled);
  console.log("Total shots fired:", totalShotsFired);
  console.log("Canyon clear time:", canyonClearTime);
  console.log("Collectibles time:", collectiblesCompleteTime);
  console.log("Boss defeat time:", bossDefeatTime);
  
  // Create stats overlay
  const statsOverlay = document.createElement('div');
  statsOverlay.id = 'endGameStats';
  statsOverlay.innerHTML = `
    <div class="stats-container">
      <div class="stats-title">Right-Click Save <span class="kill">KILL</span></div>
      <h2>MISSION COMPLETE<span class="stats-cursor"></span></h2>
      <div class="stat-row">
        <span class="stat-label">Grifters Eliminated</span>
        <span class="stat-value">${totalGriftersKilled}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Shots Fired</span>
        <span class="stat-value">${totalShotsFired}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Canyon Survival</span>
        <span class="stat-value">${formatTime(canyonClearTime)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">City Collectibles</span>
        <span class="stat-value">${formatTime(collectiblesCompleteTime)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Boss Defeated In</span>
        <span class="stat-value">${formatTime(bossDefeatTime)}</span>
      </div>
      <div class="stat-row total">
        <span class="stat-label">Total Time</span>
        <span class="stat-value">${formatTime(canyonClearTime + collectiblesCompleteTime + bossDefeatTime)}</span>
      </div>
    </div>
  `;
  document.body.appendChild(statsOverlay);
  
  // Clear persisted stats (game complete)
  sessionStorage.removeItem('totalShotsFired');
  sessionStorage.removeItem('totalGriftersKilled');
  sessionStorage.removeItem('canyonClearTime');
  sessionStorage.removeItem('collectiblesCompleteTime');
}

function transitionToCity() {
  // Fade out music before transitioning
  fadeOutMusic(1500);
  
  // Save stats before transitioning
  canyonClearTime = (performance.now() - levelStartTime) / 1000;
  sessionStorage.setItem('canyonClearTime', canyonClearTime.toString());
  sessionStorage.setItem('totalShotsFired', totalShotsFired.toString());
  sessionStorage.setItem('totalGriftersKilled', totalGriftersKilled.toString());
  
  // Set flag to load city level on next load - title screen will show "LEVEL 2"
  sessionStorage.setItem('nextLevel', 'city');
  
  // Delay reload to let music fade
  setTimeout(() => {
    window.location.reload();
  }, 1500);
}

// Debug camera input (IJKL + UO for up/down)
const debugInputState = {
  forward: false,  // I
  back: false,     // K
  left: false,     // J
  right: false,    // L
  up: false,       // U
  down: false,     // O
};

// RCS debug state (for real-time adjustment)
const rcsDebugState = {
  scale: levelRCSSettings[currentLevel]?.scale || 2,
  distance: levelRCSSettings[currentLevel]?.distance || 200,
  heightOffset: levelRCSSettings[currentLevel]?.heightOffset || 24,
  pitch: levelRCSSettings[currentLevel]?.rotation?.pitch || 3.14,
  yaw: levelRCSSettings[currentLevel]?.rotation?.yaw || 3.14,
  roll: levelRCSSettings[currentLevel]?.rotation?.roll || 3.14,
};

// RCS spotlight debug state
const rcsLightDebugState = {
  intensity: levelRCSLightSettings[currentLevel]?.intensity || 50,
  range: levelRCSLightSettings[currentLevel]?.range || 200,
  offsetX: levelRCSLightSettings[currentLevel]?.offsetX || 80,
  offsetY: levelRCSLightSettings[currentLevel]?.offsetY || 30,
  offsetZ: levelRCSLightSettings[currentLevel]?.offsetZ || 0,
  angle: levelRCSLightSettings[currentLevel]?.angle || 4,
};

const mannCoolListener = (event) => {
  const { type, key, eventType } = event.data || {};
  if (type === "keyEvent" && key && eventType) {
    document.dispatchEvent(
      new KeyboardEvent(eventType, {
        key,
        code: key,
        bubbles: true,
        cancelable: true,
      }),
    );
  }
};
window.addEventListener("message", mannCoolListener);

const onKeyChange = (event, isDown) => {
  switch (event.key) {
    case "w":
    case "W":
    case "ArrowUp":
      inputState.forward = isDown;
      break;
    case "s":
    case "S":
    case "ArrowDown":
      inputState.back = isDown;
      break;
    case "a":
    case "A":
    case "ArrowLeft":
      inputState.left = isDown;
      break;
    case "d":
    case "D":
    case "ArrowRight":
      inputState.right = isDown;
      break;
    case "z":
    case "Z":
      inputState.shoot = isDown;
      break;
    case " ":
    case "Shift":
      inputState.jump = isDown;
      break;
    // Debug camera controls (IJKL + UO)
    case "i":
    case "I":
      debugInputState.forward = isDown;
      break;
    case "k":
    case "K":
      debugInputState.back = isDown;
      break;
    case "j":
    case "J":
      debugInputState.left = isDown;
      break;
    case "l":
    case "l":
      // Log player position for finding collectible spots
      if (isDown && window.gameCamera) {
        const pos = window.gameCamera.position;
        console.log(`=== PLAYER POSITION ===`);
        console.log(`X: ${pos.x.toFixed(2)}`);
        console.log(`Y: ${pos.y.toFixed(2)}`);
        console.log(`Z: ${pos.z.toFixed(2)}`);
        console.log(`Copy: { x: ${pos.x.toFixed(2)}, y: ${pos.y.toFixed(2)}, z: ${pos.z.toFixed(2)} }`);
        console.log(`========================`);
      }
      break;
    case "L":
      debugInputState.right = isDown;
      break;
    case "u":
    case "U":
      debugInputState.up = isDown;
      break;
    case "o":
    case "O":
      debugInputState.down = isDown;
      break;
    case "p":
    case "P":
      if (isDown) {
        // Print debug spotlight values (handled in scene)
        window.printDebugSpotlight = true;
        // Also print RCS debug values
        if (window.debug_options.rcsDebugMode) {
          console.log("=== RCS DEBUG VALUES ===");
          console.log(`Scale: ${rcsDebugState.scale}`);
          console.log(`Distance: ${rcsDebugState.distance}`);
          console.log(`HeightOffset: ${rcsDebugState.heightOffset}`);
          console.log(`Rotation: { pitch: ${rcsDebugState.pitch.toFixed(4)}, yaw: ${rcsDebugState.yaw.toFixed(4)}, roll: ${rcsDebugState.roll.toFixed(4)} }`);
          console.log("Copy to levelRCSSettings:");
          console.log(`{
  scale: ${rcsDebugState.scale},
  distance: ${rcsDebugState.distance},
  heightOffset: ${rcsDebugState.heightOffset},
  rotation: { pitch: ${rcsDebugState.pitch.toFixed(4)}, yaw: ${rcsDebugState.yaw.toFixed(4)}, roll: ${rcsDebugState.roll.toFixed(4)} },
  useBakedModel: true,
}`);
          console.log("");
          console.log("=== SPOTLIGHT DEBUG VALUES ===");
          console.log(`Intensity: ${rcsLightDebugState.intensity}`);
          console.log(`Range: ${rcsLightDebugState.range}`);
          console.log(`OffsetX: ${rcsLightDebugState.offsetX}`);
          console.log(`OffsetY: ${rcsLightDebugState.offsetY}`);
          console.log(`Angle: ${rcsLightDebugState.angle}`);
          console.log("Copy to levelRCSLightSettings:");
          console.log(`{
  intensity: ${rcsLightDebugState.intensity},
  range: ${rcsLightDebugState.range},
  color: { r: 0.6, g: 0.7, b: 0.9 },
  angle: ${rcsLightDebugState.angle},
  exponent: 1.5,
  offsetX: ${rcsLightDebugState.offsetX},
  offsetZ: 0,
  offsetY: ${rcsLightDebugState.offsetY},
}`);
          console.log("==============================");
        }
      }
      break;
    // RCS Debug Controls (when rcsDebugMode is enabled)
    case "1":
      if (isDown && window.debug_options.rcsDebugMode) {
        rcsDebugState.scale *= 1.2;
        console.log("RCS Scale:", rcsDebugState.scale);
      }
      break;
    case "2":
      if (isDown && window.debug_options.rcsDebugMode) {
        rcsDebugState.scale *= 0.8;
        console.log("RCS Scale:", rcsDebugState.scale);
      }
      break;
    case "3":
      if (isDown && window.debug_options.rcsDebugMode) {
        rcsDebugState.distance += 20;
        console.log("RCS Distance:", rcsDebugState.distance);
      }
      break;
    case "4":
      if (isDown && window.debug_options.rcsDebugMode) {
        rcsDebugState.distance -= 20;
        console.log("RCS Distance:", rcsDebugState.distance);
      }
      break;
    case "5":
      if (isDown && window.debug_options.rcsDebugMode) {
        rcsDebugState.heightOffset += 10;
        console.log("RCS HeightOffset:", rcsDebugState.heightOffset);
      }
      break;
    case "6":
      if (isDown && window.debug_options.rcsDebugMode) {
        rcsDebugState.heightOffset -= 10;
        console.log("RCS HeightOffset:", rcsDebugState.heightOffset);
      }
      break;
    case "7":
      if (isDown && window.debug_options.rcsDebugMode) {
        rcsDebugState.pitch += 0.2;
        console.log("RCS Pitch:", rcsDebugState.pitch);
      }
      break;
    case "8":
      if (isDown && window.debug_options.rcsDebugMode) {
        rcsDebugState.pitch -= 0.2;
        console.log("RCS Pitch:", rcsDebugState.pitch);
      }
      break;
    case "9":
      if (isDown && window.debug_options.rcsDebugMode) {
        rcsDebugState.yaw += 0.2;
        console.log("RCS Yaw:", rcsDebugState.yaw);
      }
      break;
    case "0":
      if (isDown && window.debug_options.rcsDebugMode) {
        rcsDebugState.yaw -= 0.2;
        console.log("RCS Yaw:", rcsDebugState.yaw);
      }
      break;
    case "-":
      if (isDown && window.debug_options.rcsDebugMode) {
        rcsDebugState.roll += 0.2;
        console.log("RCS Roll:", rcsDebugState.roll);
      }
      break;
    case "=":
      if (isDown && window.debug_options.rcsDebugMode) {
        rcsDebugState.roll -= 0.2;
        console.log("RCS Roll:", rcsDebugState.roll);
      }
      break;
    // Spotlight Debug Controls (Q/E intensity, R/T range, Y/H offsetX, G/B offsetY, N/M angle)
    case "q":
    case "Q":
      if (isDown && window.debug_options.rcsDebugMode) {
        rcsLightDebugState.intensity += 10;
        console.log("Spotlight Intensity:", rcsLightDebugState.intensity);
      }
      break;
    case "e":
    case "E":
      if (isDown && window.debug_options.rcsDebugMode) {
        rcsLightDebugState.intensity = Math.max(0, rcsLightDebugState.intensity - 10);
        console.log("Spotlight Intensity:", rcsLightDebugState.intensity);
      }
      break;
    case "r":
    case "R":
      if (isDown && window.debug_options.rcsDebugMode) {
        rcsLightDebugState.range += 20;
        console.log("Spotlight Range:", rcsLightDebugState.range);
      }
      break;
    case "t":
    case "T":
      if (isDown && window.debug_options.rcsDebugMode) {
        rcsLightDebugState.range = Math.max(10, rcsLightDebugState.range - 20);
        console.log("Spotlight Range:", rcsLightDebugState.range);
      }
      break;
    case "y":
    case "Y":
      if (isDown && window.debug_options.rcsDebugMode) {
        rcsLightDebugState.offsetX += 10;
        console.log("Spotlight offsetX:", rcsLightDebugState.offsetX);
      }
      break;
    case "h":
    case "H":
      if (isDown && window.debug_options.rcsDebugMode) {
        rcsLightDebugState.offsetX -= 10;
        console.log("Spotlight offsetX:", rcsLightDebugState.offsetX);
      }
      break;
    case "g":
    case "G":
      if (isDown && window.debug_options.rcsDebugMode) {
        rcsLightDebugState.offsetY += 10;
        console.log("Spotlight offsetY:", rcsLightDebugState.offsetY);
      }
      break;
    case "b":
    case "B":
      if (isDown && window.debug_options.rcsDebugMode) {
        rcsLightDebugState.offsetY -= 10;
        console.log("Spotlight offsetY:", rcsLightDebugState.offsetY);
      }
      break;
    case "n":
    case "N":
      if (isDown && window.debug_options.rcsDebugMode) {
        rcsLightDebugState.angle += 0.5;
        console.log("Spotlight Angle:", rcsLightDebugState.angle);
      }
      break;
    case "m":
    case "M":
      if (isDown && window.debug_options.rcsDebugMode) {
        rcsLightDebugState.angle = Math.max(0.5, rcsLightDebugState.angle - 0.5);
        console.log("Spotlight Angle:", rcsLightDebugState.angle);
      }
      break;
    default:
      break;
  }
};

document.addEventListener("keydown", (e) => onKeyChange(e, true));
document.addEventListener("keyup", (e) => onKeyChange(e, false));

// ===== MOBILE TOUCH CONTROLS =====
// Joystick state
const joystickState = { x: 0, y: 0 };
let joystickTouchId = null;

// Initialize mobile controls
function setupMobileControls() {
  const joystickArea = document.getElementById('joystickArea');
  const joystickBase = document.getElementById('joystickBase');
  const joystickKnob = document.getElementById('joystickKnob');
  const shootButton = document.getElementById('shootButton');
  const jumpButton = document.getElementById('jumpButton');
  
  if (!joystickArea || !shootButton || !jumpButton) return;
  
  const baseRadius = 60; // Half of 120px base
  const knobRadius = 25; // Half of 50px knob
  const maxOffset = baseRadius - knobRadius;
  
  // Joystick touch handling
  const handleJoystickStart = (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    joystickTouchId = touch.identifier;
    updateJoystickPosition(touch);
  };
  
  const handleJoystickMove = (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchId) {
        updateJoystickPosition(e.changedTouches[i]);
        break;
      }
    }
  };
  
  const handleJoystickEnd = (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystickTouchId) {
        joystickTouchId = null;
        resetJoystick();
        break;
      }
    }
  };
  
  const updateJoystickPosition = (touch) => {
    const rect = joystickBase.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    let deltaX = touch.clientX - centerX;
    let deltaY = touch.clientY - centerY;
    
    // Clamp to max offset
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    if (distance > maxOffset) {
      deltaX = (deltaX / distance) * maxOffset;
      deltaY = (deltaY / distance) * maxOffset;
    }
    
    // Update knob visual position
    joystickKnob.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;
    
    // Normalize to -1 to 1 range
    joystickState.x = deltaX / maxOffset;
    joystickState.y = deltaY / maxOffset;
    
    // Update inputState based on joystick (using deadzone of 0.2)
    const deadzone = 0.2;
    inputState.forward = joystickState.y < -deadzone;
    inputState.back = joystickState.y > deadzone;
    inputState.left = joystickState.x < -deadzone;
    inputState.right = joystickState.x > deadzone;
  };
  
  const resetJoystick = () => {
    joystickKnob.style.transform = 'translate(-50%, -50%)';
    joystickState.x = 0;
    joystickState.y = 0;
    inputState.forward = false;
    inputState.back = false;
    inputState.left = false;
    inputState.right = false;
  };
  
  joystickArea.addEventListener('touchstart', handleJoystickStart, { passive: false });
  joystickArea.addEventListener('touchmove', handleJoystickMove, { passive: false });
  joystickArea.addEventListener('touchend', handleJoystickEnd, { passive: false });
  joystickArea.addEventListener('touchcancel', handleJoystickEnd, { passive: false });
  
  // Shoot button (A)
  shootButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    shootButton.classList.add('pressed');
    inputState.shoot = true;
  }, { passive: false });
  
  shootButton.addEventListener('touchend', (e) => {
    e.preventDefault();
    shootButton.classList.remove('pressed');
    inputState.shoot = false;
  }, { passive: false });
  
  shootButton.addEventListener('touchcancel', (e) => {
    shootButton.classList.remove('pressed');
    inputState.shoot = false;
  });
  
  // Jump button (B)
  jumpButton.addEventListener('touchstart', (e) => {
    e.preventDefault();
    jumpButton.classList.add('pressed');
    inputState.jump = true;
  }, { passive: false });
  
  jumpButton.addEventListener('touchend', (e) => {
    e.preventDefault();
    jumpButton.classList.remove('pressed');
    inputState.jump = false;
  }, { passive: false });
  
  jumpButton.addEventListener('touchcancel', (e) => {
    jumpButton.classList.remove('pressed');
    inputState.jump = false;
  });
  
  // Touch look controls - swipe anywhere on canvas to look around
  // (except joystick and button areas which are handled separately)
  let lookTouchId = null;
  let lastLookX = 0;
  let lastLookY = 0;
  const lookSensitivity = 0.004;
  
  canvas.addEventListener('touchstart', (e) => {
    // Only capture touches that aren't already handled by joystick/buttons
    if (lookTouchId !== null) return;
    
    const touch = e.changedTouches[0];
    // Check if touch is in the control areas (bottom corners)
    const x = touch.clientX;
    const y = touch.clientY;
    const w = window.innerWidth;
    const h = window.innerHeight;
    
    // Skip if touch is in bottom-left (joystick) or bottom-right (buttons)
    const inJoystickArea = x < 180 && y > h - 180;
    const inButtonArea = x > w - 180 && y > h - 140;
    
    if (inJoystickArea || inButtonArea) return;
    
    lookTouchId = touch.identifier;
    lastLookX = touch.clientX;
    lastLookY = touch.clientY;
  }, { passive: true });
  
  canvas.addEventListener('touchmove', (e) => {
    if (lookTouchId === null) return;
    
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === lookTouchId) {
        const dx = touch.clientX - lastLookX;
        const dy = touch.clientY - lastLookY;
        
        // Apply look rotation (will be applied in game loop via window.mobileLookDelta)
        window.mobileLookDelta = { x: dx * lookSensitivity, y: dy * lookSensitivity };
        
        lastLookX = touch.clientX;
        lastLookY = touch.clientY;
        break;
      }
    }
  }, { passive: true });
  
  canvas.addEventListener('touchend', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === lookTouchId) {
        lookTouchId = null;
        window.mobileLookDelta = null;
        break;
      }
    }
  }, { passive: true });
  
  canvas.addEventListener('touchcancel', (e) => {
    lookTouchId = null;
    window.mobileLookDelta = null;
  }, { passive: true });
}

// Initialize mobile controls when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupMobileControls);
} else {
  setupMobileControls();
}
// ===== END MOBILE TOUCH CONTROLS =====

const lookSpeed = 0.0022;
const minPitch = -Math.PI * 0.45;
const maxPitch = Math.PI * 0.45;

let activeDebugCamera = null; // Will be set if debug mode is on

const pointerMove = (event, camera) => {
  const dx = event.movementX || 0;
  const dy = event.movementY || 0;
  
  // If debug mode and mouse is on right half, control debug camera
  if (debug_options.lightDebugMode && activeDebugCamera && event.clientX > window.innerWidth / 2) {
    activeDebugCamera.rotation.y += dx * lookSpeed;
    activeDebugCamera.rotation.x += dy * lookSpeed;
    activeDebugCamera.rotation.x = Math.min(Math.max(activeDebugCamera.rotation.x, minPitch), maxPitch);
  } else {
    // Normal player camera control (left side or no debug mode)
    camera.rotation.y += dx * lookSpeed;
    camera.rotation.x += dy * lookSpeed;
    camera.rotation.x = Math.min(Math.max(camera.rotation.x, minPitch), maxPitch);
  }
};

class ProjectileManager {
  constructor(scene, isBossLevel = false) {
    this.scene = scene;
    this.projectiles = [];
    this.isBossLevel = isBossLevel;
    
    // Different behavior for missile (boss) vs regular shooter
    if (isBossLevel) {
      // Missile mode: faster, bigger, with tracking
      this.speed = 100; // Same speed as regular
      this.maxDistance = 200; // Travel further
      this.cooldown = 0.5; // Slower fire rate
      this.missileScale = 0.5; // Bigger projectile
      this.gravity = 0; // No arc
      this.trackingStrength = 0; // Gentle homing toward target
    } else {
      // Regular shooter mode
      this.speed = 40;
    this.maxDistance = 100;
      this.cooldown = 0.15;
    }
    
    this.lastShotTime = 0;
    
    // Cursor template mesh (loaded async)
    this.cursorTemplate = null;
    this.cursorReady = false;
    this.instanceCount = 0;
    
    // Target for missile tracking (set externally for boss level)
    this.missileTarget = null;
    
    // Rocket fire animation (boss level only)
    this.rocketFireTextures = [];
    this.rocketFireFrame = 0;
    this.rocketFireTimer = 0;
    this.rocketFireInterval = 0.08; // Switch frames every 80ms
    
    // Load cursor model
    this.loadCursorModel();
    
    // Load rocket fire textures for boss level
    if (isBossLevel) {
      this.loadRocketFireTextures();
    }
  }
  
  loadRocketFireTextures() {
    // Load both frames of rocket fire animation
    this.rocketFireTextures = [
      new BABYLON.Texture("./assets/rocket-fire/rocketfire1.png", this.scene),
      new BABYLON.Texture("./assets/rocket-fire/rocketfire2.png", this.scene)
    ];
    
    // Set texture properties for transparency
    this.rocketFireTextures.forEach(tex => {
      tex.hasAlpha = true;
    });
  }
  
  createRocketFireSprite(projectile) {
    // Create a plane for the rocket fire trail
    const fireSprite = BABYLON.MeshBuilder.CreatePlane("rocketFire", { width: 2, height: 3 }, this.scene);
    
    // Create material with first frame
    const fireMat = new BABYLON.StandardMaterial("rocketFireMat", this.scene);
    fireMat.diffuseTexture = this.rocketFireTextures[0];
    fireMat.emissiveTexture = this.rocketFireTextures[0];
    fireMat.useAlphaFromDiffuseTexture = true;
    fireMat.disableLighting = true;
    fireMat.backFaceCulling = false;
    fireSprite.material = fireMat;
    
    // Billboard mode - always face camera
    fireSprite.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    
    // Store reference on projectile
    projectile.metadata.rocketFire = fireSprite;
    projectile.metadata.rocketFireMat = fireMat;
    
    return fireSprite;
  }
  
  async loadCursorModel() {
    try {
      // Load different projectile model based on level
      const modelFile = this.isBossLevel ? "triangle-cursor.glb" : "cursor.glb";
      
      const result = await BABYLON.SceneLoader.ImportMeshAsync(
        "",
        "./assets/",
        modelFile,
        this.scene
      );
      
      // Get the root and set it as template
      this.cursorTemplate = result.meshes[0];
      this.cursorTemplate.setEnabled(false); // Hide template
      
      // Scale based on projectile type
      if (this.isBossLevel) {
        // Missile: larger, more visible
        const missileScale = this.missileScale;
        this.cursorTemplate.scaling = new BABYLON.Vector3(missileScale, missileScale, missileScale);
      } else {
        // Regular cursor: small
      const cursorScale = 0.0003;
      this.cursorTemplate.scaling = new BABYLON.Vector3(cursorScale, cursorScale, cursorScale);
      }
      
      // Make cursor meshes emissive so they glow/are visible
      result.meshes.forEach(m => {
        if (m.material) {
          // For PBR materials
          if (m.material.emissiveColor) {
            m.material.emissiveColor = this.isBossLevel 
              ? new BABYLON.Color3(1.0, 0.5, 0.2) // Orange/fiery for missiles
              : new BABYLON.Color3(0.8, 1.0, 0.8);
          }
          // For PBR materials, also boost emissive intensity
          if (m.material.emissiveIntensity !== undefined) {
            m.material.emissiveIntensity = this.isBossLevel ? 3 : 2;
          }
        }
      });
      
      this.cursorReady = true;
    } catch (error) {
      console.error("Failed to load cursor model:", error);
    }
  }

  shoot(camera, weapon) {
    const now = performance.now() / 1000;
    if (now - this.lastShotTime < this.cooldown) return;
    if (!this.cursorReady) return; // Wait for model to load
    this.lastShotTime = now;
    
    // Track total shots fired for end-game stats
    totalShotsFired++;
    window.totalShotsFired = totalShotsFired;


    // Create an instance of the cursor template
    const projectile = this.cursorTemplate.clone(`projectile_${this.instanceCount++}`);
    projectile.setEnabled(true);
    projectile.name = "projectile"; // For collision detection
    
    // CRITICAL: Ensure projectile has no parent and reset all transforms
    projectile.parent = null;
    projectile.position = BABYLON.Vector3.Zero();
    projectile.rotationQuaternion = null; // Clear quaternion so we can set rotation
    projectile.rotation = BABYLON.Vector3.Zero();
    projectile.scaling = this.cursorTemplate.scaling.clone(); // Preserve scale


    // Calculate spawn position in camera space, then transform to world
    // This ensures consistent visual position relative to the gun view
    const forward = camera.getDirection(BABYLON.Axis.Z);
    const right = camera.getDirection(BABYLON.Axis.X);
    const up = camera.getDirection(BABYLON.Axis.Y);
    
    // Spawn offset in camera space: slightly right, slightly down, forward from camera
    // These values match the weapon position (0.3, -0.25, 0.7) plus a small forward offset
    const spawnOffsetRight = 0.3;
    const spawnOffsetDown = -0.2;
    const spawnOffsetForward = 0.8; // Muzzle is slightly forward of weapon center
    
    // Calculate world position from camera + offsets in camera's local directions
    const spawnPos = camera.position.clone()
      .addInPlace(right.scale(spawnOffsetRight))
      .addInPlace(up.scale(spawnOffsetDown))
      .addInPlace(forward.scale(spawnOffsetForward));
    
    projectile.position = spawnPos;
    
    
    // Point the cursor in the direction it's flying
    // Use lookAt to orient the cursor
    const targetPos = projectile.position.add(forward);
    projectile.lookAt(targetPos);

    // Store velocity and spawn position
    projectile.metadata = {
      velocity: forward.scale(this.speed),
      spawnPos: projectile.position.clone(),
    };
    
    // Create rocket fire trail for boss level missiles
    if (this.isBossLevel && this.rocketFireTextures.length > 0) {
      this.createRocketFireSprite(projectile);
    }

    this.projectiles.push(projectile);
  }

  update(dt) {
    // Update rocket fire animation timer (boss level)
    if (this.isBossLevel) {
      this.rocketFireTimer += dt;
      if (this.rocketFireTimer >= this.rocketFireInterval) {
        this.rocketFireTimer = 0;
        this.rocketFireFrame = (this.rocketFireFrame + 1) % 2; // Toggle between 0 and 1
      }
    }
    
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const vel = p.metadata.velocity;
      
      // Missile physics for boss level
      if (this.isBossLevel) {
        // Apply gravity (slight downward arc) - only if gravity is set
        if (this.gravity > 0) {
          vel.y -= this.gravity * dt;
        }
        
        // Simple tracking toward target (only if tracking is enabled)
        if (this.missileTarget && this.trackingStrength > 0) {
          const toTarget = this.missileTarget.subtract(p.position).normalizeToNew();
          const currentDir = vel.normalizeToNew(); // Use normalizeToNew to not mutate vel!
          
          // Blend toward target direction
          vel.x += (toTarget.x - currentDir.x) * this.trackingStrength * dt * this.speed;
          vel.y += (toTarget.y - currentDir.y) * this.trackingStrength * dt * this.speed;
          vel.z += (toTarget.z - currentDir.z) * this.trackingStrength * dt * this.speed;
          
          // Maintain speed (normalize and rescale)
          const currentSpeed = vel.length();
          if (currentSpeed > 0.1) {
            vel.normalize().scaleInPlace(Math.min(currentSpeed, this.speed));
          }
        }
        
        // Update missile rotation to face velocity direction
        if (vel.length() > 0.1) {
          const targetPos = p.position.add(vel.normalizeToNew());
          p.lookAt(targetPos);
        }
        
        // Update rocket fire trail position and animation
        if (p.metadata.rocketFire) {
          const fireSprite = p.metadata.rocketFire;
          const fireMat = p.metadata.rocketFireMat;
          
          // Position behind and below the projectile (at the green circle / back of cursor)
          const velDir = vel.normalizeToNew();
          const trailOffset = velDir.scale(0.8); // Behind the projectile
          const downOffset = new BABYLON.Vector3(0, -0.3, 0); // Shift down slightly
          fireSprite.position = p.position.subtract(trailOffset).add(downOffset);
          
          // Update texture frame
          if (this.rocketFireTextures.length > 0) {
            fireMat.diffuseTexture = this.rocketFireTextures[this.rocketFireFrame];
            fireMat.emissiveTexture = this.rocketFireTextures[this.rocketFireFrame];
          }
        }
      }
      
      // Move projectile
      p.position.addInPlace(vel.scale(dt));

      // Check distance traveled
      const dist = BABYLON.Vector3.Distance(p.position, p.metadata.spawnPos);
      if (dist > this.maxDistance) {
        // Dispose rocket fire sprite too
        if (p.metadata.rocketFire) {
          p.metadata.rocketFire.dispose();
        }
        p.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }

  getProjectiles() {
    return this.projectiles;
  }

  removeProjectile(projectile) {
    const idx = this.projectiles.indexOf(projectile);
    if (idx !== -1) {
      // Dispose rocket fire sprite if it exists
      if (projectile.metadata && projectile.metadata.rocketFire) {
        projectile.metadata.rocketFire.dispose();
      }
      projectile.dispose();
      this.projectiles.splice(idx, 1);
    }
  }
}

class EnemyManager {
  constructor(scene) {
    this.scene = scene;
    this.enemies = [];
    this.spawnRadius = 50; // Spawn distance from player
    this.speed = 8; // units per second
    this.spawnInterval = 1.5; // seconds between spawns
    this.lastSpawnTime = 0;
    this.maxEnemies = 20;
    this.explosionManager = null; // Set after creation
    
    // Canyon mode: enemies spawn from RCS position
    this.canyonMode = false;
    this.rcsPosition = null; // Set by game for canyon level
    this.fanSpread = Math.PI * 0.8; // 144 degree fan (±72°)
    
    // Ground level for enemies to stay on (set by game after creation)
    this.groundLevel = 0;

    // Preload grifter textures (003 to 102 = 100 images)
    // PERF: Only load for levels with enemies (canyon, city)
    this.grifterMaterials = [];
    if (currentLevel === "canyon" || currentLevel === "city") {
      for (let i = 3; i <= 102; i++) {
        const num = String(i).padStart(3, "0");
        const mat = new BABYLON.StandardMaterial(`grifterMat_${num}`, scene);
        mat.diffuseTexture = new BABYLON.Texture(`./assets/grifters/grifter_${num}.png`, scene);
        mat.diffuseTexture.hasAlpha = true;
        mat.useAlphaFromDiffuseTexture = true;
        mat.emissiveColor = new BABYLON.Color3(0.3, 0.3, 0.3); // Slight glow
        mat.backFaceCulling = false; // Visible from both sides
        this.grifterMaterials.push(mat);
      }
    }
  }

  update(dt, playerPos, cameraRotationY, projectileManager) {
    const now = performance.now() / 1000;

    // Spawn new enemies
    if (now - this.lastSpawnTime > this.spawnInterval && this.enemies.length < this.maxEnemies) {
      this.spawnEnemy(playerPos, cameraRotationY);
      this.lastSpawnTime = now;
    }

    // Update existing enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];

      // Move toward player
      const toPlayer = playerPos.subtract(enemy.position);
      toPlayer.y = 0; // Keep on ground plane for movement direction
      const dist = toPlayer.length();

      if (dist > 0.5) {
        toPlayer.normalize();
        // Move toward player on XZ plane
        const moveVec = toPlayer.scale(this.speed * dt);
        moveVec.y = 0;
        enemy.position.addInPlace(moveVec);
      }
      
      // Throttle ground raycasts - only every 5 frames per enemy (PERF)
      if (!enemy.metadata) enemy.metadata = { raycastFrame: i % 5, targetY: enemy.position.y };
      enemy.metadata.raycastFrame = (enemy.metadata.raycastFrame + 1) % 5;
      
      if (enemy.metadata.raycastFrame === 0) {
      // Raycast down to find ground/building beneath enemy
      const rayOrigin = new BABYLON.Vector3(enemy.position.x, enemy.position.y + 50, enemy.position.z);
      const rayDirection = new BABYLON.Vector3(0, -1, 0);
      const ray = new BABYLON.Ray(rayOrigin, rayDirection, 200);
      
      const hit = this.scene.pickWithRay(ray, (mesh) => {
        // Only hit terrain/buildings, not other game objects
        return mesh.name !== "weapon" && 
               mesh.name !== "projectile" && 
               mesh.name !== "citySkybox" &&
               mesh.name !== "skyDome" &&
               !mesh.name.startsWith("grifter") &&
               !mesh.name.startsWith("rcs") &&
               !mesh.name.startsWith("explosion");
      });
      
      if (hit && hit.hit && hit.pickedPoint) {
          // Cache the target Y for smooth interpolation between raycasts
          enemy.metadata.targetY = hit.pickedPoint.y + 0.75;
        }
      }
      
      // Smooth interpolation toward cached target Y (runs every frame)
      const yDiff = enemy.metadata.targetY - enemy.position.y;
        if (Math.abs(yDiff) > 0.1) {
        enemy.position.y += yDiff * 0.15;
        } else {
        enemy.position.y = enemy.metadata.targetY;
      }

      // Check collision with projectiles
      const projectiles = projectileManager.getProjectiles();
      for (const proj of projectiles) {
        const hitDist = BABYLON.Vector3.Distance(enemy.position, proj.position);
        if (hitDist < 1.2) {
          // Hit! Destroy both (with explosion)
          this.destroyEnemy(i, this.explosionManager);
          projectileManager.removeProjectile(proj);
          addKill(); // Track the kill
          break;
        }
      }

      // Enemy touched player - deal damage!
      if (dist < 1.5) {
        this.destroyEnemy(i); // Enemy dies on contact
        damagePlayer(enemyDamage);
      }
    }
  }

  spawnEnemy(playerPos, cameraRotationY) {
    let spawnX, spawnZ;
    
    if (this.canyonMode && this.rcsPosition) {
      // Canyon mode: spawn near RCS and fan out toward player
      // Start position is near RCS with some random offset
      const rcsPos = this.rcsPosition;
      const spawnOffsetX = (Math.random() - 0.5) * 30; // Random spread around RCS
      const spawnOffsetZ = (Math.random() - 0.5) * 60; // Wider Z spread for fanning
      
      spawnX = rcsPos.x + spawnOffsetX - 20; // Slightly in front of RCS
      spawnZ = rcsPos.z + spawnOffsetZ;
    } else {
      // Normal mode: spawn in front of player (within 80 degree cone = ±40°)
      const spreadAngle = (80 * Math.PI) / 180; // 80 degrees total spread (±40°)
      const baseAngle = cameraRotationY; // Match camera direction
      const angle = baseAngle + (Math.random() - 0.5) * spreadAngle;
      
      spawnX = playerPos.x + Math.sin(angle) * this.spawnRadius;
      spawnZ = playerPos.z + Math.cos(angle) * this.spawnRadius;
    }

    // Create plane enemy with random grifter texture
    const enemy = BABYLON.MeshBuilder.CreatePlane(
      "grifter",
      { width: 1.5, height: 1.5 },
      this.scene
    );
    
    // Random grifter material
    const randomMat = this.grifterMaterials[Math.floor(Math.random() * this.grifterMaterials.length)];
    enemy.material = randomMat;
    
    // Billboard mode - always face camera
    enemy.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;
    
    // Spawn Y position - raycast to find ground at spawn location
    let spawnY = playerPos.y; // Fallback to player Y
    
    if (this.canyonMode && this.rcsPosition) {
      // Canyon mode: spawn near RCS height (will descend via raycast)
      spawnY = this.rcsPosition.y + (Math.random() - 0.5) * 10;
    } else {
      // Raycast down from spawn position to find ground
      const rayOrigin = new BABYLON.Vector3(spawnX, playerPos.y + 100, spawnZ);
      const rayDirection = new BABYLON.Vector3(0, -1, 0);
      const ray = new BABYLON.Ray(rayOrigin, rayDirection, 200);
      
      const hit = this.scene.pickWithRay(ray, (mesh) => {
        return mesh.name !== "weapon" && 
               mesh.name !== "projectile" && 
               mesh.name !== "citySkybox" &&
               mesh.name !== "skyDome" &&
               !mesh.name.startsWith("grifter") &&
               !mesh.name.startsWith("rcs") &&
               !mesh.name.startsWith("explosion");
      });
      
      if (hit && hit.hit && hit.pickedPoint) {
        spawnY = hit.pickedPoint.y + 0.75; // +0.75 for sprite height offset
      }
    }
    
    enemy.position = new BABYLON.Vector3(spawnX, spawnY, spawnZ);
    
    // Initialize metadata for throttled ground raycasting
    enemy.metadata = { 
      raycastFrame: Math.floor(Math.random() * 5), // Stagger raycasts across enemies
      targetY: spawnY 
    };

    this.enemies.push(enemy);
  }

  destroyEnemy(index, explosionManager = null) {
    const enemy = this.enemies[index];
    if (enemy) {
      // Spawn explosion at enemy position
      if (explosionManager) {
        explosionManager.spawn(enemy.position);
      }
      enemy.dispose();
      this.enemies.splice(index, 1);
    }
  }
  
  getEnemies() {
    return this.enemies;
  }
}

// Explosion animation manager
class ExplosionManager {
  constructor(scene, isBossLevel = false) {
    this.scene = scene;
    this.explosions = [];
    this.frameCount = 5; // explosion-0.png through explosion-4.png
    this.frameDuration = 0.08; // seconds per frame
    this.isBossLevel = isBossLevel;
    this.defaultSize = isBossLevel ? 12 : 3; // Bigger explosions for boss level
    
    // Preload explosion textures
    this.materials = [];
    for (let i = 0; i < this.frameCount; i++) {
      const texture = new BABYLON.Texture(`./assets/explosion/explosion-${i}.png`, scene);
      texture.hasAlpha = true;
      
      const mat = new BABYLON.StandardMaterial(`explosionMat_${i}`, scene);
      mat.diffuseTexture = texture;
      mat.emissiveTexture = texture;
      mat.opacityTexture = texture;
      mat.disableLighting = true;
      mat.backFaceCulling = false;
      mat.useAlphaFromDiffuseTexture = true;
      
      this.materials.push(mat);
    }
  }
  
  spawn(position, customSize = null) {
    const size = customSize || this.defaultSize;
    
    // Create a billboard plane for the explosion
    const explosion = BABYLON.MeshBuilder.CreatePlane(
      "explosion",
      { size: size },
      this.scene
    );
    explosion.position = position.clone();
    explosion.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    explosion.material = this.materials[0];
    
    // Render on top of other meshes (especially for boss level)
    explosion.renderingGroupId = 2;
    
    this.explosions.push({
      mesh: explosion,
      frame: 0,
      timer: 0,
    });
  }
  
  update(dt) {
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const exp = this.explosions[i];
      exp.timer += dt;
      
      if (exp.timer >= this.frameDuration) {
        exp.timer = 0;
        exp.frame++;
        
        if (exp.frame >= this.frameCount) {
          // Animation complete - remove explosion
          exp.mesh.dispose();
          this.explosions.splice(i, 1);
        } else {
          // Show next frame
          exp.mesh.material = this.materials[exp.frame];
        }
      }
    }
  }
}

// Radar HUD update - using pooled dots for performance (PERF)
const radarDotPool = [];
const RADAR_DOT_POOL_SIZE = 25; // Max dots we'll ever show
let radarDotPoolInitialized = false;

function initRadarDotPool() {
  const radar = document.getElementById("radar");
  if (!radar || radarDotPoolInitialized) return;
  
  for (let i = 0; i < RADAR_DOT_POOL_SIZE; i++) {
    const dot = document.createElement("div");
    dot.className = "radarDot";
    dot.style.display = "none";
    radar.appendChild(dot);
    radarDotPool.push(dot);
  }
  radarDotPoolInitialized = true;
}

function updateRadar(playerPos, playerRotY, enemies) {
  const radar = document.getElementById("radar");
  if (!radar) return;
  
  // Initialize dot pool on first call
  if (!radarDotPoolInitialized) initRadarDotPool();
  
  const radarDirection = document.getElementById("radarDirection");
  if (radarDirection) {
    // Rotate direction indicator based on player facing (flipped direction, offset by 90 deg)
    const rotDeg = (playerRotY * 180 / Math.PI) - 90;
    radarDirection.style.transform = `translate(-50%, -100%) rotate(${rotDeg}deg)`;
  }
  
  const radarRadius = 55; // Half of radar size minus padding
  const radarRange = 80; // World units that fit in radar
  
  // Reuse pooled dots instead of creating/destroying (PERF)
  let dotIndex = 0;
  
  for (let i = 0; i < enemies.length && dotIndex < RADAR_DOT_POOL_SIZE; i++) {
    const enemy = enemies[i];
    // Get relative position to player
    const dx = enemy.position.x - playerPos.x;
    const dz = enemy.position.z - playerPos.z;
    
    // Rotate by player's facing direction so "up" on radar is forward
    const adjustedRot = -playerRotY + Math.PI;
    const cos = Math.cos(adjustedRot);
    const sin = Math.sin(adjustedRot);
    const rotX = dx * cos - dz * sin;
    const rotZ = dx * sin + dz * cos;
    
    // Scale to radar size
    const radarX = (rotX / radarRange) * radarRadius;
    const radarZ = (-rotZ / radarRange) * radarRadius; // Flip Z for screen coords
    
    // Only show if within radar range
    const dist = Math.sqrt(radarX * radarX + radarZ * radarZ);
    if (dist < radarRadius) {
      const dot = radarDotPool[dotIndex];
      dot.style.left = `${60 + radarX}px`;
      dot.style.top = `${60 + radarZ}px`;
      dot.style.display = "block";
      dotIndex++;
    }
  }
  
  // Hide unused dots
  for (let i = dotIndex; i < RADAR_DOT_POOL_SIZE; i++) {
    radarDotPool[i].style.display = "none";
  }
}

class ForestTiler {
  constructor(scene) {
    this.scene = scene;
    this.tiles = [];
    this.tileCell = new Map(); // tile -> {x, z} cell coords
    this.baseMeshes = [];
    this.baseTransforms = [];
    this.tileSize = 120;
    this.gridRadius = 2; // 7x7 grid for more distance coverage
    this.centerOffset = new BABYLON.Vector3(0, 0, 0);
    this.ready = false;
    this.lastPlayerCell = { x: 0, z: 0 };
  }

  async load() {
    // Choose terrain based on level
    let terrainFile;
    if (currentLevel === "canyon") {
      terrainFile = "white_canyon_terrain_optimized.glb";
    } else if (currentLevel === "city") {
      terrainFile = "lowPolyCity_v2.glb"; // Separate meshes for frustum culling
    } else if (currentLevel === "boss") {
      terrainFile = "arena_optimized.glb";
    } else {
      console.error("Unknown level:", currentLevel);
      return;
    }
    
    // console.log("Loading terrain:", terrainFile);
    
    const container = await BABYLON.SceneLoader.ImportMeshAsync(
      "",
      "./assets/",
      terrainFile,
      this.scene,
    );

    const templateRoot = new BABYLON.TransformNode("forestTemplate", this.scene);
    container.meshes.forEach((m) => {
      if (m.name === "__root__") return;
      m.setParent(templateRoot);
      m.isPickable = false;
      m.alwaysSelectAsActiveMesh = false;
      m.cullingStrategy = BABYLON.AbstractMesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;
    });

    const bounds = templateRoot.getHierarchyBoundingVectors();
    const sizeVec = bounds.max.subtract(bounds.min);
    // console.log("Terrain bounds:", bounds.min.toString(), "to", bounds.max.toString());
    // console.log("Terrain size:", sizeVec.toString());
    
    // Canyon: 13 copies placed end to end with visibility culling
    // Using INSTANCES for better performance (shares geometry)
    if (currentLevel === "canyon") {
      const canyonScale = 50; // Scale up significantly
      const canyonLength = sizeVec.x * canyonScale * 0.95; // Length of one segment (slight overlap)
      const numSegments = 13;
      
      this.canyonSegments = [];
      this.canyonSegmentLength = canyonLength;
      this.canyonVisibleRange = 9; // How many segments visible in each direction (13 total visible)
      
      // First segment uses the original template
      templateRoot.scaling = new BABYLON.Vector3(canyonScale, canyonScale, canyonScale);
      templateRoot.position.x = 0;
      templateRoot.getChildMeshes().forEach(m => {
        m.isPickable = true;
      });
      templateRoot.computeWorldMatrix(true);
      templateRoot.getChildMeshes().forEach(m => m.computeWorldMatrix(true));
      this.canyonSegments.push(templateRoot);
      
      // Create instances for remaining segments (shares geometry = better perf)
      for (let i = 1; i < numSegments; i++) {
        // Create a parent transform node for this segment
        const segmentRoot = new BABYLON.TransformNode(`canyon_${i}`, this.scene);
        segmentRoot.scaling = new BABYLON.Vector3(canyonScale, canyonScale, canyonScale);
        segmentRoot.position.x = i * canyonLength;
        
        // Create instances of each child mesh
        templateRoot.getChildMeshes().forEach((mesh, meshIdx) => {
          if (mesh.geometry) {
            const instance = mesh.createInstance(`canyon_${i}_mesh_${meshIdx}`);
            instance.parent = segmentRoot;
            instance.isPickable = true;
          }
        });
        
        segmentRoot.setEnabled(i < this.canyonVisibleRange);
        segmentRoot.computeWorldMatrix(true);
        
        this.canyonSegments.push(segmentRoot);
      }
      
      // Calculate bounds for first segment (for player start position)
      const scaledBounds = templateRoot.getHierarchyBoundingVectors();
      
      // Store the scaled bounds for player positioning
      this.canyonBounds = scaledBounds;
      this.isCanyonLevel = true;
      this.ready = true;
      return; // Skip forest tiling for canyon
    }
    
    // City: Single large environment (or tiled if needed)
    if (currentLevel === "city") {
      const cityScale = 1; // Start at natural scale, adjust as needed
      
      // Apply scale to the city
      templateRoot.scaling = new BABYLON.Vector3(cityScale, cityScale, cityScale);
      templateRoot.position = new BABYLON.Vector3(0, 0, 0);
      
      // Store city root for CityLevel module to use (for BuildingManager)
      this.cityRoot = templateRoot;
      
      // Make meshes pickable for ground raycast (materials handled by CityLevel)
      // NOTE: Removed alwaysSelectAsActiveMesh to allow frustum culling (PERF)
      templateRoot.getChildMeshes().forEach(m => {
        m.isPickable = true;
      });
      
      templateRoot.computeWorldMatrix(true);
      templateRoot.getChildMeshes().forEach(m => m.computeWorldMatrix(true));
      
      // Calculate bounds for player start position
      const scaledBounds = templateRoot.getHierarchyBoundingVectors();
      
      // Create a large ground plane under the city with asphalt texture
      const citySize = scaledBounds.max.subtract(scaledBounds.min);
      const groundSize = Math.max(citySize.x, citySize.z) * 3; // 3x the city size
      const cityGround = BABYLON.MeshBuilder.CreateGround(
        "cityGround",
        { width: groundSize, height: groundSize },
        this.scene
      );
      
      // Position ground at the bottom of the city
      cityGround.position.x = (scaledBounds.min.x + scaledBounds.max.x) / 2;
      cityGround.position.z = (scaledBounds.min.z + scaledBounds.max.z) / 2;
      cityGround.position.y = scaledBounds.min.y + 45; // Y offset
      
      // Apply asphalt street texture
      const groundMat = new BABYLON.StandardMaterial("cityGroundMat", this.scene);
      
      // Color/diffuse texture
      const asphaltTexture = new BABYLON.Texture(
        "./assets/textures/CityStreetAsphaltGenericClean001/CityStreetAsphaltGenericClean001_COL_2K.jpg",
        this.scene
      );
      // Tile the texture across the ground
      const textureTiling = 20; // How many times to tile (tweak this!)
      asphaltTexture.uScale = textureTiling;
      asphaltTexture.vScale = textureTiling;
      groundMat.diffuseTexture = asphaltTexture;
      
      // Normal map for depth/detail
      const normalTexture = new BABYLON.Texture(
        "./assets/textures/CityStreetAsphaltGenericClean001/CityStreetAsphaltGenericClean001_NRM_2K.jpg",
        this.scene
      );
      normalTexture.uScale = textureTiling;
      normalTexture.vScale = textureTiling;
      groundMat.bumpTexture = normalTexture;
      
      groundMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1); // Slight shine
      cityGround.material = groundMat;
      cityGround.isPickable = true; // For raycast collision
      
      // Store the scaled bounds for player positioning
      this.cityBounds = scaledBounds;
      this.isCityLevel = true;
      this.ready = true;
      return; // Skip forest tiling for city
    }
    
    // Boss: Arena environment
    if (currentLevel === "boss") {
      console.log("=== BOSS LEVEL LOADING ===");
      console.log("Arena meshes loaded:", container.meshes.length);
      
      // Arena model is in centimeters - scale down to game units
      const arenaScale = 0.01; // 1/100 scale (cm to m)
      
      templateRoot.scaling = new BABYLON.Vector3(arenaScale, arenaScale, arenaScale);
      templateRoot.position = new BABYLON.Vector3(0, 0, 0);
      
      // Store arena root for BossLevel module
      this.arenaRoot = templateRoot;
      
      // Make meshes pickable for ground raycast
      const childMeshes = templateRoot.getChildMeshes();
      console.log("Arena child meshes:", childMeshes.length);
      childMeshes.forEach(m => {
        m.isPickable = true;
        console.log("  Mesh:", m.name, "visible:", m.isVisible);
      });
      
      templateRoot.computeWorldMatrix(true);
      templateRoot.getChildMeshes().forEach(m => m.computeWorldMatrix(true));
      
      // Calculate bounds for player start position
      const scaledBounds = templateRoot.getHierarchyBoundingVectors();
      console.log("Arena bounds:", scaledBounds.min.toString(), "to", scaledBounds.max.toString());
      
      // Store the scaled bounds for player positioning
      this.arenaBounds = scaledBounds;
      this.isBossLevel = true;
      this.ready = true;
      console.log("=== BOSS LEVEL READY ===");
      return;
    }
    
    // Forest: use tiling system
    const biggestDim = Math.max(sizeVec.x, sizeVec.z);
    // More overlap to fill gaps (0.7 = 30% overlap)
    this.tileSize = biggestDim * 0.7;

    // Calculate center offset so tiles align properly
    const centerX = (bounds.max.x + bounds.min.x) / 2;
    const centerZ = (bounds.max.z + bounds.min.z) / 2;
    this.centerOffset = new BABYLON.Vector3(-centerX, 0, -centerZ);

    this.baseMeshes = templateRoot.getChildMeshes();
    this.baseTransforms = this.baseMeshes.map((mesh) => {
      const scaling = new BABYLON.Vector3();
      const rotationQuaternion = new BABYLON.Quaternion();
      const position = new BABYLON.Vector3();
      mesh.getWorldMatrix().decompose(scaling, rotationQuaternion, position);
      // Apply center offset to each mesh position
      position.addInPlace(this.centerOffset);
      return {
        mesh,
        position,
        rotationQuaternion,
        scaling,
      };
    });

    templateRoot.setEnabled(false);
    this._createGrid();
    this.ready = true;
  }

  _createGrid() {
    const cells = [];
    for (let x = -this.gridRadius; x <= this.gridRadius; x += 1) {
      for (let z = -this.gridRadius; z <= this.gridRadius; z += 1) {
        cells.push({ x, z });
      }
    }

    cells.forEach((cell, idx) => {
      const tile = this._instantiateTile(idx);
      this._positionTile(tile, cell.x, cell.z);
      this.tiles.push(tile);
    });
  }

  _instantiateTile(idx) {
    const root = new BABYLON.TransformNode(`forestTile_${idx}`, this.scene);
    this.baseTransforms.forEach((bt, childIdx) => {
      // Use clone instead of instance for more reliable parent transforms
      const clone = bt.mesh.clone(`ft_${idx}_${childIdx}`, root);
      clone.position.copyFrom(bt.position);
      if (bt.rotationQuaternion) {
        clone.rotationQuaternion = bt.rotationQuaternion.clone();
      } else {
        clone.rotation.copyFrom(bt.mesh.rotation);
      }
      clone.scaling.copyFrom(bt.scaling);
      clone.isPickable = false;
      clone.alwaysSelectAsActiveMesh = false;
      clone.cullingStrategy = BABYLON.AbstractMesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;
    });

    if (debug_options.showTileBounds) {
      const bbox = BABYLON.BoundingBoxGizmo.MakeNotPickableAndWrapInBoundingBox(root);
      bbox.color = BABYLON.Color3.FromInts(150, 40, 200);
      bbox.enableRotation = false;
      bbox.scaleBoxSize = 0.9;
    }

    return root;
  }

  _positionTile(tile, cx, cz) {
    // Store cell coords in Map to avoid any property issues
    this.tileCell.set(tile, { x: cx, z: cz });
    tile.position.x = cx * this.tileSize;
    tile.position.z = cz * this.tileSize;
    
    // Force matrix update on tile and all children
    tile.computeWorldMatrix(true);
    tile.getChildMeshes().forEach(m => {
      m.computeWorldMatrix(true);
    });

    if (debug_options.logTileMoves) {
      console.log(`  Tile placed at world (${tile.position.x.toFixed(1)}, ${tile.position.z.toFixed(1)}) for cell (${cx}, ${cz})`);
    }
  }

  _getCellKey(cx, cz) {
    return `${cx},${cz}`;
  }

  update(playerPos) {
    if (!this.ready) return;
    
    // Canyon: update segment visibility based on player position
    if (this.isCanyonLevel && this.canyonSegments) {
      const playerSegment = Math.floor(playerPos.x / this.canyonSegmentLength);
      
      for (let i = 0; i < this.canyonSegments.length; i++) {
        const segment = this.canyonSegments[i];
        const distance = Math.abs(i - playerSegment);
        const shouldBeVisible = distance <= this.canyonVisibleRange;
        
        if (segment.isEnabled() !== shouldBeVisible) {
          segment.setEnabled(shouldBeVisible);
        }
      }
      return; // No forest tiling for canyon
    }
    const cellX = Math.round(playerPos.x / this.tileSize);
    const cellZ = Math.round(playerPos.z / this.tileSize);

    // Only update if player moved to a new cell
    if (cellX === this.lastPlayerCell.x && cellZ === this.lastPlayerCell.z) {
      return;
    }
    this.lastPlayerCell = { x: cellX, z: cellZ };

    if (debug_options.logTileMoves) {
      console.log(`Player at world (${playerPos.x.toFixed(1)}, ${playerPos.z.toFixed(1)}) = cell (${cellX}, ${cellZ}), tileSize=${this.tileSize.toFixed(1)}`);
    }

    // Build set of desired cell keys
    const desiredSet = new Set();
    const desiredList = [];
    for (let dx = -this.gridRadius; dx <= this.gridRadius; dx += 1) {
      for (let dz = -this.gridRadius; dz <= this.gridRadius; dz += 1) {
        const cx = cellX + dx;
        const cz = cellZ + dz;
        desiredSet.add(this._getCellKey(cx, cz));
        desiredList.push({ x: cx, z: cz });
      }
    }

    // Find which tiles are already in valid positions and which need recycling
    const occupiedCells = new Map(); // cell key -> tile
    const tilesToRecycle = [];

    for (const tile of this.tiles) {
      const cell = this.tileCell.get(tile);
      if (!cell) {
        // Tile has no cell assigned, recycle it
        tilesToRecycle.push(tile);
        continue;
      }
      const key = this._getCellKey(cell.x, cell.z);
      if (desiredSet.has(key) && !occupiedCells.has(key)) {
        occupiedCells.set(key, tile);
      } else {
        tilesToRecycle.push(tile);
      }
    }

    // Find cells that need tiles and assign recycled tiles to them
    let recycledCount = 0;
    for (const cell of desiredList) {
      const key = this._getCellKey(cell.x, cell.z);
      if (!occupiedCells.has(key) && tilesToRecycle.length > 0) {
        const tile = tilesToRecycle.pop();
        this._positionTile(tile, cell.x, cell.z);
        recycledCount++;
      }
    }

    if (debug_options.logTileMoves && recycledCount > 0) {
      console.log(`Recycled ${recycledCount} tiles, ${tilesToRecycle.length} unused`);
    }
  }
}

async function createScene() {
  // Initialize background music for this level
  initBackgroundMusic();
  
  // Loading progress tracker
  let loadingStep = 0;
  // Adjust total steps based on level (city has extra step)
  const totalSteps = currentLevel === "city" ? 8 : 7;
  function reportProgress(stepName, forceComplete = false) {
    loadingStep++;
    const percent = forceComplete ? 100 : Math.min(100, (loadingStep / totalSteps) * 100);
    console.log(`Loading [${loadingStep}/${totalSteps}]: ${stepName} (${Math.round(percent)}%)`);
    if (window.onLoadingProgress) {
      window.onLoadingProgress(percent);
    }
  }
  
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0.02, 0.03, 0.05, 1);
  
  // Fog settings - disabled for city/boss, light for canyon
  if (currentLevel === "city" || currentLevel === "boss") {
    scene.fogMode = BABYLON.Scene.FOGMODE_NONE; // No fog - see everything!
  } else {
    scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
    scene.fogColor = new BABYLON.Color3(0.08, 0.12, 0.18); // Slightly blue atmospheric fog
    scene.fogDensity = 0.002; // Light atmospheric haze
  }
  scene.environmentIntensity = (currentLevel === "city" || currentLevel === "boss") ? 1.0 : 0.3;
  
  // Add glow layer for projectile letters only
  const glowLayer = new BABYLON.GlowLayer("glowLayer", scene);
  glowLayer.intensity = 2.0; // Strong glow for letters
  
  // Only include meshes we explicitly add (projectiles)
  glowLayer.customEmissiveColorSelector = function(mesh, subMesh, material, result) {
    if (mesh.name === "projectile") {
      // Projectiles get full glow
      result.set(1, 1, 1, 1);
    } else {
      // Everything else - no glow
      result.set(0, 0, 0, 0);
    }
  };

  const playerHeight = 1.0; // Eye level above ground
  const camera = new BABYLON.UniversalCamera(
    "camera",
    new BABYLON.Vector3(0, playerHeight, 0),
    scene,
  );
  window.gameCamera = camera; // For position logging (press L)
  camera.minZ = 0.1;
  camera.maxZ = (currentLevel === "city" || currentLevel === "boss") ? 10000 : 1000; // Further draw distance
  camera.speed = 0.25;
  camera.inertia = 0.6;
  camera.angularSensibility = 6000;
  camera.inputs.clear(); // we handle look ourselves
  camera.rotation.x = 0; // look straight ahead initially
  camera.rotation.y = Math.PI / 2; // Start facing +90° (along the forest path)

  // Create weapon - load NES Zapper or Super Scope based on level
  let weapon = null;
  const weaponFile = currentLevel === "boss" ? "super-scope.glb" : "nesZapper.glb";
  const weaponResult = await BABYLON.SceneLoader.ImportMeshAsync(
    "",
    "./assets/",
    weaponFile,
    scene
  );
  reportProgress("Weapon loaded");
  
  // Get the root of the loaded model
  const weaponRoot = weaponResult.meshes[0];
  weaponRoot.name = "weapon";
  weapon = weaponRoot;
  
  // Parent to camera so it follows the view
  weapon.parent = camera;
  
  // Position and rotation vary per weapon
  if (currentLevel === "boss") {
    // Super Scope: larger weapon, different positioning
    weapon.position = new BABYLON.Vector3(0.4, -0.3, 0.8);
  weapon.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0, Math.PI / 2, 0);
    const weaponScale = 0.15; // May need adjustment based on model size
  weapon.scaling = new BABYLON.Vector3(weaponScale, weaponScale, weaponScale);
  } else {
    // NES Zapper: original settings
    weapon.position = new BABYLON.Vector3(0.3, -0.25, 0.7);
    weapon.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(0, Math.PI / 2, 0);
    const weaponScale = 0.22;
    weapon.scaling = new BABYLON.Vector3(weaponScale, weaponScale, weaponScale);
  }

  canvas.addEventListener("pointermove", (evt) => pointerMove(evt, camera));
  
  // Debug camera for light testing (if enabled)
  let debugCamera = null;
  let debugSpotlight = null;
  
  if (debug_options.lightDebugMode) {
    // Create free-flight debug camera starting near RCS
    debugCamera = new BABYLON.FreeCamera(
      "debugCamera",
      new BABYLON.Vector3(100, 30, 0), // Start partway to RCS, lower
      scene
    );
    debugCamera.minZ = 0.1;
    debugCamera.maxZ = 1000;
    debugCamera.rotation.y = Math.PI / 2; // Face toward +X (toward RCS) - same as player start
    
    // Give debug camera its own light so we can see where we're flying
    const debugCamLight = new BABYLON.PointLight(
      "debugCamLight",
      debugCamera.position.clone(),
      scene
    );
    debugCamLight.intensity = 10;
    debugCamLight.range = 1;
    debugCamLight.diffuse = new BABYLON.Color3(1, 1, 1);
    
    // Split screen: left = player view, right = debug camera view
    camera.viewport = new BABYLON.Viewport(0, 0, 0.5, 1); // Left half
    debugCamera.viewport = new BABYLON.Viewport(0.5, 0, 0.5, 1); // Right half
    
    // Attach debug camera to canvas for input (optional)
    debugCamera.attachControl(canvas, true);
    
    // For multi-camera rendering:
    // 1. Clear activeCamera (activeCameras won't work if activeCamera is set)
    // 2. Set cameraToUseForPointers for picking
    scene.activeCamera = undefined;
    scene.cameraToUseForPointers = camera;
    
    // Register both cameras for rendering
    scene.activeCameras = [camera, debugCamera];
    
    // Force engine resize to apply viewports
    engine.resize();
    
    console.log("activeCameras length:", scene.activeCameras.length);
    console.log("activeCamera:", scene.activeCamera);
    console.log("camera viewport:", camera.viewport.x, camera.viewport.y, camera.viewport.width, camera.viewport.height);
    console.log("debugCamera viewport:", debugCamera.viewport.x, debugCamera.viewport.y, debugCamera.viewport.width, debugCamera.viewport.height);
    
    // Debug spotlight attached to debug camera
    debugSpotlight = new BABYLON.SpotLight(
      "debugSpotlight",
      new BABYLON.Vector3(0, 0, 0),
      new BABYLON.Vector3(0, 0, 1), // Forward direction
      Math.PI / 4, // 45 degree cone
      2,
      scene
    );
    debugSpotlight.intensity = 50;
    debugSpotlight.range = 500;
    debugSpotlight.diffuse = new BABYLON.Color3(1, 0.9, 0.7); // Warm light
    
    activeDebugCamera = debugCamera; // Enable mouse control
    
    console.log("=== LIGHT DEBUG MODE ===");
    console.log("Left view: Player perspective");
    console.log("Right view: Debug camera with spotlight");
    console.log("Controls: IJKL to move, UO for up/down");
    console.log("Mouse on RIGHT side to aim debug camera");
    console.log("Press P to print debug spotlight position/direction");
  }

  // Ambient/hemispheric light - brighter for city level (global illumination)
  const hemi = new BABYLON.HemisphericLight(
    "hemi",
    new BABYLON.Vector3(0.2, 1, 0.2),
    scene,
  );
  hemi.intensity = currentLevel === "city" ? 1.5 : currentLevel === "boss" ? 0.4 : 0; // City bright, boss dim/spooky
  hemi.diffuse = new BABYLON.Color3(0.8, 0.85, 1.0); // Slightly cool daylight
  hemi.groundColor = new BABYLON.Color3(0.3, 0.3, 0.4); // Ambient from below
  
  // Player's light - follows camera, settings per level (disabled for city)
  const lightSettings = levelLightSettings[currentLevel] || levelLightSettings.canyon;
  const playerLight = new BABYLON.PointLight(
    "playerLight",
    new BABYLON.Vector3(0, 1, 0),
    scene
  );
  if (currentLevel === "city") {
    playerLight.intensity = 0; // No player light in city - use global illumination
  } else {
    playerLight.intensity = lightSettings.intensity;
  }
  playerLight.range = lightSettings.range;
  playerLight.diffuse = new BABYLON.Color3(lightSettings.color.r, lightSettings.color.g, lightSettings.color.b);

  const tiler = new ForestTiler(scene);
  await tiler.load();
  reportProgress("Terrain loaded");
  
  // Initialize city level gameplay (if city level)
  if (currentLevel === "city" && window.CityLevel && tiler.cityRoot && tiler.cityBounds) {
    await window.CityLevel.setup(scene, tiler.cityRoot, tiler.cityBounds);
    reportProgress("City level initialized");
    
    // PERFORMANCE: Reduce scene overhead (but keep world matrices for frustum culling)
    console.log("Applying city performance optimizations...");
    scene.autoClear = false; // We have skybox, no need to clear
    scene.autoClearDepthAndStencil = false;
    // NOTE: Don't freeze world matrices - need them for frustum culling with separate meshes
  }
  
  // Skybox - different per level
  if (currentLevel === "city") {
    // City level: Load GLB skybox model
    const skyboxResult = await BABYLON.SceneLoader.ImportMeshAsync(
      "",
      "./assets/",
      "city-skybox.glb",
      scene
    );
    
    const skyboxRoot = skyboxResult.meshes[0];
    skyboxRoot.name = "citySkybox";
    
    // Scale up to surround the scene
    const skyboxScale = 3;
    skyboxRoot.scaling = new BABYLON.Vector3(skyboxScale, skyboxScale, skyboxScale);
    skyboxRoot.position = new BABYLON.Vector3(0, 0, 0);
    
    // Make skybox meshes self-illuminated, not pickable, and render behind
    skyboxRoot.getChildMeshes().forEach(m => {
      m.isPickable = false;
      m.renderingGroupId = 0; // Render behind everything
      m.alwaysSelectAsActiveMesh = true; // Never cull the skybox
      
      // Make the skybox self-illuminated (doesn't need scene lights)
      if (m.material) {
        m.material.disableLighting = true; // Ignore scene lights
        // Copy diffuse to emissive so it glows on its own
        if (m.material.diffuseTexture) {
          m.material.emissiveTexture = m.material.diffuseTexture;
        }
        if (m.material.diffuseColor) {
          m.material.emissiveColor = m.material.diffuseColor;
        }
      }
    });
    
    // Make it follow the camera (infinite distance effect)
    scene.onBeforeRenderObservable.add(() => {
      skyboxRoot.position.x = camera.position.x;
      skyboxRoot.position.z = camera.position.z;
    });
    reportProgress("Skybox loaded");
    
  } else if (currentLevel === "boss") {
    // Boss level: Simple dark night sky (no video)
    const skyDome = BABYLON.MeshBuilder.CreateSphere(
      "skyDome", 
      { diameter: 2000, sideOrientation: BABYLON.Mesh.BACKSIDE }, 
      scene
    );
    const skyMat = new BABYLON.StandardMaterial("skyMat", scene);
    
    // Simple gradient night sky - dark blue/black
    skyMat.emissiveColor = new BABYLON.Color3(0.02, 0.02, 0.08); // Very dark blue
    skyMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
    skyMat.disableLighting = true;
    skyMat.backFaceCulling = false;
    
    skyDome.material = skyMat;
    skyDome.infiniteDistance = true;
    skyDome.renderingGroupId = 0;
    reportProgress("Skybox loaded");
    
  } else {
    // Canyon level: Use animated xcopy texture on sphere
    const skyDome = BABYLON.MeshBuilder.CreateSphere(
      "skyDome", 
      { diameter: 2000, sideOrientation: BABYLON.Mesh.BACKSIDE }, 
      scene
    );
    const skyMat = new BABYLON.StandardMaterial("skyMat", scene);
    
    // Animated video skybox
    const videoTexture = new BABYLON.VideoTexture(
      "skyVideo", 
      "./assets/xcopy-skybox.mp4", 
      scene, 
      true,  // generateMipMaps
      true,  // invertY
      BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
      {
        autoPlay: true,
        loop: true,
        muted: true,
        autoUpdateTexture: true
      }
    );
    videoTexture.uScale = 4; // Tile horizontally
    videoTexture.vScale = 2; // Tile vertically
    skyMat.emissiveTexture = videoTexture;
    
    // Force play on first click (browser autoplay policy workaround)
    const playOnInteraction = () => {
      if (videoTexture.video) {
        videoTexture.video.play().catch(e => console.log("Video play failed:", e));
      }
      canvas.removeEventListener("pointerdown", playOnInteraction);
    };
    canvas.addEventListener("pointerdown", playOnInteraction);
    
    // Also try to play immediately
    videoTexture.onLoadObservable.addOnce(() => {
      if (videoTexture.video) {
        videoTexture.video.play().catch(e => console.log("Auto-play blocked, click to start"));
      }
    });
    
    skyMat.disableLighting = true;
    skyMat.backFaceCulling = false;
    skyMat.fogEnabled = false; // Skybox should NOT be affected by fog
    skyDome.material = skyMat;
    skyDome.infiniteDistance = true; // Always at "infinity"
    skyDome.renderingGroupId = 0; // Render behind everything
    skyDome.applyFog = false; // Mesh-level fog disable
    reportProgress("Skybox loaded");
  }
  
  // Adjust player start position based on level
  if (currentLevel === "canyon" && tiler.canyonBounds) {
    const bounds = tiler.canyonBounds;
    // Start at one end of the canyon (min X), centered in Z, at ground level
    camera.position.x = bounds.min.x + 50; // Near the start
    camera.position.z = (bounds.min.z + bounds.max.z) / 2; // Centered
    camera.position.y = bounds.min.y + 5 + playerHeight; // At canyon floor + buffer + eye height
    // console.log("Canyon level - player start:", camera.position.toString());
    // console.log("Canyon bounds:", bounds.min.toString(), "to", bounds.max.toString());
  } else if (currentLevel === "city" && tiler.cityBounds) {
    const bounds = tiler.cityBounds;
    // Start at the edge of the city (less likely to be inside a building)
    // Offset from center toward min corner
    camera.position.x = bounds.min.x + 20; // Near edge, not center
    camera.position.z = bounds.min.z + 20; // Near edge, not center  
    camera.position.y = bounds.min.y + 50 + playerHeight; // Above buildings, will fall to ground
  } else if (currentLevel === "boss" && tiler.arenaBounds) {
    const bounds = tiler.arenaBounds;
    console.log("Boss spawn - bounds:", bounds.min.toString(), "to", bounds.max.toString());
    // Spawn in center of arena
    camera.position.x = (bounds.min.x + bounds.max.x) / 2;
    camera.position.z = (bounds.min.z + bounds.max.z) / 2;
    camera.position.y = bounds.min.y + 50; // Start high and fall to find ground
    console.log("Boss spawn - player position:", camera.position.toString());
  }
  
  // Store spawn position for respawning after falling off edge
  const spawnPosition = camera.position.clone();
  const fallDeathThreshold = -100; // How far below ground before respawn

  // Get per-level RCS settings
  const rcsSettings = levelRCSSettings[currentLevel] || levelRCSSettings.canyon;
  const rcsDistance = rcsSettings.distance;
  const rcsHeightOffset = rcsSettings.heightOffset;
  const rcsScale = rcsSettings.scale;
  
  // Load RCS - either baked animation model or original + retargeting
  let rcsRoot;
  let rcsResult;
  
  // Store skeleton reference for head bone tracking (boss hitbox)
  let rcsSkeleton = null;
  let headBone = null;
  let glassesMesh = null; // Separate glasses mesh for boss hitbox
  let bakedWalkAnim = null; // Baked animation to stop when switching to retargeted anims
  
  // Death animation model (loaded for boss level)
  let deathModelRoot = null;
  let deathAnimation = null;
  
  if (rcsSettings.useBakedModel) {
    // Use custom model file if specified, otherwise default
    const modelFile = rcsSettings.modelFile || "RCS-walking.glb";
    console.log("Loading RCS model:", modelFile);
    
    rcsResult = await BABYLON.SceneLoader.ImportMeshAsync(
      "",
      "./assets/",
      modelFile,
      scene
    );
    rcsRoot = rcsResult.meshes[0];
    
    // Log RCS meshes to check for separate parts (glasses, etc)
    console.log("=== RCS MODEL MESHES ===");
    rcsResult.meshes.forEach((m, i) => {
      console.log(`  ${i}: ${m.name}`);
    });
    
    // Find the GLASSES mesh (for boss level hit detection)
    glassesMesh = rcsResult.meshes.find(m => 
      m.name.toUpperCase() === "GLASSES" || 
      m.name.toLowerCase().includes("glasses")
    );
    if (glassesMesh) {
      console.log("Found GLASSES mesh:", glassesMesh.name);
      // Make it pickable for collision detection
      glassesMesh.isPickable = true;
      // Store reference globally for hit detection
      window.glassesMesh = glassesMesh;
    } else {
      console.log("No separate GLASSES mesh found in model");
    }
    
    // Get skeleton and log all bones (for finding head bone name)
    if (rcsResult.skeletons && rcsResult.skeletons.length > 0) {
      rcsSkeleton = rcsResult.skeletons[0];
      console.log("=== RCS SKELETON BONES ===");
      rcsSkeleton.bones.forEach((bone, i) => {
        console.log(`  ${i}: ${bone.name}`);
      });
      
      // Find the head bone (Mixamo uses "mixamorig:Head")
      headBone = rcsSkeleton.bones.find(b => 
        b.name === "mixamorig:Head" || 
        b.name.toLowerCase().includes("head")
      );
      if (headBone) {
        console.log("Found head bone:", headBone.name);
      } else {
        console.warn("Could not find head bone in skeleton!");
      }
    }
    
    // Disable frustum culling on RCS so it doesn't pop in
    rcsResult.meshes.forEach(m => {
      m.alwaysSelectAsActiveMesh = true;
    });
    
    // Start the baked animation if present (will be replaced by boss animations if boss level)
    if (rcsResult.animationGroups && rcsResult.animationGroups.length > 0) {
      bakedWalkAnim = rcsResult.animationGroups[0];
      bakedWalkAnim.start(true, 0.3); // Loop at 0.3 speed
    }
    
    // Load death animation model for boss level (hidden until boss dies)
    if (currentLevel === "boss") {
      try {
        const deathResult = await BABYLON.SceneLoader.ImportMeshAsync(
          "",
          "./assets/animations/baked/",
          "RCS-death.glb",
          scene
        );
        
        deathModelRoot = deathResult.meshes[0];
        deathModelRoot.setEnabled(false); // Hide until needed
        
        // Store the death animation
        if (deathResult.animationGroups && deathResult.animationGroups.length > 0) {
          deathAnimation = deathResult.animationGroups[0];
          deathAnimation.stop(); // Don't play yet
        }
        
        console.log("Death animation loaded successfully");
      } catch (error) {
        console.error("Failed to load death animation:", error);
      }
    }
  } else {
    // Other levels: Load original model + retarget animation
    rcsResult = await BABYLON.SceneLoader.ImportMeshAsync(
    "",
    "./assets/",
    "rcs.glb",
    scene
  );
    rcsRoot = rcsResult.meshes[0];
    
    // Disable frustum culling on RCS
    rcsResult.meshes.forEach(m => {
      m.alwaysSelectAsActiveMesh = true;
    });
    
    // Load and retarget walking animation
    const rcsSkeleton = rcsResult.skeletons[0];
    const walkAnimResult = await BABYLON.SceneLoader.ImportMeshAsync(
      "",
      "./assets/animations/glb/",
      "Walking.glb",
      scene
    );
    walkAnimResult.meshes.forEach(m => m.isVisible = false);
    const sourceAnimGroup = walkAnimResult.animationGroups[0];
    
    if (rcsSkeleton && sourceAnimGroup) {
      const rcsWalkAnim = new BABYLON.AnimationGroup("rcsWalk", scene);
      
      // Retarget animations - only keep rotations (per agents.md)
      sourceAnimGroup.targetedAnimations.forEach(ta => {
        const prop = ta.animation.targetProperty;
        if (prop === "position" || prop === "scaling") return;
        
        const targetBone = rcsSkeleton.bones.find(b => b.name === ta.target.name);
        if (targetBone) {
          const clonedAnim = ta.animation.clone();
          const transformNode = targetBone.getTransformNode();
          if (transformNode) {
            rcsWalkAnim.addTargetedAnimation(clonedAnim, transformNode);
          }
        }
      });
      
      rcsWalkAnim.start(true, 0.3);
    }
  }
  reportProgress("RCS loaded");
  
  // Initial position (will be updated each frame to follow player)
  rcsRoot.position = new BABYLON.Vector3(rcsDistance, rcsHeightOffset, 0);
  
  // Boss level: Use the GLASSES mesh from the model for hit detection
  let glassesHitbox = null;
  
  if (currentLevel === "boss") {
    if (glassesMesh) {
      // Use the actual GLASSES mesh from the model!
      glassesHitbox = glassesMesh;
      glassesHitbox.isPickable = true;
      
      console.log("Using GLASSES mesh for boss hit detection");
      
      // Store reference for collision detection
      window.glassesHitbox = glassesHitbox;
    } else {
      // Fallback: create a synthetic hitbox if no glasses mesh found
      console.warn("No GLASSES mesh found - creating fallback hitbox sphere");
      glassesHitbox = BABYLON.MeshBuilder.CreateSphere("glassesHitbox", { diameter: 25 }, scene);
      
      const hitboxMat = new BABYLON.StandardMaterial("glassesHitboxMat", scene);
      hitboxMat.diffuseColor = new BABYLON.Color3(1, 0, 0);
      hitboxMat.emissiveColor = new BABYLON.Color3(1, 0, 0);
      hitboxMat.alpha = 0.6;
      glassesHitbox.material = hitboxMat;
      glassesHitbox.isPickable = true;
      
      window.glassesHitbox = glassesHitbox;
    }
  }
  
  // Apply rotation from settings (or default)
  const rot = rcsSettings.rotation || { pitch: -Math.PI / 2, yaw: Math.PI / 2, roll: 0 };
  rcsRoot.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(
    rot.pitch,
    rot.yaw,
    rot.roll
  );
  
  // Apply scale
    rcsRoot.scaling = new BABYLON.Vector3(rcsScale, rcsScale, rcsScale);
  
  // Dramatic spotlight on RCS - settings per level
  const rcsLightSettings = levelRCSLightSettings[currentLevel] || levelRCSLightSettings.canyon;
  const rcsSpotlight = new BABYLON.SpotLight(
    "rcsSpotlight",
    new BABYLON.Vector3(rcsLightSettings.offsetX, rcsLightSettings.offsetY, rcsLightSettings.offsetZ),
    new BABYLON.Vector3(0.796, 0.605, 0.0005), // Direction (will be updated each frame)
    rcsLightSettings.angle,
    rcsLightSettings.exponent,
    scene
  );
  rcsSpotlight.intensity = rcsLightSettings.intensity;
  rcsSpotlight.diffuse = new BABYLON.Color3(rcsLightSettings.color.r, rcsLightSettings.color.g, rcsLightSettings.color.b);
  rcsSpotlight.range = rcsLightSettings.range;

  const projectileManager = new ProjectileManager(scene, currentLevel === "boss");
  const explosionManager = new ExplosionManager(scene, currentLevel === "boss");
  const enemyManager = new EnemyManager(scene);
  enemyManager.explosionManager = explosionManager; // Wire up for explosions on hit
  
  // Boss level: no regular enemies (boss fight instead)
  // Boss health and hit flash system
  let bossHealth = 100;
  const bossMaxHealth = 100;
  let bossHitFlashTime = 0;
  const bossHitFlashDuration = 0.15;
  
  // Boss state (simplified - just alive or dead)
  let bossAlive = true;
  
  // ========== DEBUG HELPERS (paste these in console) ==========
  // Expose debug functions for testing level transitions
  window.debugSkipToEndCanyon = function() {
    if (currentLevel !== "canyon") { console.log("Not in canyon level!"); return; }
    waveTimer = 115; // Near end of 120 second timer
    currentWave = 2; // Final wave
    // Kill most enemies
    while (enemyManager.enemies.length > 2) {
      enemyManager.destroyEnemy(0, explosionManager);
    }
    console.log("⏩ Skipped to end of canyon! Kill remaining enemies to transition.");
  };
  
  window.debugSkipToEndCity = function() {
    if (currentLevel !== "city") { console.log("Not in city level!"); return; }
    if (window.CityLevel) {
      window.CityLevel.debugSkipToCollected(7);
      console.log("⏩ Skipped to 7/8 collected! Find the last collectible to transition.");
    }
  };
  
  window.debugSkipToEndBoss = function() {
    if (currentLevel !== "boss") { console.log("Not in boss level!"); return; }
    bossHealth = 10; // 10% of 100
    const bossHealthBar = document.getElementById('bossHealthBar');
    if (bossHealthBar) bossHealthBar.style.width = '10%';
    console.log("⏩ Boss health set to 10%! A few more hits to win.");
  };
  
  console.log("🎮 Debug commands available:");
  console.log("  debugSkipToEndCanyon() - Skip to final wave");
  console.log("  debugSkipToEndCity() - Skip to 7/8 collected");
  console.log("  debugSkipToEndBoss() - Set boss to 10% health");
  // =============================================================
  
  if (currentLevel === "boss") {
    enemyManager.spawnInterval = 99999; // No enemies in boss
    enemyManager.maxEnemies = 0;
    
    console.log("Boss health:", bossHealth, "/", bossMaxHealth);
    
    // SIMPLIFIED: Just use main model's walking animation - no extra baked animations
    console.log("Boss using main model's walking animation only (simplified)");
    
    // Create xcopy video texture for hit flash effect
    const xcopyHitTexture = new BABYLON.VideoTexture(
      "xcopyHitVideo",
      "./assets/xcopy-skybox.mp4",
      scene,
      true,
      true,
      BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
      { autoPlay: true, loop: true, muted: true }
    );
    xcopyHitTexture.uScale = 2;
    xcopyHitTexture.vScale = 2;
    
    // Create material using xcopy texture
    const xcopyHitMaterial = new BABYLON.StandardMaterial("xcopyHitMat", scene);
    xcopyHitMaterial.emissiveTexture = xcopyHitTexture;
    xcopyHitMaterial.diffuseTexture = xcopyHitTexture;
    xcopyHitMaterial.disableLighting = true;
    
    // Store for hit flash
    window.xcopyHitMaterial = xcopyHitMaterial;
    window.bossOriginalMaterials = new Map();
    
    // Store original material for main model's glasses mesh
    if (glassesMesh && glassesMesh.material) {
      window.bossOriginalMaterials.set(glassesMesh.uniqueId, glassesMesh.material);
      window.mainGlassesMesh = glassesMesh; // Reference for hit flash
    }
    
    // Find arena column/tower meshes and apply xcopy material permanently
    window.arenaColumnMeshes = [];
    if (tiler.arenaRoot) {
      const allArenaMeshes = tiler.arenaRoot.getChildMeshes();
      allArenaMeshes.forEach(m => {
        const name = m.name.toLowerCase();
        // Look for tower, column, pillar meshes
        if (name.includes("tower") || name.includes("column") || name.includes("pillar")) {
          window.arenaColumnMeshes.push(m);
          // Apply xcopy video material permanently (constant flash!)
          m.material = xcopyHitMaterial;
        }
      });
      console.log(`Found ${window.arenaColumnMeshes.length} arena columns - now constantly flashing with xcopy!`);
    }
    
    console.log("Boss ready! (glasses flash on hit, columns always flashing)");
  }
  
  // City level: enemies spawn but less frequently
  if (currentLevel === "city") {
    enemyManager.spawnInterval = 3; // Slower spawning
    enemyManager.maxEnemies = 10; // Fewer enemies
  }
  
  // Canyon mode: enemies spawn from RCS and fan out
  if (currentLevel === "canyon") {
    enemyManager.canyonMode = true;
    enemyManager.rcsPosition = rcsRoot.position; // Reference to RCS position (updates each frame)
  }

  // Pointer lock for immersive FPS experience
  let isPointerLocked = false;
  
  canvas.addEventListener("click", () => {
    if (!isPointerLocked) {
      canvas.requestPointerLock();
    }
  });
  
  document.addEventListener("pointerlockchange", () => {
    isPointerLocked = document.pointerLockElement === canvas;
  });
  
  // Click to shoot (only when pointer is locked)
  canvas.addEventListener("pointerdown", (evt) => {
    if (evt.button === 0 && isPointerLocked) {
      projectileManager.shoot(camera, weapon);
    }
  });

  const moveSpeed = currentLevel === "city" ? 15 : currentLevel === "boss" ? 10 : 6; // City=fast, boss=moderate, canyon=normal
  
  // Ground level depends on the level
  let groundY = 0; // default for forest
  if (currentLevel === "canyon" && tiler.canyonBounds) {
    // Canyon ground is at the min Y of the terrain (or slightly above)
    groundY = tiler.canyonBounds.min.y + 5; // Add a bit of buffer above the floor
    // console.log("Canyon ground level:", groundY);
  } else if (currentLevel === "city" && tiler.cityBounds) {
    // City ground is at street level (must match cityGround.position.y = min.y + 46)
    groundY = tiler.cityBounds.min.y + 46;
  } else if (currentLevel === "boss" && tiler.arenaBounds) {
    // Arena ground level
    groundY = tiler.arenaBounds.min.y + 2;
  }
  const targetY = groundY + playerHeight;
  
  // Set ground level for enemies (so they don't float up when player jumps)
  enemyManager.groundLevel = groundY;

  // FPS counter
  let fpsUpdateCounter = 0;
  
  scene.onBeforeRenderObservable.add(() => {
    // Update FPS counter every 30 frames
    fpsUpdateCounter++;
    if (fpsUpdateCounter >= 30) {
      fpsUpdateCounter = 0;
      const fps = Math.round(engine.getFps());
      const fpsEl = document.getElementById('fpsCounter');
      if (fpsEl) {
        fpsEl.textContent = `${fps} FPS`;
        fpsEl.classList.remove('low', 'medium');
        if (fps < 30) {
          fpsEl.classList.add('low');
        } else if (fps < 50) {
          fpsEl.classList.add('medium');
        }
      }
    }
    
    const dt = scene.getEngine().getDeltaTime() * 0.001;

    // Apply mobile look controls (touch swipe to look around)
    if (window.mobileLookDelta) {
      camera.rotation.y += window.mobileLookDelta.x;
      camera.rotation.x += window.mobileLookDelta.y;
      camera.rotation.x = Math.min(Math.max(camera.rotation.x, minPitch), maxPitch);
      window.mobileLookDelta = null;
    }

    // Shooting via keyboard (z or space)
    if (inputState.shoot) {
      projectileManager.shoot(camera, weapon);
    }

    // Update projectiles
    // Set missile target for boss level (track toward RCS glasses)
    if (currentLevel === "boss" && glassesHitbox) {
      projectileManager.missileTarget = glassesHitbox.absolutePosition.clone();
    }
    projectileManager.update(dt);
    
    // Boss level: Check projectile collision with glasses
    if (currentLevel === "boss" && glassesHitbox && bossHealth > 0) {
      const projectiles = projectileManager.getProjectiles();
      
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const projectile = projectiles[i];
        
        // Check if projectile intersects with glasses mesh
        if (glassesHitbox.intersectsMesh(projectile, true)) {
          // Hit! Damage the boss (5% per hit)
          const damage = 5;
          bossHealth = Math.max(0, bossHealth - damage);
          console.log("🎯 BOSS HIT! Health:", bossHealth, "/", bossMaxHealth);
          
          // Update boss health HUD
          const bossHealthBar = document.getElementById('bossHealthBar');
          if (bossHealthBar) {
            bossHealthBar.style.width = `${(bossHealth / bossMaxHealth) * 100}%`;
          }
          
          // Save projectile position BEFORE removing (dispose invalidates the mesh)
          const hitPosition = projectile.position.clone();
          
          // Remove the projectile
          projectileManager.removeProjectile(projectile);
          
          // Trigger hit flash (apply xcopy texture to GLASSES and COLUMNS!)
          bossHitFlashTime = bossHitFlashDuration;
          
          // Apply xcopy material to GLASSES mesh (columns already constantly flashing)
          if (window.xcopyHitMaterial && window.mainGlassesMesh) {
                window.mainGlassesMesh.material = window.xcopyHitMaterial;
          }
          
          // Create explosion effect at hit location (offset toward camera so it's visible)
          if (explosionManager) {
            // Move explosion toward camera so it renders in front of glasses
            const toCamera = camera.position.subtract(hitPosition).normalize();
            const explosionPos = hitPosition.add(toCamera.scale(5)); // 5 units toward camera
            explosionManager.spawn(explosionPos);
          }
          
          // Check for boss defeat
          if (bossHealth <= 0 && bossAlive) {
            console.log("🏆 BOSS DEFEATED!");
            bossAlive = false;
            
            // APOCALYPTIC EXPLOSION - EVERYWHERE!
            const bossPos = rcsRoot.position.clone();
            const playerPos = camera.position.clone();
            const explosionSize = 100; // MASSIVE!
            
            // Helper to spawn random explosion in view
            const spawnRandomExplosion = (basePos, range, minSize, maxSize) => {
              const offset = new BABYLON.Vector3(
                (Math.random() - 0.5) * range * 2,
                Math.random() * range * 0.8,
                (Math.random() - 0.5) * range * 2
              );
              const size = minSize + Math.random() * (maxSize - minSize);
              explosionManager.spawn(basePos.add(offset), size);
            };
            
            // Initial boss explosion
            explosionManager.spawn(bossPos.clone(), explosionSize);
            explosionManager.spawn(bossPos.add(new BABYLON.Vector3(0, 15, 0)), explosionSize);
            
            // Continuous explosions for 3 seconds!
            let explosionCount = 0;
            const maxExplosions = 80; // Total explosions to spawn
            const explosionInterval = setInterval(() => {
              explosionCount++;
              
              // Spawn 3-5 explosions per tick
              const batchSize = 3 + Math.floor(Math.random() * 3);
              for (let i = 0; i < batchSize; i++) {
                // Random position between player and boss, and all around
                const t = Math.random();
                const baseX = playerPos.x + (bossPos.x - playerPos.x) * t + (Math.random() - 0.5) * 150;
                const baseZ = playerPos.z + (bossPos.z - playerPos.z) * t + (Math.random() - 0.5) * 150;
                const baseY = bossPos.y + Math.random() * 80;
                
                const pos = new BABYLON.Vector3(baseX, baseY, baseZ);
                const size = 40 + Math.random() * 80; // 40-120 size range
                explosionManager.spawn(pos, size);
              }
              
              // Stop after max explosions
              if (explosionCount >= maxExplosions / batchSize) {
                clearInterval(explosionInterval);
              }
            }, 50); // Every 50ms = ~60 explosions over 3 seconds
            
            // Extra big explosions at specific times
            setTimeout(() => {
              explosionManager.spawn(bossPos.add(new BABYLON.Vector3(0, 30, 0)), 150);
              explosionManager.spawn(playerPos.add(new BABYLON.Vector3(30, 20, 30)), 120);
              explosionManager.spawn(playerPos.add(new BABYLON.Vector3(-30, 25, -30)), 120);
            }, 500);
            
            setTimeout(() => {
              explosionManager.spawn(bossPos.add(new BABYLON.Vector3(0, 50, 0)), 180);
              for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const dist = 60;
                explosionManager.spawn(bossPos.add(new BABYLON.Vector3(
                  Math.cos(angle) * dist,
                  30 + Math.random() * 30,
                  Math.sin(angle) * dist
                )), 80 + Math.random() * 40);
              }
            }, 1000);
            
            setTimeout(() => {
              // Ring of explosions around player
              for (let i = 0; i < 12; i++) {
                const angle = (i / 12) * Math.PI * 2;
                const dist = 40 + Math.random() * 30;
                explosionManager.spawn(playerPos.add(new BABYLON.Vector3(
                  Math.cos(angle) * dist,
                  15 + Math.random() * 40,
                  Math.sin(angle) * dist
                )), 60 + Math.random() * 60);
              }
            }, 1500);
            
            setTimeout(() => {
              // Final massive explosion
              explosionManager.spawn(bossPos.add(new BABYLON.Vector3(0, 40, 0)), 200);
              explosionManager.spawn(bossPos.add(new BABYLON.Vector3(0, 60, 0)), 180);
              explosionManager.spawn(bossPos.add(new BABYLON.Vector3(0, 80, 0)), 150);
            }, 2000);
            
            setTimeout(() => {
              // Lingering pops
              for (let i = 0; i < 10; i++) {
                setTimeout(() => {
                  spawnRandomExplosion(bossPos, 100, 30, 70);
                }, i * 100);
              }
            }, 2500);
            
            // Stop the baked walking animation
            if (bakedWalkAnim) {
              bakedWalkAnim.stop();
            }
            
            // Play death animation if available
            if (deathModelRoot && deathAnimation) {
              console.log("Playing death animation...");
              console.log("Walking model position:", rcsRoot.position.toString());
              console.log("Walking model scaling:", rcsRoot.scaling.toString());
              
              // Hide walking model and all its children
              rcsRoot.setEnabled(false);
              rcsResult.meshes.forEach(m => m.setEnabled(false));
              
              // Position death model at same location as walking model
              deathModelRoot.position = rcsRoot.position.clone();
              deathModelRoot.scaling = new BABYLON.Vector3(rcsScale, rcsScale, rcsScale);
              
              // Apply same rotation from settings
              const rot = rcsSettings.rotation || { pitch: 3.14, yaw: 3.14, roll: 3.14 };
              deathModelRoot.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(rot.pitch, rot.yaw, rot.roll);
              
              console.log("Death model position:", deathModelRoot.position.toString());
              console.log("Death model scaling:", deathModelRoot.scaling.toString());
              
              // Show death model and all its children
              deathModelRoot.setEnabled(true);
              deathModelRoot.getChildMeshes().forEach(m => {
                m.setEnabled(true);
                m.isVisible = true;
              });
              
              // Play death animation (not looping)
              deathAnimation.start(false, 1.0); // Play once at normal speed
              
              // Show victory after animation completes
              deathAnimation.onAnimationEndObservable.addOnce(() => {
                console.log("Death animation complete!");
                fadeOutMusic(2000); // Fade music on victory
                setTimeout(() => {
                  showWaveAnnouncement("VICTORY!", "survive");
                  showEndGameStats();
                }, 500);
              });
            } else {
              // Fallback: simple tilt effect if death animation not loaded
              const deathTween = { progress: 0 };
              const deathInterval = setInterval(() => {
                deathTween.progress += 0.02;
                if (deathTween.progress >= 1) {
                  clearInterval(deathInterval);
                }
                const rot = rcsSettings.rotation || { pitch: 3.14, yaw: 3.14, roll: 3.14 };
                rcsRoot.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(
                  rot.pitch + (Math.PI / 2) * deathTween.progress,
                  rot.yaw,
                  rot.roll
                );
              }, 30);
              
              fadeOutMusic(2000); // Fade music on victory
              setTimeout(() => {
                showWaveAnnouncement("VICTORY!", "survive");
                showEndGameStats();
              }, 2000);
            }
          }
        }
      }
    }
    
    // Boss hit flash fade out
    if (currentLevel === "boss" && bossHitFlashTime > 0) {
      bossHitFlashTime -= dt;
      
      if (bossHitFlashTime <= 0) {
        // Flash is over, restore original material on GLASSES (columns stay flashing)
        if (window.bossOriginalMaterials && window.mainGlassesMesh) {
              const originalMat = window.bossOriginalMaterials.get(window.mainGlassesMesh.uniqueId);
              if (originalMat) {
                window.mainGlassesMesh.material = originalMat;
              }
        }
      }
    }
    
    // Boss state is simplified - just walks around (no animation switching)

    // Update enemies (spawning, movement, collision)
    enemyManager.update(dt, camera.position, camera.rotation.y, projectileManager);
    
    // Health regeneration
    if (playerHealth < maxHealth) {
      playerHealth = Math.min(maxHealth, playerHealth + healthRegenRate * dt);
      updateHealthHUD();
    }
    
    // Wave system (canyon level)
    if (currentLevel === "canyon") {
      if (!waveComplete) {
        waveTimer += dt;
        updateWaveTimerHUD();
        
        // Check for wave announcements
        for (let i = 0; i < WAVE_TIMINGS.length; i++) {
          const wave = WAVE_TIMINGS[i];
          if (waveTimer >= wave.start && !announcedWaves.has(i)) {
            announcedWaves.add(i);
            showWaveAnnouncement(wave.name, wave.className);
            currentWave = i;
          }
        }
        
        // Update enemy spawn rate based on wave
        const waveIndex = getCurrentWaveIndex();
        enemyManager.spawnInterval = 1 / (WAVE_SPAWN_RATES[waveIndex] || 0.5);
        
        // Check if waves are complete
        if (waveTimer >= WAVE_DURATION) {
          waveComplete = true;
          enemyManager.spawnInterval = 9999; // Stop spawning
          showEnemiesRemainingHUD(true);
        }
      } else if (!levelTransitioning) {
        // Waves done, update remaining enemies HUD
        updateEnemiesRemainingHUD(enemyManager.enemies.length);
        
        if (enemyManager.enemies.length === 0) {
          showEnemiesRemainingHUD(false);
          levelTransitioning = true;
          transitionToCity();
        }
      }
    }
    
    // Update explosions
    explosionManager.update(dt);
    
    // Update city level gameplay (collectibles, lasers, progression)
    if (currentLevel === "city" && window.CityLevel) {
      window.CityLevel.update(dt, camera, scene);
    }
    
    // Update radar HUD
    updateRadar(camera.position, camera.rotation.y, enemyManager.getEnemies());

    // movement on ground plane (XZ)
    const forward = camera.getDirection(BABYLON.Axis.Z);
    const right = camera.getDirection(BABYLON.Axis.X);
    forward.y = 0;
    right.y = 0;
    forward.normalize();
    right.normalize();

    let move = new BABYLON.Vector3(0, 0, 0);
    if (inputState.forward) move = move.add(forward);
    if (inputState.back) move = move.subtract(forward);
    if (inputState.left) move = move.subtract(right);
    if (inputState.right) move = move.add(right);
    if (move.lengthSquared() > 0) {
      move = move.normalize().scale(moveSpeed * dt);
      
      // City level: Check for building collision before moving
      if (currentLevel === "city") {
        const rayOrigin = camera.position.clone();
        rayOrigin.y = camera.position.y - 0.5; // Ray from body height
        const rayDir = move.clone().normalize();
        const ray = new BABYLON.Ray(rayOrigin, rayDir, 2); // Check 2 units ahead
        
        const hit = scene.pickWithRay(ray, (mesh) => {
          // Only collide with city buildings, not ground/skybox/etc
          return mesh.name !== "cityGround" && 
                 mesh.name !== "citySkybox" && 
                 mesh.name !== "weapon" && 
                 mesh.name !== "projectile" &&
                 mesh.name !== "skyDome" &&
                 !mesh.name.startsWith("grifter") &&
                 !mesh.name.startsWith("rcs") &&
                 !mesh.name.startsWith("__root__");
        });
        
        if (hit && hit.hit && hit.distance < 1.5) {
          // Blocked by building - don't move in this direction
          move.scaleInPlace(0);
        }
      }
      
      camera.position.addInPlace(move);
    }

    // Find ground level using raycast (allows landing on buildings/terrain)
    let currentGroundY = groundY;
    
    if (currentLevel === "canyon" || currentLevel === "city" || currentLevel === "boss") {
      // Raycast downward to find ground/building surface
      const rayOrigin = new BABYLON.Vector3(camera.position.x, camera.position.y + 100, camera.position.z);
      const rayDirection = new BABYLON.Vector3(0, -1, 0);
      const ray = new BABYLON.Ray(rayOrigin, rayDirection, 500);
      
      const hit = scene.pickWithRay(ray, (mesh) => {
        // Pick terrain and buildings, not weapons/enemies/etc
        return mesh.name !== "weapon" && 
               mesh.name !== "projectile" && 
               mesh.name !== "citySkybox" &&
               mesh.name !== "skyDome" &&
               !mesh.name.startsWith("grifter") &&
               !mesh.name.startsWith("rcs") &&
               !mesh.name.startsWith("explosion");
      });
      
      if (hit && hit.hit && hit.pickedPoint) {
        currentGroundY = hit.pickedPoint.y;
      }
    }
    
    const currentTargetY = currentGroundY + playerHeight;
    
    // Jump physics
    const onGround = camera.position.y <= currentTargetY + 0.1;
    
    // Track if jump key was released (prevents instant multi-jump from holding)
    if (!inputState.jump) {
      jumpKeyWasReleased = true;
    }
    
    if (inputState.jump && jumpKeyWasReleased) {
      if (onGround) {
        // First jump from ground
        playerVelocityY = jumpForce;
        jumpKeyWasReleased = false;
        jumpsRemaining = maxJumps - 1; // Can do 3 more jumps in air
      } else if (jumpsRemaining > 0) {
        // Multi-jump in mid-air
        // Each subsequent jump is slightly weaker
        const jumpMultiplier = 0.7 + (jumpsRemaining / maxJumps) * 0.3;
        playerVelocityY = jumpForce * jumpMultiplier;
        jumpsRemaining--;
        jumpKeyWasReleased = false;
      }
    }
    
    // Apply gravity
    playerVelocityY -= gravity * dt;
    camera.position.y += playerVelocityY * dt;
    
    // Don't go below ground
    if (camera.position.y < currentTargetY) {
      camera.position.y = currentTargetY;
      playerVelocityY = 0;
      jumpsRemaining = 0; // Reset jumps when landing
    }
    
    // Respawn if player falls off the edge (below death threshold)
    if (camera.position.y < fallDeathThreshold) {
      console.log("Player fell off edge! Respawning...");
      camera.position.x = spawnPosition.x;
      camera.position.y = spawnPosition.y;
      camera.position.z = spawnPosition.z;
      playerVelocityY = 0;
      jumpsRemaining = maxJumps;
      
      // Take some damage for falling (but don't kill the player)
      const fallDamage = 20;
      playerHealth = Math.max(1, playerHealth - fallDamage);
      updateHealthHUD();
      
      // Flash the screen red
      const hitFlash = document.getElementById('hitFlash');
      if (hitFlash) {
        hitFlash.classList.add('active');
        setTimeout(() => hitFlash.classList.remove('active'), 200);
      }
    }

    tiler.update(camera.position);

    // RCS movement - different behavior per level
    if (currentLevel === "city" || currentLevel === "boss") {
      // City/Boss: RCS follows the player
      // Boss uses configured walk speed
      const walkSpeed = rcsSettings.walkSpeed || 5;
      const minDistance = currentLevel === "boss" ? 8 : 15;  // Boss gets closer!
      
      // Calculate direction to player
      const dx = camera.position.x - rcsRoot.position.x;
      const dz = camera.position.z - rcsRoot.position.z;
      const distToPlayer = Math.sqrt(dx * dx + dz * dz);
      
      // Initialize steering state if needed (PERF: includes raycast throttling)
      if (!rcsRoot.steerState) {
        rcsRoot.steerState = { 
          steerAngle: 0, 
          steerTime: 0, 
          raycastFrame: 0,
          cachedBuildingAhead: false 
        };
      }
      
      // Only move if player is beyond min distance
      if (distToPlayer > minDistance) {
        // Base direction toward player
        let dirX = dx / distToPlayer;
        let dirZ = dz / distToPlayer;
        
        // Throttle building raycasts - only check every 8 frames (PERF)
        rcsRoot.steerState.raycastFrame = (rcsRoot.steerState.raycastFrame + 1) % 8;
        
        if (rcsRoot.steerState.raycastFrame === 0) {
          // Check for building collision ahead
          const rcsRayOrigin = rcsRoot.position.clone();
          rcsRayOrigin.y = rcsRoot.position.y + 2; // Ray from RCS body height
          const rcsRayDir = new BABYLON.Vector3(dirX, 0, dirZ);
          const checkDistance = 8; // Look ahead distance
          const rcsRay = new BABYLON.Ray(rcsRayOrigin, rcsRayDir, checkDistance);
          
          const rcsHit = scene.pickWithRay(rcsRay, (mesh) => {
            return mesh.name !== "cityGround" && 
                   mesh.name !== "citySkybox" && 
                   mesh.name !== "weapon" && 
                   mesh.name !== "projectile" &&
                   mesh.name !== "skyDome" &&
                   !mesh.name.startsWith("grifter") &&
                   !mesh.name.startsWith("rcs") &&
                   !mesh.name.startsWith("__root__");
          });
          
          rcsRoot.steerState.cachedBuildingAhead = rcsHit && rcsHit.hit && rcsHit.distance < checkDistance;
          
          if (rcsRoot.steerState.cachedBuildingAhead && rcsRoot.steerState.steerTime <= 0) {
            // Building ahead! Check left and right to decide steering
            const leftDir = new BABYLON.Vector3(-dirZ, 0, dirX);
            const rightDir = new BABYLON.Vector3(dirZ, 0, -dirX);
            
            const leftRay = new BABYLON.Ray(rcsRayOrigin, leftDir, checkDistance);
            const rightRay = new BABYLON.Ray(rcsRayOrigin, rightDir, checkDistance);
            
            const leftHit = scene.pickWithRay(leftRay, (mesh) => {
              return mesh.name !== "cityGround" && mesh.name !== "citySkybox" && 
                     !mesh.name.startsWith("rcs") && !mesh.name.startsWith("__root__");
            });
            const rightHit = scene.pickWithRay(rightRay, (mesh) => {
              return mesh.name !== "cityGround" && mesh.name !== "citySkybox" && 
                     !mesh.name.startsWith("rcs") && !mesh.name.startsWith("__root__");
            });
            
            const leftClear = !leftHit || !leftHit.hit ? checkDistance : leftHit.distance;
            const rightClear = !rightHit || !rightHit.hit ? checkDistance : rightHit.distance;
            
            // Steer toward clearer side
            rcsRoot.steerState.steerAngle = leftClear > rightClear ? Math.PI / 3 : -Math.PI / 3;
            rcsRoot.steerState.steerTime = 1.0; // Steer for 1 second
          }
        }
        
        // Apply cached steering decision (runs every frame for smooth movement)
        if (rcsRoot.steerState.cachedBuildingAhead && rcsRoot.steerState.steerTime > 0) {
          const steerCos = Math.cos(rcsRoot.steerState.steerAngle);
          const steerSin = Math.sin(rcsRoot.steerState.steerAngle);
          const newDirX = dirX * steerCos - dirZ * steerSin;
          const newDirZ = dirX * steerSin + dirZ * steerCos;
          dirX = newDirX;
          dirZ = newDirZ;
          rcsRoot.steerState.steerTime -= dt;
        } else if (!rcsRoot.steerState.cachedBuildingAhead) {
          // Clear ahead, reduce steer time
          rcsRoot.steerState.steerTime = Math.max(0, rcsRoot.steerState.steerTime - dt * 2);
        }
        
        // Move toward player (slower when closer, faster when far)
        const speedMultiplier = Math.min(1, (distToPlayer - minDistance) / 20);
        const moveX = dirX * walkSpeed * speedMultiplier * dt;
        const moveZ = dirZ * walkSpeed * speedMultiplier * dt;
        
        rcsRoot.position.x += moveX;
        rcsRoot.position.z += moveZ;
      }
        
      // Always face the direction of movement (or player if not moving much)
      const targetAngle = Math.atan2(dx, dz);
      const rot = rcsSettings.rotation || { pitch: 3.14, yaw: 3.14, roll: 3.14 };
        
      rcsRoot.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(
        rot.pitch,
        rot.yaw + targetAngle, // Face toward player
        rot.roll
      );
      
      // Keep at ground level (different per level)
      if (currentLevel === "boss" && tiler.arenaBounds) {
        rcsRoot.position.y = tiler.arenaBounds.min.y + 2 + rcsHeightOffset;
      } else {
        rcsRoot.position.y = (tiler.cityBounds?.min.y || 0) + 45 + rcsHeightOffset;
      }
    } else {
      // Other levels: Keep RCS fixed on horizon in +X direction
      // Use debug values if debug mode is on
      const useDistance = window.debug_options.rcsDebugMode ? rcsDebugState.distance : rcsDistance;
      const useHeight = window.debug_options.rcsDebugMode ? rcsDebugState.heightOffset : rcsHeightOffset;
      const useScale = window.debug_options.rcsDebugMode ? rcsDebugState.scale : rcsScale;
      
      rcsRoot.position.x = camera.position.x + useDistance;
      rcsRoot.position.z = camera.position.z;
      rcsRoot.position.y = useHeight;
      
      // Apply debug scale and rotation
      if (window.debug_options.rcsDebugMode) {
        rcsRoot.scaling = new BABYLON.Vector3(useScale, useScale, useScale);
        rcsRoot.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(
          rcsDebugState.pitch,
          rcsDebugState.yaw,
          rcsDebugState.roll
        );
      }
    }
    
    // Boss level: Glasses hitbox
    // If we're using the actual GLASSES mesh from the model, it animates automatically
    // Only need to manually position if we created a fallback synthetic hitbox
    if (currentLevel === "boss" && glassesHitbox && !glassesMesh) {
      // Fallback hitbox needs manual positioning (no glasses mesh in model)
      const fallbackHeadHeight = 25 * rcsScale;
      glassesHitbox.position.x = rcsRoot.position.x;
      glassesHitbox.position.y = rcsRoot.position.y + fallbackHeadHeight;
      glassesHitbox.position.z = rcsRoot.position.z;
    }
    
    // Player light follows camera
    playerLight.position.copyFrom(camera.position);
    
    // RCS spotlight positioned between player and RCS (per-level offsets)
    // Use debug values if debug mode is on
    const useOffsetX = window.debug_options.rcsDebugMode ? rcsLightDebugState.offsetX : rcsLightSettings.offsetX;
    const useOffsetY = window.debug_options.rcsDebugMode ? rcsLightDebugState.offsetY : rcsLightSettings.offsetY;
    const useOffsetZ = rcsLightSettings.offsetZ; // Not adjustable in debug for now
    
    rcsSpotlight.position.x = camera.position.x + useOffsetX;
    rcsSpotlight.position.z = camera.position.z + useOffsetZ;
    rcsSpotlight.position.y = useOffsetY;
    
    // Apply debug intensity, range, and angle
    if (window.debug_options.rcsDebugMode) {
      rcsSpotlight.intensity = rcsLightDebugState.intensity;
      rcsSpotlight.range = rcsLightDebugState.range;
      rcsSpotlight.angle = rcsLightDebugState.angle;
    }
    
    // Direction should point toward RCS (recalculate each frame to always aim at him)
    const toRCS = rcsRoot.position.subtract(rcsSpotlight.position);
    toRCS.normalize();
    rcsSpotlight.direction = toRCS;
    
    
    // Debug camera movement and spotlight update
    if (debug_options.lightDebugMode && debugCamera && debugSpotlight) {
      const debugMoveSpeed = 30; // Faster for flying around
      const debugForward = debugCamera.getDirection(BABYLON.Axis.Z);
      const debugRight = debugCamera.getDirection(BABYLON.Axis.X);
      
      let debugMove = new BABYLON.Vector3(0, 0, 0);
      if (debugInputState.forward) debugMove.addInPlace(debugForward);
      if (debugInputState.back) debugMove.subtractInPlace(debugForward);
      if (debugInputState.left) debugMove.subtractInPlace(debugRight);
      if (debugInputState.right) debugMove.addInPlace(debugRight);
      if (debugInputState.up) debugMove.y += 1;
      if (debugInputState.down) debugMove.y -= 1;
      
      if (debugMove.lengthSquared() > 0) {
        debugMove.normalize().scaleInPlace(debugMoveSpeed * dt);
        debugCamera.position.addInPlace(debugMove);
      }
      
      // Spotlight follows debug camera position and direction
      debugSpotlight.position.copyFrom(debugCamera.position);
      debugSpotlight.direction = debugCamera.getDirection(BABYLON.Axis.Z);
      
      // Debug cam light also follows
      const debugCamLight = scene.getLightByName("debugCamLight");
      if (debugCamLight) {
        debugCamLight.position.copyFrom(debugCamera.position);
      }
      
      // Print spotlight values when P is pressed
      if (window.printDebugSpotlight) {
        window.printDebugSpotlight = false;
        console.log("=== DEBUG SPOTLIGHT VALUES ===");
        console.log("Position:", debugSpotlight.position.toString());
        console.log("Direction:", debugSpotlight.direction.toString());
        console.log("Intensity:", debugSpotlight.intensity);
        console.log("Range:", debugSpotlight.range);
        console.log("Angle:", debugSpotlight.angle);
        console.log("==============================");
      }
    }
  });

  // Debug: log player position every second
  let lastLogTime = 0;
  scene.onAfterRenderObservable.add(() => {
    if (!debug_options.logPlayerPosition) return;
    const now = performance.now();
    if (now - lastLogTime > 1000) {
      lastLogTime = now;
      const pos = camera.position;
      const rot = camera.rotation;
      const yawDeg = (rot.y * 180 / Math.PI).toFixed(1);
      console.log(`Player: X=${pos.x.toFixed(2)}, Z=${pos.z.toFixed(2)}, Yaw=${yawDeg}°`);
    }
  });

  // Final loading complete
  reportProgress("Enemies ready");
  reportProgress("HUD ready");
  reportProgress("Game ready", true); // Force 100% complete
  
  // Show level instruction popup (after a short delay for game to start)
  setTimeout(() => {
    const instructionEl = document.getElementById("levelInstruction");
    const instructionText = document.getElementById("levelInstructionText");
    
    if (instructionEl && instructionText) {
      if (currentLevel === "city") {
        instructionText.textContent = "COLLECT ART";
        instructionText.classList.remove("boss");
        instructionEl.classList.add("visible");
      } else if (currentLevel === "boss") {
        instructionText.textContent = "RIGHT CLICK SAVE KILL";
        instructionText.classList.add("boss");
        instructionEl.classList.add("visible");
      }
      
      // Fade out after 3 seconds
      if (currentLevel === "city" || currentLevel === "boss") {
        setTimeout(() => {
          instructionEl.classList.add("fadeOut");
          setTimeout(() => {
            instructionEl.classList.remove("visible", "fadeOut");
          }, 500);
        }, 3000);
      }
    }
  }, 500);
  
  return scene;
}

createScene()
  .then((scene) => {
    engine.runRenderLoop(() => scene.render());
    
    // Initialize HUD
    updateHealthHUD();
    updateKillHUD();
    
    // Show/hide level-specific HUD elements
    if (currentLevel === "city") {
      // City level: show collection counter, hide kill counter, wave timer, and radar
      const killCounter = document.getElementById('killCounter');
      const waveTimer = document.getElementById('waveTimer');
      const collectCounter = document.getElementById('collectCounter');
      const debugPanel = document.getElementById('collectionDebug');
      const radar = document.getElementById('radar');
      if (killCounter) killCounter.style.display = 'none';
      if (waveTimer) waveTimer.style.display = 'none';
      if (collectCounter) collectCounter.style.display = 'block';
      if (debugPanel) debugPanel.style.display = 'block';
      if (radar) radar.style.display = 'none';
    } else if (currentLevel === "boss") {
      // Boss level: show boss health bar, hide everything else
      const killCounter = document.getElementById('killCounter');
      const waveTimer = document.getElementById('waveTimer');
      const collectCounter = document.getElementById('collectCounter');
      const bossHealthContainer = document.getElementById('bossHealthContainer');
      if (killCounter) killCounter.style.display = 'none';
      if (waveTimer) waveTimer.style.display = 'none';
      if (collectCounter) collectCounter.style.display = 'none';
      if (bossHealthContainer) bossHealthContainer.style.display = 'block';
    } else {
      // Canyon level: show kill counter and wave timer
      const killCounter = document.getElementById('killCounter');
      const waveTimer = document.getElementById('waveTimer');
      if (killCounter) killCounter.style.display = 'block';
      if (waveTimer) waveTimer.style.display = 'block';
      updateWaveTimerHUD();
    }
    
    // Hide loading screen
    const loadingScreen = document.getElementById("loadingScreen");
    if (loadingScreen) {
      loadingScreen.classList.add("hidden");
      // Remove from DOM after fade out
      setTimeout(() => loadingScreen.remove(), 500);
    }
  })
  .catch((err) => console.error(err));

window.addEventListener("resize", () => {
  engine.resize();
});

window.addEventListener("unload", () => {
  toDispose.forEach((d) => d.dispose?.());
  window.removeEventListener("message", mannCoolListener);
});


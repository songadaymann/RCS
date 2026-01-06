# RCS Shooter - Progress Log

## Overview
First-person shooter where the player survives waves of "Grifter" NFT enemies in a canyon, then collects XCOPY art pieces across a glitchy city while a giant RCS kaiju stalks the streets. Features 3D cursor projectiles, health regeneration, wave-based survival, and progressive building unlocks. Built with Babylon.js.

---

## Completed Features

### 1. Multi-Level Support
- **Canyon Level**: 2-minute wave survival with 13 instanced canyon segments
- **City Level**: Low-poly city with XCOPY-textured buildings, RCS walks the streets
- **Boss Level**: Arena-based boss fight (in progress)
- Per-level configuration at top of `game.js`:
  - `levelRCSSettings` - RCS scale, distance, height, walkSpeed per level
  - `levelLightSettings` - Player light intensity, range, color per level
  - `levelRCSLightSettings` - RCS spotlight settings per level
- Game flow: Title Screen → Canyon (survive 2 min) → City (collect 8 artworks) → Boss

### 2. Player Controls
- **WASD / Arrow keys** for movement
- **Mouse movement** for look (with pointer lock)
- **Click** to lock cursor (ESC to unlock) - immersive FPS mode
- **Z or Click** to shoot (only when pointer locked)
- **Space / Shift** to jump
- Raycast collision for bumpy canyon terrain
- Player starts facing +90° (along the path)

### 3. Weapon - NES Zapper
- **3D Model**: `nesZapper.glb` loaded and attached to camera
- Position: lower-right of view, pointing forward
- Replaced original gray box placeholder

### 4. Projectiles (3D Cursor)
- **3D cursor model** (`cursor.glb`) cloned for each shot
- Scale: 0.0003 (user-tuned for visibility)
- Uses mesh cloning for performance (materials require clone vs instance)
- **Glow effect** using Babylon.js GlowLayer
- Fly at 40 units/second, despawn after 100 units

### 5. Enemies (Grifters)
- **100 grifter PNG images** loaded from `assets/grifters/` (003-102)
- Billboard planes that face the player
- **Canyon mode**: Enemies spawn FROM RCS position and fan out toward player
- **Forest mode**: Spawn in front cone as before
- Track player Y-level on variable terrain
- Destroyed when hit by projectile

### 6. Explosion Effects
- **5-frame explosion animation** (`explosion-0.png` to `explosion-4.png`)
- Plays at enemy position when hit by projectile
- Billboard mode, 80ms per frame

### 7. Radar HUD
- Mini-radar in bottom-left corner
- Green dot = player, green line = facing direction
- Red dots = enemy positions
- Rotates with player view
- **Optimized**: Uses pooled DOM elements (no create/destroy per frame)

### 8. RCS Kaiju Character
- **Model**: `RCS-walking.glb` with baked animation (all levels now use baked model)
- **Per-level scaling**: Canyon scale ~0.018, City scale 0.015
- **Per-level rotation**: Different Euler angles per level
- **Per-level spotlight**: Intensity, range, color, position all configurable
- Walking animation plays at 0.3 speed for kaiju scale
- Canyon: Stays fixed distance ahead of player on horizon
- City/Boss: Follows player with building avoidance AI

### 9. Skybox
- **Canyon**: Animated `xcopy-skybox.mp4` video texture on sphere
- **City**: `city-skybox.glb` 3D model, self-illuminated, follows camera

### 10. Title Screen
- Black background with `8.mp4` video loop
- "Right Click Save KILL" title (KILL in red)
- "click or tap to start" prompt
- Fades out and starts canyon level

### 11. Health & Combat HUD
- **Health bar**: Red gradient, top-right corner
- **Health text**: Current/max display
- **Hit vignette**: Red screen flash on damage
- **Health regeneration**: 1 HP/second

### 12. Wave Survival HUD (Canyon)
- **Wave announcements**: "SURVIVE", "FIRST WAVE", "SECOND WAVE", "FINAL WAVE"
- **Countdown timer**: MM:SS format, top-right (shows "CLEAR!" when done)
- **Kill counter**: Running total of enemies killed
- **Enemies remaining**: Red pulsing HUD after timer completes, shows count + "DESTROY REMAINING ENEMIES!"

### 13. Loading Screen
- "LOADING..." text with blinking animation
- Fades out once scene loads

---

## Technical Notes

### Babylon.js CDN
```html
<script src="https://cdn.babylonjs.com/babylon.js"></script>
<script src="https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js"></script>
```

### GLB Model Rotation Issue (Meshy → Mixamo → Babylon Pipeline)
- Models from this pipeline have baked-in negative Z scale (`z: -1`)
- When applying custom scaling, must account for this or model flips
- Solution: Use debug rotation panel to find correct Euler angles per level

### Canyon Terrain
- 13 segments placed end-to-end
- Visibility culling: only 9 segments in each direction rendered
- Raycast collision for player height on bumpy terrain
- Scale: 50x

### Per-Level Configuration Pattern
```javascript
const levelRCSSettings = {
  canyon: { 
    scale: 0.018446744073709574,
    distance: 160,
    heightOffset: -6,
    rotation: { pitch: 3.14, yaw: 1.54, roll: 3.14 },
    useBakedModel: true,
  },
  city: { scale: 0.015, distance: 20, heightOffset: 0, walkSpeed: 5 },
  boss: { scale: 0.025, distance: 30, heightOffset: 0, walkSpeed: 8 },
};
```

---

## Debug Options
Located at top of `game.js`:
```javascript
const debug_options = {
  showTileBounds: false,
  logTileMoves: false,
  logPlayerPosition: false,
  lightDebugMode: false,  // Split-screen light debugging
  rcsDebugMode: false,    // RCS positioning debug controls
};
```

### RCS Debug Controls (when rcsDebugMode = true)
| Key | Action |
|-----|--------|
| 1/2 | Scale up/down |
| 3/4 | Distance up/down |
| 5/6 | Height up/down |
| 7/8 | Pitch rotation |
| 9/0 | Yaw rotation |
| -/= | Roll rotation |
| Q/E | Spotlight intensity |
| R/T | Spotlight range |
| Y/H | Spotlight offsetX |
| G/B | Spotlight offsetY |
| N/M | Spotlight angle |
| P | Print all values (copy to config) |

### FPS Counter
- Real-time FPS display in top-left corner
- Monospace font with semi-transparent background
- Updates every frame

### Collection Debug (City Level)
- Slider in bottom-left to skip to any collection state (0-8)
- "Apply" button triggers `CityLevel.debugSkipToCollected()`
- Great for testing video texture progression

---

## File Structure
```
RCS/
├── index.html              # Main HTML with title screen, HUD, debug panel
├── rcs-debug.html          # Standalone RCS model debug tool
├── bake-animations.py      # Headless Blender script for baking Mixamo anims
├── src/
│   ├── game.js             # Core game logic (~2850 lines)
│   └── levels/
│       └── city.js         # City level module (collectibles, lasers, progression)
├── assets/
│   ├── white_canyon_terrain_optimized.glb  # Optimized canyon (3.1MB)
│   ├── lowPolyCity_optimized.glb           # Optimized city (3.4MB)
│   ├── arena_optimized.glb                 # Optimized boss arena (2.6MB)
│   ├── city-skybox.glb     # 3D skybox for city level
│   ├── cursor.glb          # 3D cursor projectile
│   ├── rcs.glb             # RCS character (original, unused now)
│   ├── RCS-walking.glb     # RCS with baked walking animation
│   ├── RCS-walking-separated.glb  # RCS with glasses as separate mesh (boss level)
│   ├── nesZapper.glb       # NES Zapper weapon model
│   ├── grifters/           # 100 grifter PNG images (003-102)
│   ├── explosion/          # Explosion animation frames (0-4)
│   ├── collectibles/       # XCOPY art video files (1.mp4 - 8.mp4)
│   ├── xcopy-skybox.mp4    # Animated skybox video (building glitch + hit flash)
│   └── animations/
│       ├── glb/            # Original Mixamo animations (Walking.glb, etc.)
│       └── baked/          # Baked animations for RCS model
│           ├── RCS-walk.glb
│           ├── RCS-run.glb
│           ├── RCS-punch.glb
│           ├── RCS-kick.glb
│           └── RCS-hit.glb
├── human-materials-ignore/ # Unused assets, originals, reference images
│   └── unused-animations/  # Mixamo FBX files for baking
├── RCSShooter.md           # Game design doc
└── RCSShooter-progress.md  # This file
```

---

## Next Steps
- [x] **City Level** - ✅ Implemented!
- [x] **RCS Baked Animation** - ✅ Fixed pivot issues with baked model
- [x] **RCS Stalker AI** - ✅ Follows player, avoids buildings
- [x] **Multi-Jump** - ✅ Quad jump in city level
- [x] **Land on Buildings** - ✅ Raycast-based ground detection
- [x] **City Level Redesign** - ✅ Collection-based gameplay with progressive building unlocks
- [x] **Collectibles System** - ✅ XCOPY art pieces on rooftops with video textures
- [x] **Laser System** - ✅ Beamos-style spinning laser beams
- [x] **Enemy Ground Following** - ✅ Grifters raycast to ground, don't float with player
- [x] **Title Screen** - ✅ Video + text, click to start
- [x] **Health System** - ✅ Health bar, regeneration, damage feedback
- [x] **Wave Survival Mode** - ✅ 2-minute canyon survival with 3 waves
- [x] **Level Transitions** - ✅ Canyon → City progression with sessionStorage
- [x] **3D Cursor Projectile** - ✅ cursor.glb with cloning
- [x] **Asset Optimization** - ✅ Canyon 79MB→3MB, City 55MB→3MB
- [x] **FPS Optimization** - ✅ Throttled raycasts, pooled DOM elements
- [x] **Boss Level Arena** - ✅ Arena loaded, RCS follows player
- [x] **Glasses Hitbox** - ✅ Separated in Blender, projectile collision works
- [x] **Boss Health System** - ✅ Damage on glasses hit, health bar HUD
- [x] **Boss Animation System** - ✅ Baked Mixamo animations via Blender script
- [x] **XCOPY Hit Flash** - ✅ Video texture flash effect on damage
- [ ] **Boss Death Animation** - Re-download from Mixamo with armature
- [ ] **Boss Attack Patterns** - Player takes damage from boss attacks
- [ ] **Victory Condition** - Win screen after defeating boss
- [ ] Sound effects
- [ ] Mobile touch controls
- [ ] mann.cool integration

---

## Session Summary (Latest)

### Session 10 - Boss Fight Implementation: Glasses Hitbox, Health, Animations & Effects

Major session implementing core boss fight mechanics:

#### 1. Glasses Hitbox via Blender Separation
- **Problem**: RCS model was one big mesh, couldn't target glasses specifically
- **Solution**: Separated glasses as own mesh in Blender
- Exported as `RCS-walking-separated.glb` with mesh named "GLASSES"
- Game now finds the GLASSES mesh and uses it directly as hitbox
- No more synthetic hitbox spheres needed!

**Blender Steps Performed:**
1. Imported `RCS-walking.glb` into Blender
2. In Edit Mode, selected glasses polygons
3. Pressed `P` → "Selection" to separate into new mesh
4. Renamed mesh to "GLASSES" in Outliner
5. Exported as GLB with armature included
6. Fixed viewport clipping (View → Clip Start: 0.01m, Clip End: 10000m)

#### 2. Boss Health System
- Boss starts with 100 HP (`bossMaxHealth = 100`)
- Each glasses hit deals 1 damage
- Health bar updates in real-time (bottom of screen)
- When health reaches 0, boss enters "dead" state

#### 3. Animation Baking System
- **Problem**: Runtime animation retargeting caused "tangled" model
- **Solution**: Created Python script to bake animations directly in Blender
- Script: `bake-animations.py` (headless Blender automation)
- Bakes Mixamo FBX animations onto the RCS model
- Outputs to `assets/animations/baked/RCS-[action].glb`

**Baked Animations:**
- `RCS-walk.glb` - Walking animation
- `RCS-run.glb` - Running animation
- `RCS-punch.glb` - Punch attack
- `RCS-kick.glb` - Kick attack
- `RCS-hit.glb` - Taking damage
- `RCS-die.glb` - Death animation (pending Mixamo re-download)

**Animation System Implementation:**
```javascript
const bossAnimations = {};
const BOSS_ANIMS = ['walk', 'run', 'punch', 'kick', 'hit', 'die'];

// Load each baked animation GLB
for (const anim of BOSS_ANIMS) {
  const result = await BABYLON.SceneLoader.ImportMeshAsync(
    "", "assets/animations/baked/", `RCS-${anim}.glb`, scene
  );
  // Store mesh and animation group...
}
```

#### 4. Boss State Machine
States: `walking`, `running`, `attacking`, `dead`
- **Walking**: When far from player (>20 units), slow approach
- **Running**: When medium distance (10-20 units), fast approach
- **Attacking**: When close (<10 units), punch/kick animations
- **Dead**: When health depleted, death animation + tilt effect

#### 5. XCOPY Video Texture Hit Flash
- **Effect**: When boss is hit, flashes with `xcopy-skybox.mp4` video texture
- Creates `VideoTexture` from the animated skybox video
- Applies video material to all RCS meshes momentarily
- Restores original materials after flash duration (150ms)

```javascript
// Initialize video texture for hit flash
xcopyVideoTexture = new BABYLON.VideoTexture(
  "xcopyHitFlash", "assets/xcopy-skybox.mp4", scene, false, true
);
xcopyMaterial = new BABYLON.StandardMaterial("xcopyHitMat", scene);
xcopyMaterial.emissiveTexture = xcopyVideoTexture;
xcopyMaterial.disableLighting = true;
```

#### 6. Boss Movement Tuning
- Reduced `walkSpeed` from 4 to 1.5 for slower, menacing approach
- Separate `runSpeed` for when boss charges at player
- Movement speed dynamically changes based on boss state

#### 7. Debug Logging
- Added animation state change logging to `playBossAnimation()`
- Logs when animations are started for debugging

**New Files:**
- `bake-animations.py` - Headless Blender script for animation baking
- `assets/animations/baked/RCS-*.glb` - Baked animation files

**Modified Files:**
- `src/game.js` - Boss fight mechanics, animation system, hit flash (~2850 lines)

**Key Boss Settings:**
```javascript
levelRCSSettings.boss = {
  scale: 0.025,
  distance: 30,
  heightOffset: 15,
  walkSpeed: 1.5,  // Slower, menacing pace
  runSpeed: 4,     // Faster when charging
  rotation: { pitch: 3.14, yaw: 3.14, roll: 3.14 },
  useBakedModel: true,
};
```

**Pending:**
- [ ] Re-download dying animation from Mixamo (FBX Binary, "With Skin" option)
- [ ] Bake and integrate death animation
- [ ] Add attack patterns and damage to player
- [ ] Victory condition

---

### Session 9 - Boss Level Scaffolding & Arena Setup

Major session setting up the boss level infrastructure:

#### 1. Arena Model Optimization
- **Original**: `arena.glb` at 22.88 MB
- **Optimized**: `arena_optimized.glb` at 2.64 MB (88% reduction!)
- Used `gltf-transform` with draco compression and webp textures
- Arena has 47 individual meshes (walls, floors, stairs, towers, props)

#### 2. Boss Level Configuration
- Added `boss` settings to all per-level config objects:
  - `levelRCSSettings.boss` - scale 0.025, walkSpeed 4 (slower/menacing)
  - `levelLightSettings.boss` - dim red lighting for spooky atmosphere
  - `levelRCSLightSettings.boss` - dramatic red spotlight
- Boss level uses super jump (same as city) for mobility

#### 3. Arena Loading
- Arena scale: 0.01 (model was in centimeters, needed conversion to meters)
- Player spawns in center of arena
- Raycast ground detection enabled for arena terrain
- RCS follows player aggressively (minDistance: 8 vs city's 15)

#### 4. City → Boss Transition
- City level now transitions to boss level after collecting all 8 items
- Shows "LEVEL COMPLETE" announcement, then loads boss level via sessionStorage

#### 5. Boss Health Bar HUD
- Added `#bossHealthContainer` with red gradient health bar
- Positioned at bottom of screen, labeled "RCS"
- Hidden by default, shown only in boss level

#### 6. Glasses Hitbox (Work in Progress)
- Created visible red sphere hitbox for targeting RCS glasses
- Offset system: `glassesOffset = new BABYLON.Vector3(400, 4000, 600)`
- Hitbox rotates with RCS facing direction so it stays on face
- **Current limitation**: RCS model is one mesh, can't isolate glasses in code
- **Next step**: Edit RCS model in Blender to separate glasses as own mesh

#### 7. Arena Destruction Potential
- Arena meshes are individual pieces (walls, floors, stairs, towers)
- Future feature: RCS can destroy arena pieces during fight
- Categories: `WallsArena.*`, `Floor.*`, `Stairs.*`, `ArenaTower*`, `TarpTent*`

**New Files:**
- `assets/arena_optimized.glb` - Optimized boss arena (2.64 MB)

**Modified Files:**
- `src/game.js` - Boss level settings, arena loading, glasses hitbox (~2540 lines)
- `src/levels/city.js` - Boss transition instead of win screen
- `index.html` - Boss health bar HUD styles and element

**Boss Level Settings:**
```javascript
levelRCSSettings.boss = {
  scale: 0.025,
  distance: 30,
  heightOffset: 15,
  walkSpeed: 4,  // Slower, menacing pace
  rotation: { pitch: 3.14, yaw: 3.14, roll: 3.14 },
  useBakedModel: true,
};
```

**Next Steps for Boss Fight (Updated in Session 10):**
- [x] Separate RCS glasses in Blender as targetable mesh ✅
- [x] Implement boss health system (damage from projectile hits) ✅
- [x] Animation system with baked Mixamo animations ✅
- [ ] Add attack patterns (charge, stomp, grifter spawns)
- [ ] Arena destruction as fight progresses
- [ ] Victory condition and ending

---

### Session 8 - Level Transition Fix & HUD Improvements

Quick bugfix session that solved the canyon → city level transition and fixed skybox visibility:

#### 1. Level Transition Bug Fix
- **Problem**: After the 2-minute timer completed, the game wouldn't transition to city level
- **Root Cause**: Transition requires ALL enemies to be killed first, but player didn't know this
- **Solution**: Added "DESTROY REMAINING ENEMIES!" HUD element that appears after timer hits 0

#### 2. Enemies Remaining HUD
- New HUD element shows when waves are complete (timer reaches 0)
- Displays count of remaining enemies with red pulsing animation
- Text: "[count] DESTROY REMAINING ENEMIES!"
- Updates in real-time as enemies are killed
- Hides automatically when count reaches 0 and transition begins

#### 3. Canyon Skybox Fix
- **Problem**: Video skybox (`xcopy-skybox.mp4`) not visible in canyon level
- **Root Cause**: EXP2 fog was completely obscuring the distant skybox (at 1000 units, ~98% fog)
- **Solution**: Disabled fog on skybox material and mesh:
  ```javascript
  skyMat.fogEnabled = false;
  skyDome.applyFog = false;
  ```

#### 4. Code Cleanup
- Removed debug console.log statements from wave system
- Added helper functions: `showEnemiesRemainingHUD()`, `updateEnemiesRemainingHUD()`

**Modified Files:**
- `src/game.js` - Wave completion logic, HUD functions, skybox fog fix
- `index.html` - Added `#enemiesRemaining` HUD element with CSS styling

**New HUD Element:**
```html
<div id="enemiesRemaining">
  <span class="count" id="enemiesRemainingCount">0</span>
  DESTROY REMAINING ENEMIES!
</div>
```

**Key Learning**: Fog with EXP2 mode uses exponential falloff (`exp(-density² × distance²)`), which can completely hide distant objects even with seemingly low density values.

---

### Session 7 - Projectile Debug & FPS Optimization

Major debugging session that solved the "projectile drift" mystery and implemented significant performance optimizations:

#### 1. Projectile Debug Investigation
- Extensive debugging of perceived "projectile drift" issue
- Added debug flags: `showSpawnMarkers`, `freezeProjectiles`, `showProjectileHitboxes`
- Created spawn position markers (red spheres) to verify spawn consistency
- Created hitbox visualization (green spheres) to show collision areas
- **Root cause discovered**: Not a bug! Low FPS (dropping from 20 to 4) caused visual perception of drift
- At 4 FPS, projectiles move 10 units between frames, creating illusion of teleporting

#### 2. FPS Optimizations
- **Enemy ground raycasts**: Throttled to every 5 frames per enemy (staggered across enemies)
- **Radar HUD**: Implemented DOM element pooling (25 dots reused instead of create/destroy)
- **City meshes**: Removed `alwaysSelectAsActiveMesh` to allow frustum culling
- **Console logging**: Removed excessive debug console.log statements
- **RCS building raycasts**: Throttled to every 8 frames with cached results

#### 3. RCS Optimization - All Levels Use Baked Model
- Canyon level now uses `RCS-walking.glb` (baked animation) instead of `rcs.glb` + retargeting
- Eliminates runtime animation retargeting overhead
- Simplified rotation code to use settings from config for all levels

#### 4. RCS Debug Controls
- Added comprehensive real-time debug controls for positioning RCS
- Number keys 1-0 and -/= for scale, distance, height, rotation
- Letter keys Q/E/R/T/Y/H/G/B/N/M for spotlight adjustments
- Press P to print current values in copy-paste format for config

#### 5. New Canyon RCS Settings (User-Tuned)
```javascript
canyon: {
  scale: 0.018446744073709574,
  distance: 160,
  heightOffset: -6,
  rotation: { pitch: 3.14, yaw: 1.54, roll: 3.14 },
  useBakedModel: true,
}
```

#### 6. New Canyon Spotlight Settings
```javascript
canyon: {
  intensity: 430,
  range: 200,
  offsetX: 70,
  offsetY: 30,
}
```

#### 7. Boss Level Scaffolding (User Added)
- Added `boss` level to all per-level configuration objects
- Arena terrain loading (`arena_optimized.glb`)
- Boss-specific settings:
  - Jump: Double jump, moderate height (force: 12)
  - Movement: Speed 10 (between city and canyon)
  - RCS: Closer (distance 30), faster (walkSpeed 8), minimum distance 8
  - Spotlight: Red/orange menacing glow
- Boss health bar HUD element referenced

**Key Insight**: What appeared to be a complex projectile spawning bug was actually just low frame rate causing visual perception issues. The spawn position was always correct - proven by static spawn markers staying in place while projectiles appeared to "drift" due to choppy rendering.

**Performance Impact**: These optimizations should significantly improve FPS, especially in city/boss levels where many raycasts were happening every frame.

---

### Session 6 - Full Game Loop, Waves, Title Screen & Optimization

Major session that completed the game loop from title screen through canyon survival to city collection:

#### 1. Title Screen
- Black background with `8.mp4` video (Right Click Save As guy) playing on loop
- "Right Click Save KILL" title text (KILL in red)
- "click or tap to start" prompt
- Fades out on click/tap and starts canyon level

#### 2. Health System
- Player health bar (red gradient) in top-right corner
- Health regenerates over time (1 HP/second)
- Enemies deal 10 damage on contact
- Red vignette flash when taking damage
- Health text shows current/max (e.g., "100 / 100")

#### 3. Wave-Based Canyon Survival (2 Minutes)
- **"SURVIVE" announcement** at game start
- **Three waves** with increasing spawn rates:
  - First Wave (0-40s): 1 enemy every 2 seconds
  - Second Wave (40-80s): 1 enemy every 1.5 seconds  
  - Final Wave (80-120s): 1 enemy every 0.8 seconds
- Wave announcements with fade-in/out animations
- Countdown timer in top-right (MM:SS format)
- Kill counter shows total kills (no goal, just survival)

#### 4. Level Transition
- After 2 minutes AND all remaining enemies cleared → "LEVEL COMPLETE"
- Uses `sessionStorage` to persist level state
- Reloads page and starts city level

#### 5. 3D Cursor Projectile
- Replaced letter/number projectiles with `cursor.glb` 3D model
- Uses mesh cloning for performance (vs instantiation - cursor has materials)
- Scale: 0.0003 (user-tuned)
- Maintains same flight behavior and collision detection

#### 6. Massive Asset Optimization
- **Canyon terrain**: 79MB → 3.1MB (96% reduction)
  - `gltf-transform` with draco, textureCompress, resize, flatten
- **City model**: 55MB → 3.4MB (94% reduction)
  - Decimation ratio 0.3, texture resize to 512px
- Now uses `white_canyon_terrain_optimized.glb` and `lowPolyCity_optimized.glb`

#### 7. Canyon Instancing Fix
- Changed from `clone()` to `createInstance()` for canyon segments
- True GPU instancing for 13 canyon segments
- Better memory usage and render performance

#### 8. Removed Forest Level
- Deleted all forest-related code and references
- Removed `lowPolyForest1.glb`, `lowPolyForest2.glb` from game
- Game now only has canyon → city progression

#### 9. Asset Cleanup
- Moved unused assets to `human-materials-ignore/`:
  - Old animation GLBs
  - Unused collectible GIFs
  - Original unoptimized terrain/city models
  - Skybox textures no longer used

#### 10. Final 4 Collectible Positions
```javascript
{ x: 201.81, y: 123.99, z: -48.64 },   // 5th
{ x: 162.33, y: 46.17, z: -26.86 },    // 6th  
{ x: -186.38, y: 60.39, z: 171.11 },   // 7th
{ x: -45.62, y: 128.47, z: -106.07 },  // 8th
```

#### 11. Collection Debug Tool
- Replaced RCS rotation debug panel
- Slider (0-8) to skip to any collection state
- "Apply" button triggers `debugSkipToCollected()`
- Great for testing video texture progression

#### 12. FPS Debug Counter
- Shows real-time FPS in top-left corner
- Styled with monospace font and semi-transparent background

**New Files:**
- `assets/cursor.glb` - 3D cursor projectile
- `assets/white_canyon_terrain_optimized.glb` - Optimized canyon (3.1MB)
- `assets/lowPolyCity_optimized.glb` - Optimized city (3.4MB)

**Modified Files:**
- `src/game.js` - Health, waves, projectiles, level transition (~2068 lines)
- `src/levels/city.js` - Final collectible positions, debug function
- `index.html` - Title screen, health HUD, wave HUD, timer, FPS display

**Key Constants:**
```javascript
const WAVE_DURATION = 120;  // 2 minutes total
const WAVE_TIMINGS = [0, 40, 80];  // Wave start times
const WAVE_SPAWN_RATES = [2.0, 1.5, 0.8];  // Enemies per second
const maxHealth = 100;
const healthRegenRate = 1;  // HP per second
const enemyDamage = 10;
```

---

### Session 5 - City Level Redesign & Collection Gameplay

Major refactor session that transformed city level into a collection-based game:

1. **Level Module Architecture**
   - Created `src/levels/city.js` for city-specific gameplay
   - Separated level logic from core game.js
   - ES module import system with `window.CityLevel` bridge

2. **Building Management System** (`BuildingManager` class)
   - Catalogs all building meshes from city model (filters by height > 5 units)
   - Buildings start DARK (neutral material) instead of all glitched
   - `activateBuilding()` applies XCOPY glitch video texture
   - Proximity activation: nearby meshes (within 30 units) also get glitch texture
   - Handles multi-part buildings (base + tower both light up)

3. **Collectible System** (`CollectibleManager` class)
   - 8 XCOPY art pieces as collectibles on building rooftops
   - Video textures from `assets/collectibles/1.mp4` through `8.mp4`
   - Billboard planes (4x4 units) that spin continuously
   - Floating animation with Y-axis rotation
   - Collection radius: 3 units from player

4. **Hand-Picked Collectible Positions**
   - First 4 positions manually specified in `COLLECTIBLE_POSITIONS` array
   - Remaining 4 spawn on random buildings
   - Position logging: Press `L` to log current coordinates

5. **Laser System** (`LaserManager` class) - Beamos Style!
   - Collectibles fire spinning laser beams when player is near
   - Proximity activated: only fire when player within 40 units
   - Rotating beam direction (not aimed at player)
   - Rapid fire: 0.15s interval, 0.12s duration
   - Red glowing cylinder meshes with fade-out effect

6. **Progressive Building Unlock System**
   - Start: 1 building active
   - After 1st collect: +1 more building
   - After 2nd collect: +2 more buildings
   - After 3rd collect: +2 more buildings
   - After 4th collect: +2 more buildings (total 8)

7. **Win Condition**
   - Collect all 8 to win
   - Collection counter HUD (top-left): "X / 8"
   - Win screen overlay: "LEVEL COMPLETE"

8. **Enemy (Grifter) Ground Following Fix**
   - Enemies now raycast down to find ground beneath them
   - Smooth height interpolation (0.15 lerp factor)
   - Enemies climb buildings and descend when chasing player
   - No longer float up when player jumps

9. **RCS Spotlight Disabled in City**
   - Set `intensity: 0` for city level RCS spotlight

**New Files:**
- `src/levels/city.js` - City level module (~550 lines)
- `assets/collectibles/1.mp4` through `8.mp4` - Collectible video textures

**Modified Files:**
- `src/game.js` - Removed city XCOPY texture (now in BuildingManager), added CityLevel integration
- `index.html` - Added ES module import, collection counter HUD, win screen

**Key Constants (city.js):**
```javascript
const COLLECTIBLE_POSITIONS = [
  { x: -182.80, y: 100.57, z: -59.64 },  // 1st
  { x: 109.02, y: 112.01, z: 75.87 },    // 2nd
  { x: 218.27, y: 125.18, z: -137.93 },  // 3rd
  { x: 337.20, y: 106.28, z: -50.01 },   // 4th
];

const PROGRESSION = [
  { collect: 0, unlock: 1 },
  { collect: 1, unlock: 1 },
  { collect: 2, unlock: 2 },
  { collect: 3, unlock: 2 },
  { collect: 4, unlock: 2 },
];
```

---

### Session 4 - RCS Debug, Baked Animation, City Polish

Major debugging and polish session focused on fixing RCS positioning and city gameplay:

1. **RCS Debug Realm** (`rcs-debug.html`)
   - Created standalone HTML debug page with sliders for position/scale/rotation
   - Visual aids: pivot point marker, bounding box, ground plane, grid lines
   - Info box showing real-time values and ground-relative positioning
   - Toggle for playing Walking animation vs T-pose
   - Toggle for loading baked animation model (`RCS-walking.glb`) vs original

2. **Discovered Animation Pivot Issue**
   - Original `Walking.glb` animation was moving the pivot point behind RCS
   - This caused RCS to appear sunken into the ground when animated
   - Solution: Use baked animation model from Mixamo export (`RCS-walking.glb`)

3. **Baked Animation Model Integration**
   - Added `useBakedModel: true` option to `levelRCSSettings`
   - City level now loads `RCS-walking.glb` with animation baked directly in
   - New settings: scale `0.015`, heightOffset `0`, proper rotation values

4. **RCS Stalker Behavior**
   - Changed from patrol (back-and-forth) to following the player
   - RCS slowly follows player maintaining 15-50 unit distance
   - Raycast-based building collision with steering (checks left/right paths)
   - RCS avoids getting stuck by steering around obstacles

5. **Player Can Land on Buildings**
   - Changed city ground detection from fixed Y to raycast-based
   - Player now lands on building roofs when jumping
   - Proper ground detection for varied terrain height

6. **Multi-Jump (Quad Jump)**
   - Added `maxJumps` setting (default 3 for city level)
   - Player can jump multiple times in air
   - Jump resets when landing on any surface

7. **Player Spawn Point Fixed**
   - Moved spawn from city center (inside building) to corner
   - Spawn at `bounds.min.x + 20`, `bounds.min.z + 20`
   - Added vertical offset to ensure falling onto ground

8. **City Draw Distance & Visibility**
   - Increased `camera.maxZ` to 10000
   - Disabled fog (`FOGMODE_NONE`) in city level
   - Added `alwaysSelectAsActiveMesh = true` to all city meshes, RCS, skybox
   - **Root cause found**: Skybox at scale 0.4 was occluding distant buildings
   - Fix: Increase skybox scale to push it further from camera

**Files Added:**
- `rcs-debug.html` - Standalone RCS debugging tool
- `assets/RCS-walking.glb` - Baked animation model from Mixamo

**Key Settings (City Level):**
```javascript
levelRCSSettings.city = {
  scale: 0.015,
  heightOffset: 0,
  rotation: { pitch: 3.14, yaw: 3.14, roll: 3.14 },
  walkSpeed: 5,
  useBakedModel: true
}
```

---

### Session 3 - City Level Implementation
Major additions:

1. **City Level** - Full new level using `lowPolyCity.glb`
   - Per-level settings for RCS, lights, and player movement
   - City loads as single environment (not tiled like forest)

2. **XCOPY Texture on City Buildings**
   - Applied animated `xcopy-skybox.mp4` video texture to all city meshes
   - Self-illuminated (emissive) for that glitchy glow effect

3. **City Skybox** - `city-skybox.glb`
   - 3D GLB model skybox instead of texture sphere
   - Self-illuminated, follows camera position
   - Scale: 0.4 (model was already huge)

4. **Asphalt Ground Texture**
   - Large ground plane under the city
   - Applied `CityStreetAsphaltGenericClean001` texture with normal map
   - Tiled 20x across the ground

5. **City-Specific Player Mechanics**
   - **Super Jump**: jumpForce = 50 (vs 6 normal)
   - **Fast Movement**: moveSpeed = 15 (vs 6 normal)
   - **Global Illumination**: Hemispheric light instead of player flashlight

6. **RCS Walking in City**
   - RCS now walks around the city streets (not distant kaiju)
   - Patrol behavior: walks back and forth between two points
   - Turns around when hitting buildings (raycast collision)
   - Debug rotation panel (sliders for pitch/yaw/roll tuning)

7. **Building Collision Detection**
   - Player can't walk through buildings (horizontal raycast)
   - RCS detects buildings and turns around
   - Both use raycast-based collision, not physics engine

8. **Fixed Ground Level**
   - City uses fixed Y level (no raycast to avoid roof teleportation)
   - Ground positioned at `scaledBounds.min.y + 46`

**New Assets:**
- `assets/lowPolyCity.glb` - City environment
- `assets/city-skybox.glb` - 3D skybox model
- `assets/textures/CityStreetAsphaltGenericClean001/` - Street textures

**Debug Features Added:**
- RCS rotation debug panel with pitch/yaw/roll sliders

---

### Session 2 - Canyon Level & Polish
Major additions:
1. **Canyon level** with tiled terrain, raycast collision, visibility culling
2. **NES Zapper** 3D weapon model
3. **Actual letter/number projectiles** with RCS brand colors and glow
4. **Explosion effects** when enemies are hit
5. **Radar HUD** for enemy tracking
6. **Jump ability** for player
7. **Pointer lock** for immersive FPS experience
8. **Per-level settings** for RCS, player light, RCS spotlight
9. **Canyon enemy spawning** - grifters emerge from RCS and fan out
10. **RCS rotation debugging** - solved Meshy/Mixamo model orientation issues

### Session 1 - Core Game
Built from scratch:
1. Infinite tiled forest with fog
2. First-person controls
3. Shooting mechanic with weapon
4. Enemy spawning with grifter images
5. Collision detection and destruction
6. RCS kaiju character in distance with walking animation

The game now has three levels: canyon survival → city collection → boss fight!

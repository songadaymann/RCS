# Projectile Position Drift - Debug Investigation

## Problem Description

When firing the cursor projectile from the NES Zapper:
1. **Issue 1**: The cursor appears too far in front of the gun muzzle
2. **Issue 2**: Each successive shot appears to spawn FURTHER from the muzzle than the previous one (visual drift)

The user provided screenshots showing:
- First shot (timer 1:56): Cursor close to muzzle
- Later shot (timer 1:38): Cursor much further from muzzle

---

## What We've Proven via Logs

### Position is Consistent
- Template position: Always `(0, 0, 0)` - **CONFIRMED via logs**
- Clone position after cloning: Always `(0, 0, 0)` - **CONFIRMED**
- Final absolute position: Consistent when camera is stationary - **CONFIRMED**
- Template position doesn't change between shots - **CONFIRMED**

### No Parent Relationships
- Template parent: `"none"` - **CONFIRMED**
- Clone parent after cloning: `"none"` - **CONFIRMED**

### Scale is Consistent
- Template scale: `{x: 0.0003, y: 0.0003, z: 0.0003}` - constant on all shots
- Projectile scale: Same as template - **CONFIRMED**
- Child meshes (Object_2, Object_3): Scale `{x: 1, y: 1, z: 1}` - **CONFIRMED**

### World Position Matches Local Position
- `finalAbsolutePos` matches `spawnPos` exactly - **CONFIRMED**
- No parent transforms affecting world position

---

## Hypotheses Tested & Results

| Hypothesis | Description | Result |
|------------|-------------|--------|
| A | Forward offset (0.3) too large | Tested various offsets (-0.1, 0.05, 0) - position changes but drift persists |
| B | Template has non-zero initial position | **REJECTED** - Template at (0,0,0) |
| C | Template position changes between shots | **REJECTED** - Always (0,0,0) |
| D | Clone inherits position from template | **REJECTED** - Clone starts at (0,0,0) |
| E | Parent relationship in GLB | **REJECTED** - No parents |
| F | Projectiles aren't being distinguished | Snapshot shows multiple projectiles at different distances correctly |
| I | Template parented to moving object | **REJECTED** - No parent |
| J | Clone inherits parent from template | **REJECTED** - No parent |
| K | World matrix not updating | **REJECTED** - Absolute position matches local |
| L | Scale accumulating | **REJECTED** - Scale constant |
| N | Camera-space calculation inconsistent | **REJECTED** - Consistent when camera stationary |
| O | Inherited transforms from clone | **TESTED** - Explicitly reset all transforms, drift persists |

---

## What Remains Unexplained

The logs PROVE the spawn world position is consistent. Yet visually, the projectile appears to drift further from the muzzle over time.

### Possible Remaining Causes

1. **Cursor GLB geometry is offset from origin**
   - The visible cursor mesh might be located at coordinates like (1000, 0, 0) in local space
   - At scale 0.0003, this = 0.3 unit offset
   - But this wouldn't explain DRIFT, only consistent offset

2. **lookAt() is causing visual displacement**
   - After setting position, we call `lookAt()` to orient the cursor
   - If the cursor model has asymmetric geometry, rotation could shift visual center
   - Different forward vectors each shot = different visual offsets?

3. **Rendering/draw order issue**
   - Maybe projectiles are being drawn before position update takes effect
   - First frame shows wrong position?

4. **User seeing different projectiles**
   - Multiple projectiles in flight
   - User might be looking at an OLDER projectile thinking it's the newest

5. **Weapon visual position drifting**
   - Gun model might be animating or shifting
   - Projectile spawn is consistent but gun appears to move

6. **Perspective/FOV distortion**
   - Same world position projects to different screen positions based on look angle
   - Creates illusion of drift

---

## Current Code State

### Projectile Spawning (shoot function)
```javascript
// Clone template
const projectile = this.cursorTemplate.clone(`projectile_${this.instanceCount++}`);
projectile.setEnabled(true);
projectile.name = "projectile";

// Reset all transforms
projectile.parent = null;
projectile.position = BABYLON.Vector3.Zero();
projectile.rotationQuaternion = null;
projectile.rotation = BABYLON.Vector3.Zero();
projectile.scaling = this.cursorTemplate.scaling.clone();

// Calculate spawn in camera space
const forward = camera.getDirection(BABYLON.Axis.Z);
const right = camera.getDirection(BABYLON.Axis.X);
const up = camera.getDirection(BABYLON.Axis.Y);

const spawnOffsetRight = 0.3;
const spawnOffsetDown = -0.2;
const spawnOffsetForward = 0.8;

const spawnPos = camera.position.clone()
  .addInPlace(right.scale(spawnOffsetRight))
  .addInPlace(up.scale(spawnOffsetDown))
  .addInPlace(forward.scale(spawnOffsetForward));

projectile.position = spawnPos;

// Orient cursor to fly forward
const targetPos = projectile.position.add(forward);
projectile.lookAt(targetPos);
```

### Cursor Template Loading
```javascript
this.cursorTemplate = result.meshes[0]; // __root__ node
this.cursorTemplate.setEnabled(false);
const cursorScale = 0.0003;
this.cursorTemplate.scaling = new BABYLON.Vector3(cursorScale, cursorScale, cursorScale);
```

---

## Next Steps to Try

1. **Disable lookAt()** - Remove rotation entirely to see if that's causing visual shift

2. **Log the cursor model's bounding box** - Check if geometry is offset from origin
   ```javascript
   const bounds = projectile.getBoundingInfo();
   console.log(bounds.boundingBox.center);
   ```

3. **Create a simple test mesh** - Replace cursor.glb with a basic sphere to isolate if it's the model

4. **Log weapon position** - Verify gun isn't moving

5. **Add visual debug marker** - Create a small box at exact spawn position to compare vs cursor visual

6. **Check if issue is frame-timing** - Log position on first render frame after spawn

---

## Debug Instrumentation Still Active

The following log points are still in the code:
- `loadCursorModel`: Template initial state
- `shoot:before-clone`: Template state with scale and children
- `shoot:after-clone`: Clone state after reset
- `shoot:after-position`: Final spawn position with camera-space calculation
- `shoot:after-all`: Template position after shot
- `update`: Active projectiles snapshot (2% sampling)

---

## Session Notes

- Issue persists across multiple fix attempts
- Logs consistently show correct, non-drifting positions
- Visual clearly shows drift in user's screenshots
- Disconnect between logged data and visual behavior is the core mystery



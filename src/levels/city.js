// City Level - Progressive Building Collection Gameplay
// Buildings start dark, activate with glitch texture when collectibles spawn

// Sprite animation frame counts (for cycling through PNG sequences)
const SPRITE_CONFIG = {
  xcopySkybox: { frames: 13, fps: 25, size: 512 },
  collectibles: [
    { frames: 10, fps: 25 },  // 1
    { frames: 8, fps: 25 },   // 2
    { frames: 16, fps: 25 },  // 3
    { frames: 8, fps: 25 },   // 4
    { frames: 16, fps: 25 },  // 5
    { frames: 8, fps: 12 },   // 6
    { frames: 8, fps: 16 },   // 7
    { frames: 8, fps: 20 },   // 8
  ]
};

// Progression: how many buildings unlock after each collection
const PROGRESSION = [
  { collect: 0, unlock: 1 },  // Start: 1 building active
  { collect: 1, unlock: 1 },  // After 1st, unlock 1 more (total 2)
  { collect: 2, unlock: 2 },  // After 2nd, unlock 2 more (total 4)
  { collect: 3, unlock: 2 },  // After 3rd, unlock 2 more (total 6)
  { collect: 4, unlock: 2 },  // After 4th, unlock 2 more (total 8)
];

const TOTAL_TO_WIN = 8;

// Manually specified collectible positions (hand-picked spots)
const COLLECTIBLE_POSITIONS = [
  { x: -182.80, y: 100.57, z: -59.64 },  // 1st collectible
  { x: 109.02, y: 112.01, z: 75.87 },    // 2nd collectible
  { x: 218.27, y: 125.18, z: -137.93 },  // 3rd collectible
  { x: 337.20, y: 106.28, z: -50.01 },   // 4th collectible
  { x: 201.81, y: 123.99, z: -48.64 },   // 5th collectible
  { x: 162.33, y: 46.17, z: -26.86 },    // 6th collectible
  { x: -186.38, y: 60.39, z: 171.11 },   // 7th collectible
  { x: -45.62, y: 128.47, z: -106.07 },  // 8th collectible
];

// (Video files replaced with sprite sequences in assets/sprites/collectibles/)

// ============================================================================
// SpriteAnimator - Helper to cycle through PNG frame sequences
// ============================================================================
class SpriteAnimator {
  constructor(scene) {
    this.scene = scene;
    this.animations = []; // { textures: [], currentFrame: 0, fps: 25, material: null, lastUpdate: 0 }
  }

  // Load a sequence of PNG frames and return texture array
  loadSequence(basePath, frameCount, paddedDigits = 2) {
    const textures = [];
    for (let i = 1; i <= frameCount; i++) {
      const frameNum = String(i).padStart(paddedDigits, '0');
      const texture = new BABYLON.Texture(
        `${basePath}/frame_${frameNum}.png`,
        this.scene,
        false, // noMipmap
        true,  // invertY
        BABYLON.Texture.TRILINEAR_SAMPLINGMODE
      );
      textures.push(texture);
    }
    return textures;
  }

  // Register an animation to be updated each frame
  register(textures, material, textureProperty, fps = 25) {
    this.animations.push({
      textures,
      material,
      textureProperty, // 'diffuseTexture', 'emissiveTexture', etc.
      currentFrame: 0,
      fps,
      lastUpdate: performance.now()
    });
  }

  // Call this every frame to update all sprite animations
  update() {
    const now = performance.now();
    for (const anim of this.animations) {
      const frameInterval = 1000 / anim.fps;
      if (now - anim.lastUpdate >= frameInterval) {
        anim.currentFrame = (anim.currentFrame + 1) % anim.textures.length;
        const newTexture = anim.textures[anim.currentFrame];
        
        // Update all texture properties that need this animation
        if (Array.isArray(anim.textureProperty)) {
          for (const prop of anim.textureProperty) {
            anim.material[prop] = newTexture;
          }
        } else {
          anim.material[anim.textureProperty] = newTexture;
        }
        
        anim.lastUpdate = now;
      }
    }
  }
}

// ============================================================================
// BuildingManager - Track and manage building states
// ============================================================================
class BuildingManager {
  constructor(scene) {
    this.scene = scene;
    this.buildings = [];        // All building meshes
    this.activeBuildings = [];  // Indices of buildings with glitch texture
    this.defaultMaterial = null;
    this.glitchMaterial = null;
    this.cityRoot = null;
  }

  // Create the default dark material for inactive buildings
  createDefaultMaterial() {
    const mat = new BABYLON.StandardMaterial("cityDefaultMat", this.scene);
    mat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.15);
    mat.emissiveColor = new BABYLON.Color3(0.02, 0.02, 0.03);
    mat.specularColor = new BABYLON.Color3(0, 0, 0);
    this.defaultMaterial = mat;
    return mat;
  }

  // Create the glitch XCOPY video texture material (buildings)
  createGlitchMaterial() {
    const mat = new BABYLON.StandardMaterial("cityGlitchMat", this.scene);
    
    // Use video texture for buildings - looks better and city is now optimized
    const xcopyTexture = new BABYLON.VideoTexture(
      "cityXcopyVideo",
      "./assets/xcopy-skybox.mp4",
      this.scene,
      true,
      false,
      BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
      {
        autoPlay: true,
        loop: true,
        muted: true,
        autoUpdateTexture: true
      }
    );
    xcopyTexture.uScale = 2;
    xcopyTexture.vScale = 2;
    
    mat.diffuseTexture = xcopyTexture;
    mat.emissiveTexture = xcopyTexture;
    mat.emissiveColor = new BABYLON.Color3(0.3, 0.3, 0.3);
    mat.specularColor = new BABYLON.Color3(0, 0, 0);
    
    this.glitchMaterial = mat;
    return mat;
  }

  // Catalog all building meshes from the city model
  catalogBuildings(cityRoot) {
    this.cityRoot = cityRoot;
    this.buildings = [];
    
    // Get all child meshes that could be buildings
    // Filter out ground, roads, etc. by checking mesh properties
    cityRoot.getChildMeshes().forEach((mesh, index) => {
      // Skip very flat meshes (likely ground/roads)
      const bounds = mesh.getBoundingInfo().boundingBox;
      const height = bounds.maximumWorld.y - bounds.minimumWorld.y;
      const width = bounds.maximumWorld.x - bounds.minimumWorld.x;
      const depth = bounds.maximumWorld.z - bounds.minimumWorld.z;
      
      // Buildings are generally taller than they are wide/deep
      // Or at least have some significant height
      if (height > 5) {
        this.buildings.push({
          mesh: mesh,
          index: index,
          isActive: false,
          bounds: bounds,
          center: new BABYLON.Vector3(
            (bounds.minimumWorld.x + bounds.maximumWorld.x) / 2,
            bounds.maximumWorld.y, // Top of building
            (bounds.minimumWorld.z + bounds.maximumWorld.z) / 2
          )
        });
      }
    });

    console.log(`BuildingManager: Found ${this.buildings.length} buildings`);
    
    // Apply default dark material to all buildings
    this.buildings.forEach(b => {
      b.mesh.material = this.defaultMaterial;
    });
  }

  // Activate a building (apply glitch texture)
  // Also activates nearby meshes that are part of the same structure
  activateBuilding(buildingIndex) {
    const building = this.buildings[buildingIndex];
    if (building && !building.isActive) {
      building.isActive = true;
      building.mesh.material = this.glitchMaterial;
      this.activeBuildings.push(buildingIndex);
      
      // Also activate nearby meshes (within 30 units) that are likely part of same building
      const proximityRadius = 30;
      for (let i = 0; i < this.buildings.length; i++) {
        if (i === buildingIndex) continue;
        const other = this.buildings[i];
        if (other.isActive) continue;
        
        // Check XZ distance (ignore Y - buildings can have different height parts)
        const dx = other.center.x - building.center.x;
        const dz = other.center.z - building.center.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        
        if (dist < proximityRadius) {
          other.isActive = true;
          other.mesh.material = this.glitchMaterial;
          this.activeBuildings.push(i);
          console.log(`  Also activated nearby mesh ${i} (dist: ${dist.toFixed(1)})`);
        }
      }
      
      console.log(`Activated building ${buildingIndex} and nearby parts`);
      return building;
    }
    return null;
  }

  // Get a random inactive building
  getRandomInactiveBuilding() {
    const inactive = this.buildings
      .map((b, i) => ({ building: b, index: i }))
      .filter(item => !item.building.isActive);
    
    if (inactive.length === 0) return null;
    
    const randomItem = inactive[Math.floor(Math.random() * inactive.length)];
    return randomItem.index;
  }

  // Get building by index
  getBuilding(index) {
    return this.buildings[index] || null;
  }

  // Find the building closest to a given position
  findClosestBuilding(position) {
    let closestIndex = -1;
    let closestDist = Infinity;
    
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      if (b.isActive) continue; // Skip already active buildings
      
      const dx = b.center.x - position.x;
      const dz = b.center.z - position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      
      if (dist < closestDist) {
        closestDist = dist;
        closestIndex = i;
      }
    }
    
    return closestIndex;
  }
}

// ============================================================================
// CollectibleManager - Spawn and track collectibles on rooftops
// ============================================================================
class CollectibleManager {
  constructor(scene) {
    this.scene = scene;
    this.collectibles = [];
    this.collectedCount = 0;
    this.totalToWin = TOTAL_TO_WIN;
    this.collectibleMaterials = []; // One material per sprite sequence
    this.collectibleTextures = [];  // Array of texture arrays for each collectible
    this.placeholderMaterial = null;
    this.collectionRadius = 3; // How close player needs to be to collect
    this.spawnCount = 0; // Track how many collectibles spawned
  }

  // Create materials for collectibles using sprite sequences
  createMaterial(spriteAnimator) {
    // Create materials for each collectible sprite sequence
    for (let i = 0; i < SPRITE_CONFIG.collectibles.length; i++) {
      const config = SPRITE_CONFIG.collectibles[i];
      const mat = new BABYLON.StandardMaterial(`collectibleMat_${i}`, this.scene);
      
      // Load sprite sequence
      const textures = spriteAnimator.loadSequence(
        `./assets/sprites/collectibles/${i + 1}`,
        config.frames
      );
      this.collectibleTextures.push(textures);
      
      // Set initial texture
      const initialTexture = textures[0];
      initialTexture.hasAlpha = true;
      
      mat.diffuseTexture = initialTexture;
      mat.emissiveTexture = initialTexture;
      mat.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0.5);
      mat.specularColor = new BABYLON.Color3(0, 0, 0);
      mat.backFaceCulling = false;
      mat.useAlphaFromDiffuseTexture = true;
      
      // Register for animation updates
      spriteAnimator.register(
        textures,
        mat,
        ['diffuseTexture', 'emissiveTexture'],
        config.fps
      );
      
      this.collectibleMaterials.push(mat);
    }
    
    // Placeholder material for collectibles without sprite files
    const placeholder = new BABYLON.StandardMaterial("collectiblePlaceholder", this.scene);
    placeholder.emissiveColor = new BABYLON.Color3(1, 0.8, 0);
    placeholder.diffuseColor = new BABYLON.Color3(1, 0.8, 0);
    placeholder.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5);
    placeholder.alpha = 0.9;
    this.placeholderMaterial = placeholder;
    
    return this.collectibleMaterials;
  }

  // Spawn a collectible on a building's rooftop (or at a specific position)
  spawnOnBuilding(building, buildingIndex, overridePosition = null) {
    // Create billboard plane for collectible
    const collectible = BABYLON.MeshBuilder.CreatePlane(
      `collectible_${buildingIndex}`,
      { width: 4, height: 4 }, // Bigger for video visibility
      this.scene
    );
    
    // Use sprite material if available, otherwise placeholder
    const materialIndex = this.spawnCount;
    if (materialIndex < this.collectibleMaterials.length) {
      collectible.material = this.collectibleMaterials[materialIndex];
      console.log(`Collectible ${materialIndex} using sprite sequence ${materialIndex + 1}`);
    } else {
      collectible.material = this.placeholderMaterial;
      console.log(`Collectible ${materialIndex} using placeholder (no sprites)`);
    }
    this.spawnCount++;
    
    collectible.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    
    // Position: use override if provided, otherwise building rooftop
    let posX, posY, posZ;
    if (overridePosition) {
      posX = overridePosition.x;
      posY = overridePosition.y;
      posZ = overridePosition.z;
      console.log(`Collectible spawned at specified position: ${posX}, ${posY}, ${posZ}`);
    } else {
      posX = building.center.x;
      posY = building.center.y + 2; // Hover above roof
      posZ = building.center.z;
    }
    collectible.position = new BABYLON.Vector3(posX, posY, posZ);
    
    // Add floating animation
    const floatAnim = new BABYLON.Animation(
      "collectibleFloat",
      "position.y",
      30,
      BABYLON.Animation.ANIMATIONTYPE_FLOAT,
      BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE
    );
    
    const keys = [
      { frame: 0, value: posY },
      { frame: 30, value: posY + 0.5 },
      { frame: 60, value: posY }
    ];
    floatAnim.setKeys(keys);
    collectible.animations.push(floatAnim);
    this.scene.beginAnimation(collectible, 0, 60, true);
    
    // Add spinning rotation (instead of just floating)
    const spinAnim = new BABYLON.Animation(
      "collectibleSpin",
      "rotation.y",
      30,
      BABYLON.Animation.ANIMATIONTYPE_FLOAT,
      BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE
    );
    
    const spinKeys = [
      { frame: 0, value: 0 },
      { frame: 60, value: Math.PI * 2 } // Full rotation
    ];
    spinAnim.setKeys(spinKeys);
    collectible.animations.push(spinAnim);
    this.scene.beginAnimation(collectible, 0, 60, true, 0.5); // 0.5 speed = slower spin
    
    const collectibleData = {
      mesh: collectible,
      buildingIndex: buildingIndex,
      position: collectible.position.clone(),
      lastLaserTime: 0,
      rotationAngle: 0, // Track rotation for laser direction
      isActive: false   // Only fire when player is near
    };
    
    this.collectibles.push(collectibleData);
    console.log(`Spawned spinning collectible on building ${buildingIndex} at Y=${posY}`);
    
    return collectibleData;
  }

  // Check if player is close enough to collect any collectible
  checkCollection(playerPos) {
    for (let i = this.collectibles.length - 1; i >= 0; i--) {
      const c = this.collectibles[i];
      const dist = BABYLON.Vector3.Distance(playerPos, c.mesh.position);
      
      if (dist < this.collectionRadius) {
        return this.collect(i);
      }
    }
    return null;
  }

  // Collect a collectible and return its data
  collect(index) {
    const collectible = this.collectibles[index];
    if (collectible) {
      // Stop animation and dispose
      this.scene.stopAnimation(collectible.mesh);
      collectible.mesh.dispose();
      
      this.collectibles.splice(index, 1);
      this.collectedCount++;
      
      console.log(`Collected! ${this.collectedCount}/${this.totalToWin}`);
      return collectible;
    }
    return null;
  }

  // Get all active collectibles (for laser targeting)
  getCollectibles() {
    return this.collectibles;
  }
}

// ============================================================================
// LaserManager - Handle laser beams from collectibles
// ============================================================================
class LaserManager {
  constructor(scene) {
    this.scene = scene;
    this.lasers = [];
    this.burstInterval = 0.15;  // Fast firing for spinning beam effect
    this.burstDuration = 0.12;  // Short duration so beams don't overlap too much
    this.laserSpeed = 50;
    this.damage = 5;  // Damage per laser hit (player has 100 HP, regens at 5/sec)
  }

  // Fire a laser from collectible toward player
  fireLaser(fromPos, toPos) {
    // Create laser beam as a thin cylinder
    const direction = toPos.subtract(fromPos);
    const distance = direction.length();
    direction.normalize();
    
    // Create laser mesh
    const laser = BABYLON.MeshBuilder.CreateCylinder(
      "laser",
      { height: distance, diameter: 0.1 },
      this.scene
    );
    
    // Laser material - bright red glow
    const laserMat = new BABYLON.StandardMaterial("laserMat", this.scene);
    laserMat.emissiveColor = new BABYLON.Color3(1, 0, 0);
    laserMat.diffuseColor = new BABYLON.Color3(1, 0.2, 0.2);
    laserMat.alpha = 0.8;
    laser.material = laserMat;
    
    // Position at midpoint
    const midpoint = fromPos.add(direction.scale(distance / 2));
    laser.position = midpoint;
    
    // Rotate to point toward target
    // Cylinder is vertical by default, need to rotate to match direction
    const up = new BABYLON.Vector3(0, 1, 0);
    const angle = Math.acos(BABYLON.Vector3.Dot(up, direction));
    const axis = BABYLON.Vector3.Cross(up, direction).normalize();
    if (axis.length() > 0.001) {
      laser.rotationQuaternion = BABYLON.Quaternion.RotationAxis(axis, angle);
    }
    
    this.lasers.push({
      mesh: laser,
      startPos: fromPos.clone(),
      endPos: toPos.clone(),
      timer: 0,
      duration: this.burstDuration
    });
  }

  // Update all active lasers
  update(dt) {
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const laser = this.lasers[i];
      laser.timer += dt;
      
      // Fade out effect
      if (laser.mesh.material) {
        laser.mesh.material.alpha = 0.8 * (1 - laser.timer / laser.duration);
      }
      
      if (laser.timer >= laser.duration) {
        laser.mesh.dispose();
        this.lasers.splice(i, 1);
      }
    }
  }

  // Check if player is hit by any laser (simplified - check proximity to laser line)
  checkPlayerHit(playerPos) {
    for (const laser of this.lasers) {
      // Simple proximity check to the laser line
      const toPlayer = playerPos.subtract(laser.startPos);
      const laserDir = laser.endPos.subtract(laser.startPos).normalize();
      const projection = BABYLON.Vector3.Dot(toPlayer, laserDir);
      
      if (projection > 0 && projection < BABYLON.Vector3.Distance(laser.startPos, laser.endPos)) {
        const closestPoint = laser.startPos.add(laserDir.scale(projection));
        const distToLaser = BABYLON.Vector3.Distance(playerPos, closestPoint);
        
        if (distToLaser < 1.5) {
          return true; // Hit!
        }
      }
    }
    return false;
  }
}

// ============================================================================
// CityLevel - Main level controller
// ============================================================================
export const CityLevel = {
  // Managers
  buildingManager: null,
  collectibleManager: null,
  laserManager: null,
  spriteAnimator: null,
  scene: null,
  
  // State
  state: {
    initialized: false,
    gameWon: false,
    cityBounds: null,
    groundY: 0
  },

  // Called once when level loads
  async setup(scene, cityRoot, cityBounds) {
    console.log("CityLevel: Setting up...");
    
    // Store scene reference for debug functions
    this.scene = scene;
    
    // Create sprite animator first (shared by all managers)
    this.spriteAnimator = new SpriteAnimator(scene);
    
    // Create managers
    this.buildingManager = new BuildingManager(scene);
    this.collectibleManager = new CollectibleManager(scene);
    this.laserManager = new LaserManager(scene);
    
    // Create materials
    this.buildingManager.createDefaultMaterial();
    this.buildingManager.createGlitchMaterial(); // Video texture for buildings
    this.collectibleManager.createMaterial(this.spriteAnimator); // Sprites for collectibles
    
    // Catalog buildings from the city model
    this.buildingManager.catalogBuildings(cityRoot);
    
    // Store bounds
    this.state.cityBounds = cityBounds;
    this.state.groundY = cityBounds.min.y + 46;
    
    // Start progression - activate first building
    this.activateNextBuildings(0);
    
    this.state.initialized = true;
    console.log("CityLevel: Setup complete");
  },

  // Track how many collectibles have been spawned (for position array)
  spawnedCount: 0,

  // Activate buildings based on progression
  activateNextBuildings(currentCollected) {
    // Find the progression entry for current collection count
    const entry = PROGRESSION.find(p => p.collect === currentCollected);
    if (!entry) return;
    
    const numToUnlock = entry.unlock;
    console.log(`Progression: collected ${currentCollected}, unlocking ${numToUnlock} buildings`);
    
    for (let i = 0; i < numToUnlock; i++) {
      let buildingIndex;
      let overridePosition = null;
      
      // Check if we have a manually specified position for this collectible
      if (this.spawnedCount < COLLECTIBLE_POSITIONS.length) {
        const specifiedPos = COLLECTIBLE_POSITIONS[this.spawnedCount];
        buildingIndex = this.buildingManager.findClosestBuilding(specifiedPos);
        overridePosition = specifiedPos;
        console.log(`Collectible ${this.spawnedCount + 1}: using specified position`);
      } else {
        // No more specified positions, use random building
        buildingIndex = this.buildingManager.getRandomInactiveBuilding();
      }
      
      if (buildingIndex !== null && buildingIndex >= 0) {
        const building = this.buildingManager.activateBuilding(buildingIndex);
        if (building) {
          this.collectibleManager.spawnOnBuilding(building, buildingIndex, overridePosition);
          this.spawnedCount++;
        }
      }
    }
  },

  // Called every frame
  update(dt, camera, scene) {
    if (!this.state.initialized || this.state.gameWon) return;
    
    // Update sprite animations (texture cycling)
    if (this.spriteAnimator) {
      this.spriteAnimator.update();
    }
    
    const playerPos = camera.position;
    
    // Check for collection
    const collected = this.collectibleManager.checkCollection(playerPos);
    if (collected) {
      // Update HUD
      this.updateHUD();
      
      // Check win condition
      if (this.collectibleManager.collectedCount >= this.collectibleManager.totalToWin) {
        this.triggerWin();
        return;
      }
      
      // Trigger next progression
      this.activateNextBuildings(this.collectibleManager.collectedCount);
    }
    
    // Update lasers
    this.laserManager.update(dt);
    
    // Fire lasers from collectibles - Beamos style (spinning beam, proximity activated)
    const now = performance.now() / 1000;
    const activationDistance = 40; // How close player needs to be to activate
    const laserLength = 30; // How far the laser beam extends
    
    for (const collectible of this.collectibleManager.getCollectibles()) {
      const distToPlayer = BABYLON.Vector3.Distance(playerPos, collectible.mesh.position);
      
      // Activate when player gets close
      collectible.isActive = distToPlayer < activationDistance;
      
      if (collectible.isActive) {
        // Update rotation angle (track the spin)
        collectible.rotationAngle += dt * 2; // Spin speed for laser direction
        
        // Fire laser periodically in the direction it's facing
        if (now - collectible.lastLaserTime > this.laserManager.burstInterval) {
          // Calculate laser direction based on rotation (horizontal sweep)
          const laserDirX = Math.sin(collectible.rotationAngle);
          const laserDirZ = Math.cos(collectible.rotationAngle);
          
          const startPos = collectible.mesh.position.clone();
          const endPos = startPos.add(new BABYLON.Vector3(
            laserDirX * laserLength,
            0, // Horizontal beam
            laserDirZ * laserLength
          ));
          
          this.laserManager.fireLaser(startPos, endPos);
          collectible.lastLaserTime = now;
        }
      }
    }
    
    // Check if player hit by laser and apply damage
    if (this.laserManager.checkPlayerHit(playerPos)) {
      if (window.damagePlayer) {
        window.damagePlayer(this.laserManager.damage);
      }
    }
  },

  // Update the collection counter HUD
  updateHUD() {
    const counter = document.getElementById("collectCounter");
    if (counter) {
      counter.textContent = `${this.collectibleManager.collectedCount} / ${this.collectibleManager.totalToWin}`;
    }
  },

  // Trigger win condition - transition to boss level
  triggerWin() {
    this.state.gameWon = true;
    console.log("CITY COMPLETE - BOSS FIGHT INCOMING!");
    
    // Fade out music before transitioning
    if (typeof window.fadeOutMusic === 'function') {
      window.fadeOutMusic(1500);
    }
    
    // Save collectibles completion time for end-game stats
    const cityTime = (performance.now() - (window.levelStartTime || performance.now())) / 1000;
    sessionStorage.setItem('collectiblesCompleteTime', cityTime.toString());
    
    // Also persist current shot/kill stats
    if (typeof window.totalShotsFired !== 'undefined') {
      sessionStorage.setItem('totalShotsFired', window.totalShotsFired.toString());
    }
    if (typeof window.totalGriftersKilled !== 'undefined') {
      sessionStorage.setItem('totalGriftersKilled', window.totalGriftersKilled.toString());
    }
    
    // Set flag to load boss level - title screen will show "BOSS FIGHT"
    sessionStorage.setItem('nextLevel', 'boss');
    
    // Delay reload to let music fade
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  },

  // Get collected count for external access
  getCollectedCount() {
    return this.collectibleManager ? this.collectibleManager.collectedCount : 0;
  },

  // Debug: Skip to a certain collection state
  debugSkipToCollected(targetCount) {
    if (!this.state.initialized) {
      console.log("CityLevel not initialized yet");
      return;
    }
    
    console.log(`Debug: Skipping to ${targetCount} collected`);
    
    // Dispose all current collectibles
    for (const c of this.collectibleManager.collectibles) {
      this.scene?.stopAnimation(c.mesh);
      c.mesh.dispose();
    }
    this.collectibleManager.collectibles = [];
    this.collectibleManager.collectedCount = 0;
    this.collectibleManager.spawnCount = 0;
    this.spawnedCount = 0;
    
    // Reset all buildings to dark
    for (const b of this.buildingManager.buildings) {
      b.isActive = false;
      b.mesh.material = this.buildingManager.defaultMaterial;
    }
    this.buildingManager.activeBuildings = [];
    
    // Re-run progression from 0 up to targetCount
    for (let i = 0; i <= targetCount; i++) {
      this.activateNextBuildings(i);
    }
    
    // Mark the first targetCount collectibles as already collected (remove them)
    // by collecting from the end backwards
    const toRemove = Math.min(targetCount, this.collectibleManager.collectibles.length);
    for (let i = 0; i < toRemove; i++) {
      const c = this.collectibleManager.collectibles[0];
      if (c) {
        this.scene?.stopAnimation(c.mesh);
        c.mesh.dispose();
        this.collectibleManager.collectibles.shift();
        this.collectibleManager.collectedCount++;
      }
    }
    
    // Update HUD
    this.updateHUD();
    
    console.log(`Debug: Now at ${this.collectibleManager.collectedCount} collected, ${this.collectibleManager.collectibles.length} remaining`);
  }
};


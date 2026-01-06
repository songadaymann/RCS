# RCS Shooter - Game Design Document

## Concept
An FPS based on XCOPY's Right Click Save guy. Three levels with escalating tension - RCS starts as a distant menacing presence and becomes the final boss.

---

## The Three Levels

### Level 1: City
- **Setting**: Low-poly city streets
- **RCS**: Kaiju-sized, looming in the distance, walking but never arriving
- **Enemies**: Grifter NFTs come at player from all angles (zombie-like waves)
- **Mood**: Dark, foggy, urban dread - something terrible is coming

### Level 2: Canyon  
- **Setting**: White canyon terrain, stretched and alien
- **RCS**: Closer now, grifters spawn FROM RCS and fan out toward player
- **Enemies**: Grifters emerge from RCS's direction, spreading as they approach
- **Mood**: Escalation - RCS is the source, not just a presence

### Level 3: Boss Fight (Doom-style)
- **Setting**: TBD - possibly arena-style
- **RCS**: You fight RCS directly
- **Enemies**: RCS himself + possibly grifter minions
- **Mood**: Climax - face the monster you've been running from

---

## Core Mechanics

### Weapon
- NES Zapper (3D model)
- Shoots letters and numbers (A-Z, 0-9)
- Letters cycle through RCS brand colors (#67ae8d, #702fd9, #61998b, #304f60, #549385)
- Future: Letters will be the hash of the game NFT

### Enemies (Grifters)
- 100 XCOPY Grifter NFT images as billboard sprites
- Spawn in waves, move toward player
- Explode when hit (5-frame animation)
- CC0 license - scraped from xcopy.art

### Player
- First-person controls (WASD + mouse look)
- Jump ability
- Pointer lock for immersive FPS feel
- Radar HUD showing enemy positions

---

## Aesthetic

### Visual Style
- Dark, foggy, glitchy
- XCOPY's crypto-punk aesthetic
- Low-poly environments
- RCS brand colors for projectiles
- Skybox: XCOPY-style animated/glitchy sky

### Key Visual Goals
- Feel RCS's massive scale (kaiju walking in distance)
- Oppressive atmosphere
- Glitch effects (TBD)
- Performance-optimized (visibility culling, LOD)

---

## Assets

### Models
- `rcs.glb` - RCS kaiju character (Meshy → Mixamo rigged)
- `nesZapper.glb` - NES Zapper weapon
- `white_canyon_terrain.glb` - Canyon level terrain
- `lowPolyCity.fbx` → needs GLB conversion for city level
- `lowPolyForest1.glb` - Original forest (being replaced with city)

### Animations
- `Walking.glb` - Mixamo walk cycle, retargeted to RCS

### Images
- `grifters/` - 100 Grifter NFT PNGs (003-102)
- `explosion/` - 5-frame explosion animation
- `xcopySKYBOX.webp` - Skybox texture

---

## Technical Notes

### Engine
Babylon.js (browser-based, WebGL)

### Optimization
- Terrain visibility culling (only render nearby segments)
- Billboard sprites for enemies
- Pre-cached textures for projectiles
- Fog to limit draw distance naturally

### Per-Level Configuration
All level-specific settings at top of `game.js`:
- RCS scale, distance, height
- Player light settings
- RCS spotlight settings
- Enemy spawn behavior

---

## Status

### ✅ Completed
- Core FPS gameplay loop
- Forest and Canyon levels working
- NES Zapper weapon
- Grifter enemies with explosions
- RCS walking animation
- Radar HUD
- Per-level settings system
- Pointer lock / jump

### 🔧 In Progress
- City level (needs FBX → GLB conversion)

### 📋 TODO
- Boss fight level
- Score system
- Health/lives
- Wave difficulty ramping
- Sound effects
- Glitch effects
- Mobile controls
- mann.cool integration
- NFT hash as projectile letters

---

## Original Notes

> Grifters scraped from: https://xcopy.art/works/grifters (CC0)
> RCS model created in Meshy, rigged in Mixamo
> Performance is critical - games run slow without optimization attention

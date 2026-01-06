/**
 * Remove black backgrounds from Grifter images
 * Makes #000000 pixels transparent
 */

const { Jimp } = require('jimp');
const fs = require('fs');
const path = require('path');

const GRIFTERS_DIR = path.join(__dirname, 'assets', 'grifters');

// Tolerance for "black" - pixels with R, G, B all below this threshold are considered black
const BLACK_THRESHOLD = 10;

async function removeBackground(filepath) {
    const image = await Jimp.read(filepath);
    
    const width = image.width;
    const height = image.height;
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const color = image.getPixelColor(x, y);
            
            // Extract RGBA from the color (Jimp uses RGBA format)
            const r = (color >> 24) & 0xFF;
            const g = (color >> 16) & 0xFF;
            const b = (color >> 8) & 0xFF;
            
            // If pixel is very dark (near black), make it transparent
            if (r <= BLACK_THRESHOLD && g <= BLACK_THRESHOLD && b <= BLACK_THRESHOLD) {
                // Set to transparent (RGBA with alpha = 0)
                image.setPixelColor(0x00000000, x, y);
            }
        }
    }
    
    await image.write(filepath);
}

async function processAllGrifters() {
    const files = fs.readdirSync(GRIFTERS_DIR)
        .filter(f => f.endsWith('.png'))
        .sort();
    
    console.log(`Processing ${files.length} grifter images...`);
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const filepath = path.join(GRIFTERS_DIR, file);
        
        process.stdout.write(`  [${i + 1}/${files.length}] ${file}...`);
        
        try {
            await removeBackground(filepath);
            console.log(' ✓');
        } catch (err) {
            console.log(` FAILED: ${err.message}`);
        }
    }
    
    console.log('\nDone! All backgrounds removed.');
}

processAllGrifters();

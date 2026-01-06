/**
 * Grifter Scraper for RCS Shooter
 * Scrapes grifter images from xcopy.art/works/grifters
 * 
 * Usage: node scrape-grifters.js [count]
 * - count: number of grifters to download (default: 30)
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const GRIFTERS_URL = 'https://xcopy.art/works/grifters';
const OUTPUT_DIR = path.join(__dirname, 'assets', 'grifters');

// How many grifters to download (can be overridden via command line)
const MAX_GRIFTERS = parseInt(process.argv[2]) || 30;

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created directory: ${OUTPUT_DIR}`);
}

// Simple fetch function using built-in https
function fetch(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        }, (res) => {
            // Handle redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetch(res.headers.location).then(resolve).catch(reject);
            }
            
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
            res.on('error', reject);
        }).on('error', reject);
    });
}

// Download binary file
function downloadFile(url, filepath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
            }
        }, (res) => {
            // Handle redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return downloadFile(res.headers.location, filepath).then(resolve).catch(reject);
            }
            
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }

            const fileStream = fs.createWriteStream(filepath);
            res.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close();
                resolve();
            });
            fileStream.on('error', reject);
        }).on('error', reject);
    });
}

async function scrapeGrifters() {
    console.log(`Fetching ${GRIFTERS_URL}...`);
    
    try {
        const html = await fetch(GRIFTERS_URL);
        console.log(`Got HTML (${html.length} bytes)`);
        
        // Find all original_images URLs (these are the full quality grifters)
        const originalImageRegex = /https:\/\/admin\.xcopy\.art\/media\/original_images\/[^"'\\\s]+/g;
        const matches = html.match(originalImageRegex) || [];
        
        // Deduplicate
        const uniqueUrls = [...new Set(matches)];
        console.log(`Found ${uniqueUrls.length} original grifter images`);
        
        if (uniqueUrls.length === 0) {
            console.log('No images found!');
            return;
        }
        
        // Download images
        const toDownload = uniqueUrls.slice(0, MAX_GRIFTERS);
        console.log(`Downloading ${toDownload.length} images...`);
        
        let successCount = 0;
        for (let i = 0; i < toDownload.length; i++) {
            const url = toDownload[i];
            
            // Determine file extension from URL or default to .png
            let ext = '.png';
            if (url.endsWith('.gif')) ext = '.gif';
            else if (url.endsWith('.jpg') || url.endsWith('.jpeg')) ext = '.jpg';
            else if (url.includes('.png')) ext = '.png';
            
            const filename = `grifter_${String(i + 1).padStart(3, '0')}${ext}`;
            const filepath = path.join(OUTPUT_DIR, filename);
            
            try {
                process.stdout.write(`  [${i + 1}/${toDownload.length}] Downloading ${filename}...`);
                await downloadFile(url, filepath);
                
                // Check file size
                const stats = fs.statSync(filepath);
                console.log(` ${(stats.size / 1024).toFixed(1)}KB`);
                successCount++;
            } catch (err) {
                console.log(` FAILED: ${err.message}`);
            }
            
            // Small delay to be respectful
            await new Promise(r => setTimeout(r, 100));
        }
        
        console.log(`\nDone! Successfully downloaded ${successCount}/${toDownload.length} grifters.`);
        console.log(`Files saved to: ${OUTPUT_DIR}`);
        
    } catch (err) {
        console.error('Error:', err.message);
    }
}

scrapeGrifters();

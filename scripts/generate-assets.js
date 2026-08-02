/**
 * Run: node scripts/generate-assets.js
 * Generates icon.png (1024x1024) and splash.png (1284x2778) for Expo.
 * Uses only built-in Node.js — no canvas dependency needed.
 * Creates simple SVG files then you can convert them, OR
 * just use the SVG directly as a reference for your designer.
 *
 * For a quick working solution, this script creates minimal valid PNG files
 * using raw PNG binary encoding.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(width, height, bgR, bgG, bgB) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  function chunk(type, data) {
    const typeBuffer = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeBuffer, data]);
    let crc = 0xffffffff;
    for (const byte of crcData) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) {
        crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
      }
    }
    crc ^= 0xffffffff;
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc >>> 0);
    return Buffer.concat([len, typeBuffer, data, crcBuf]);
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type RGB
  ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;

  // Raw image data: filter byte (0) + RGB per row
  const rowSize = 1 + width * 3;
  const raw = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    const offset = y * rowSize;
    raw[offset] = 0; // filter none
    for (let x = 0; x < width; x++) {
      raw[offset + 1 + x * 3] = bgR;
      raw[offset + 1 + x * 3 + 1] = bgG;
      raw[offset + 1 + x * 3 + 2] = bgB;
    }
  }

  const compressed = zlib.deflateSync(raw);
  const idatChunk = chunk('IDAT', compressed);
  const iendChunk = chunk('IEND', Buffer.alloc(0));
  const ihdrChunk = chunk('IHDR', ihdrData);

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

// Icon: 1024x1024 green background
const icon = createPNG(1024, 1024, 46, 204, 113); // #2ECC71 green
fs.writeFileSync(path.join(__dirname, '../assets/icon.png'), icon);
console.log('✓ assets/icon.png created (1024x1024 green)');

// Splash: 1284x2778 white background  
const splash = createPNG(1284, 2778, 255, 255, 255);
fs.writeFileSync(path.join(__dirname, '../assets/splash.png'), splash);
console.log('✓ assets/splash.png created (1284x2778 white)');

// Adaptive icon foreground: 1024x1024 transparent-ish (white)
const adaptive = createPNG(1024, 1024, 46, 204, 113);
fs.writeFileSync(path.join(__dirname, '../assets/adaptive-icon.png'), adaptive);
console.log('✓ assets/adaptive-icon.png created');

console.log('\nDone! Replace these with your actual logo PNGs.');
console.log('Icon should be 1024x1024, splash 1284x2778.');

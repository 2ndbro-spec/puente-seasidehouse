const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const IMAGES_DIR = path.join(__dirname, "..", "src", "images");
const MAX_WIDTH = 1600;
const QUALITY = 82;
const SKIP_THRESHOLD = 400 * 1024; // 400KB

async function optimizeImages() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.log("No images directory found, skipping optimization.");
    return;
  }

  const files = fs.readdirSync(IMAGES_DIR);
  let optimized = 0;
  let skipped = 0;

  for (const file of files) {
    if (!/\.(jpe?g|png)$/i.test(file)) continue;

    const filepath = path.join(IMAGES_DIR, file);
    const stats = fs.statSync(filepath);

    if (stats.size <= SKIP_THRESHOLD) {
      skipped++;
      continue;
    }

    try {
      const buffer = await sharp(filepath)
        .resize(MAX_WIDTH, null, { withoutEnlargement: true })
        .jpeg({ quality: QUALITY })
        .toBuffer();

      if (buffer.length < stats.size) {
        fs.writeFileSync(filepath, buffer);
        console.log(
          `  Optimized: ${file} (${(stats.size / 1024).toFixed(0)}KB → ${(buffer.length / 1024).toFixed(0)}KB)`
        );
        optimized++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.warn(`  Skipped (error): ${file} — ${err.message}`);
      skipped++;
    }
  }

  console.log(
    `Image optimization: ${optimized} optimized, ${skipped} skipped.`
  );
}

optimizeImages().catch(console.error);

import sharp from 'sharp';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sizes = [16, 32, 48, 128];
const inputPng = join(__dirname, '../src/assets/icon.png');
const inputSvg = join(__dirname, '../src/assets/icon.svg');
const outputDir = join(__dirname, '../public/icons');

export async function generateIcons() {
  console.log('Generating icons...');

  // Auto-detect source file
  let sourceType: 'png' | 'svg' | null = null;
  let sourcePath = '';

  if (existsSync(inputPng)) {
    sourceType = 'png';
    sourcePath = inputPng;
    console.log('Using icon.png as source');
  } else if (existsSync(inputSvg)) {
    sourceType = 'svg';
    sourcePath = inputSvg;
    console.log('Using icon.svg as source');
  } else {
    throw new Error('Neither icon.png nor icon.svg found in src/assets');
  }

  console.log('Source file:', sourcePath);
  console.log('Output dir:', outputDir);

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
    console.log('Created output directory');
  }

  // Prepare source buffer for SVG or direct path for PNG
  let sourceBuffer: Buffer | undefined;
  if (sourceType === 'svg') {
    sourceBuffer = readFileSync(sourcePath);
    console.log(`SVG file read successfully, size: ${sourceBuffer.length} bytes`);
  } else {
    console.log('PNG file will be read directly by sharp');
  }

  // Generate PNGs for each size
  for (const size of sizes) {
    const outputPath = join(outputDir, `icon-${size}.png`);

    try {
      console.log(`Processing ${size}x${size} icon...`);

      let sharpPipeline;
      if (sourceType === 'svg') {
        sharpPipeline = sharp(sourceBuffer!, {
          density: 300
        });
      } else {
        sharpPipeline = sharp(sourcePath);
      }

      await sharpPipeline
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png({
          quality: 100,
          compressionLevel: 9
        })
        .toFile(outputPath);

      console.log(`✅ Generated ${outputPath}`);
    } catch (error) {
      console.error(`❌ Failed to generate ${size}px icon:`, error);

      // Fallback: create a simple colored square PNG
      try {
        console.log(`Generating fallback ${size}px icon...`);

        await sharp({
          create: {
            width: size,
            height: size,
            channels: 4,
            background: { r: 79, g: 70, b: 229, alpha: 1 }
          }
        })
          .png()
          .toFile(outputPath);

        console.log(`✅ Generated fallback ${size}px icon`);
      } catch (fallbackError) {
        console.error(`❌ Failed to generate fallback ${size}px icon:`, fallbackError);
      }
    }
  }

  console.log('Icon generation completed');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateIcons().catch(console.error);
}

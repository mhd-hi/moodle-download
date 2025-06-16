const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function convertSvgToPng() {
    const svgPath = path.join(__dirname, 'icon.svg');
    const sizes = [16, 48, 128];

    if (!fs.existsSync(svgPath)) {
        console.error('Error: icon.svg not found');
        return;
    }

    console.log('Converting SVG to PNG icons...');

    for (const size of sizes) {
        try {
            const outputPath = path.join(__dirname, `icon${size}.png`);

            await sharp(svgPath)
                .resize(size, size)
                .png()
                .toFile(outputPath);

            console.log(`✅ Created icon${size}.png (${size}x${size})`);
        } catch (error) {
            console.error(`❌ Error creating ${size}x${size} icon:`, error.message);
        }
    }

    console.log('Icon conversion complete!');
}

convertSvgToPng().catch(console.error);

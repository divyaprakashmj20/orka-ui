const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
const MARK_SVG = path.join(ROOT, 'src', 'assets', 'logo-mark.svg');
const FULL_SVG = path.join(ROOT, 'src', 'assets', 'logo.svg');

const DARK_BG = { r: 10, g: 10, b: 15, alpha: 1 }; // #0a0a0f
const ICON_BG = { r: 99, g: 102, b: 241, alpha: 1 }; // #6366f1

const ICON_SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

const FG_SIZES = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
};

const SPLASH_PORT = {
  'drawable-port-mdpi': { w: 320, h: 480 },
  'drawable-port-hdpi': { w: 480, h: 800 },
  'drawable-port-xhdpi': { w: 720, h: 1280 },
  'drawable-port-xxhdpi': { w: 1080, h: 1920 },
  'drawable-port-xxxhdpi': { w: 1440, h: 2560 },
};

const SPLASH_LAND = {
  'drawable-land-mdpi': { w: 480, h: 320 },
  'drawable-land-hdpi': { w: 800, h: 480 },
  'drawable-land-xhdpi': { w: 1280, h: 720 },
  'drawable-land-xxhdpi': { w: 1920, h: 1080 },
  'drawable-land-xxxhdpi': { w: 2560, h: 1440 },
};

async function renderPngFromSvg(svgPath, width, height) {
  return sharp(svgPath)
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function writeIcons() {
  for (const [folder, size] of Object.entries(ICON_SIZES)) {
    const iconSize = Math.round(size * 0.72);
    const mark = await renderPngFromSvg(MARK_SVG, iconSize, iconSize);

    const icon = await sharp({
      create: { width: size, height: size, channels: 4, background: ICON_BG },
    })
      .composite([{ input: mark, gravity: 'centre' }])
      .png()
      .toBuffer();

    const dir = path.join(RES, folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'ic_launcher.png'), icon);
    fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), icon);
    console.log(`✓ ${folder}/ic_launcher.png`);
  }

  for (const [folder, size] of Object.entries(FG_SIZES)) {
    const fgSize = Math.round(size * 0.52);
    const mark = await renderPngFromSvg(MARK_SVG, fgSize, fgSize);

    const fg = await sharp({
      create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: mark, gravity: 'centre' }])
      .png()
      .toBuffer();

    fs.writeFileSync(path.join(RES, folder, 'ic_launcher_foreground.png'), fg);
    console.log(`✓ ${folder}/ic_launcher_foreground.png`);
  }
}

async function writeSplashes() {
  const targets = { ...SPLASH_PORT, ...SPLASH_LAND };

  for (const [folder, { w, h }] of Object.entries(targets)) {
    const logoW = Math.round(w * 0.62);
    const logoH = Math.round(h * 0.22);
    const fullLogo = await renderPngFromSvg(FULL_SVG, logoW, logoH);

    const splash = await sharp({
      create: { width: w, height: h, channels: 4, background: DARK_BG },
    })
      .composite([{ input: fullLogo, gravity: 'centre' }])
      .png()
      .toBuffer();

    const dir = path.join(RES, folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'splash.png'), splash);
    console.log(`✓ ${folder}/splash.png`);
  }

  const baseSplash = await sharp({
    create: { width: 480, height: 800, channels: 4, background: DARK_BG },
  })
    .composite([{ input: await renderPngFromSvg(FULL_SVG, 300, 170), gravity: 'centre' }])
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(RES, 'drawable', 'splash.png'), baseSplash);
  console.log('✓ drawable/splash.png');
}

async function writeWebIcons() {
  const fav = await renderPngFromSvg(MARK_SVG, 32, 32);
  fs.writeFileSync(path.join(ROOT, 'src', 'assets', 'favicon.png'), fav);

  const icon192 = await renderPngFromSvg(MARK_SVG, 192, 192);
  fs.writeFileSync(path.join(ROOT, 'src', 'assets', 'icon-192.png'), icon192);

  const icon512 = await renderPngFromSvg(MARK_SVG, 512, 512);
  fs.writeFileSync(path.join(ROOT, 'src', 'assets', 'icon-512.png'), icon512);

  console.log('✓ src/assets/favicon.png, icon-192.png, icon-512.png');
}

(async () => {
  await writeIcons();
  await writeSplashes();
  await writeWebIcons();
  console.log('\nBrand assets regenerated successfully.');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

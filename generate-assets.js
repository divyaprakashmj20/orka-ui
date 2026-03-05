/**
 * Generate properly-sized Android app icon & splash-screen assets
 * from the source logo at src/assets/logo.png.
 *
 * Run:  node generate-assets.js
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const LOGO = path.join(__dirname, 'src', 'assets', 'logo.png');
const RES = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');

// App brand colours (matches variables.scss dark theme)
const BG_COLOR = { r: 10, g: 10, b: 15, alpha: 1 };          // #0a0a0f
const ICON_BG = { r: 99, g: 102, b: 241, alpha: 1 };         // #6366f1  (indigo primary)

// ── Icon sizes (Android adaptive icon uses 108dp with 72dp safe zone) ──
const ICON_SIZES = {
  'mipmap-mdpi':    48,
  'mipmap-hdpi':    72,
  'mipmap-xhdpi':   96,
  'mipmap-xxhdpi':  144,
  'mipmap-xxxhdpi': 192,
};

// Foreground for adaptive icons is 108dp but with 18dp padding each side
const FG_SIZES = {
  'mipmap-mdpi':    108,
  'mipmap-hdpi':    162,
  'mipmap-xhdpi':   216,
  'mipmap-xxhdpi':  324,
  'mipmap-xxxhdpi': 432,
};

// ── Splash screen sizes ──
const SPLASH_PORT = {
  'drawable-port-mdpi':    { w: 320,  h: 480 },
  'drawable-port-hdpi':    { w: 480,  h: 800 },
  'drawable-port-xhdpi':   { w: 720,  h: 1280 },
  'drawable-port-xxhdpi':  { w: 1080, h: 1920 },
  'drawable-port-xxxhdpi': { w: 1440, h: 2560 },
};

const SPLASH_LAND = {
  'drawable-land-mdpi':    { w: 480,  h: 320 },
  'drawable-land-hdpi':    { w: 800,  h: 480 },
  'drawable-land-xhdpi':   { w: 1280, h: 720 },
  'drawable-land-xxhdpi':  { w: 1920, h: 1080 },
  'drawable-land-xxxhdpi': { w: 2560, h: 1440 },
};

async function run() {
  const logo = sharp(LOGO);
  const meta = await logo.metadata();
  console.log(`Source logo: ${meta.width}x${meta.height}`);

  // ── 1. Generate launcher icons (round cornered logo on indigo bg) ──
  for (const [folder, size] of Object.entries(ICON_SIZES)) {
    // Fit the logo into 70% of the icon size, center on indigo background
    const logoSize = Math.round(size * 0.6);
    const resizedLogo = await sharp(LOGO)
      .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    // Create icon with indigo background + centered logo
    const icon = await sharp({
      create: { width: size, height: size, channels: 4, background: ICON_BG }
    })
      .composite([{
        input: resizedLogo,
        gravity: 'centre'
      }])
      .png()
      .toBuffer();

    const dir = path.join(RES, folder);
    fs.mkdirSync(dir, { recursive: true });

    // ic_launcher.png
    fs.writeFileSync(path.join(dir, 'ic_launcher.png'), icon);
    // ic_launcher_round.png (same for now - Android clips it to circle)
    fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), icon);

    console.log(`  ✓ ${folder}/ic_launcher.png  (${size}x${size})`);
  }

  // ── 2. Generate adaptive icon foregrounds (logo centered on transparent) ──
  for (const [folder, size] of Object.entries(FG_SIZES)) {
    const logoSize = Math.round(size * 0.45);  // ~45% of 108dp canvas = inside safe zone
    const resizedLogo = await sharp(LOGO)
      .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const fg = await sharp({
      create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .composite([{
        input: resizedLogo,
        gravity: 'centre'
      }])
      .png()
      .toBuffer();

    const dir = path.join(RES, folder);
    fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), fg);
    console.log(`  ✓ ${folder}/ic_launcher_foreground.png  (${size}x${size})`);
  }

  // ── 3. Generate splash screens (dark bg + centered logo, ~35% width) ──
  const allSplash = { ...SPLASH_PORT, ...SPLASH_LAND };
  for (const [folder, { w, h }] of Object.entries(allSplash)) {
    // Logo occupies ~35% of the smaller dimension
    const logoW = Math.round(Math.min(w, h) * 0.45);
    const logoH = Math.round(logoW * (meta.height / meta.width));

    const resizedLogo = await sharp(LOGO)
      .resize(logoW, logoH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const splash = await sharp({
      create: { width: w, height: h, channels: 4, background: BG_COLOR }
    })
      .composite([{
        input: resizedLogo,
        gravity: 'centre'
      }])
      .png()
      .toBuffer();

    const dir = path.join(RES, folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'splash.png'), splash);
    console.log(`  ✓ ${folder}/splash.png  (${w}x${h})`);
  }

  // ── 4. Base drawable splash (used by the theme) ──
  {
    const w = 480, h = 800;
    const logoW = Math.round(Math.min(w, h) * 0.45);
    const logoH = Math.round(logoW * (meta.height / meta.width));

    const resizedLogo = await sharp(LOGO)
      .resize(logoW, logoH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const splash = await sharp({
      create: { width: w, height: h, channels: 4, background: BG_COLOR }
    })
      .composite([{
        input: resizedLogo,
        gravity: 'centre'
      }])
      .png()
      .toBuffer();

    fs.writeFileSync(path.join(RES, 'drawable', 'splash.png'), splash);
    console.log(`  ✓ drawable/splash.png  (${w}x${h})`);
  }

  // ── 5. Generate a proper favicon for web (32x32) ──
  const faviconSize = 32;
  const faviconLogo = await sharp(LOGO)
    .resize(faviconSize, faviconSize, { fit: 'contain', background: ICON_BG })
    .png()
    .toBuffer();
  const faviconPath = path.join(__dirname, 'src', 'assets', 'favicon.png');
  fs.writeFileSync(faviconPath, faviconLogo);
  console.log(`  ✓ src/assets/favicon.png  (${faviconSize}x${faviconSize})`);

  // ── 6. Generate a 192px + 512px icon for PWA / web splash ──
  for (const pwaSize of [192, 512]) {
    const logoSize = Math.round(pwaSize * 0.65);
    const resizedLogo = await sharp(LOGO)
      .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const pwaIcon = await sharp({
      create: { width: pwaSize, height: pwaSize, channels: 4, background: ICON_BG }
    })
      .composite([{
        input: resizedLogo,
        gravity: 'centre'
      }])
      .png()
      .toBuffer();

    const pwaPath = path.join(__dirname, 'src', 'assets', `icon-${pwaSize}.png`);
    fs.writeFileSync(pwaPath, pwaIcon);
    console.log(`  ✓ src/assets/icon-${pwaSize}.png  (${pwaSize}x${pwaSize})`);
  }

  console.log('\n✅ All assets generated successfully!');
}

run().catch(err => { console.error(err); process.exit(1); });

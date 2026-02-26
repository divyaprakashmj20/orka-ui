import type { CapacitorConfig } from '@capacitor/cli';

const capMode = (process.env['ORKA_CAP_MODE'] ?? 'local').toLowerCase();
const isLocalMode = capMode === 'local';

const config: CapacitorConfig = {
  appId: 'com.lytspeed.orka',
  appName: 'Orka',
  webDir: 'dist/orka-ui/browser',
  bundledWebRuntime: false
};

if (isLocalMode) {
  config.server = {
    androidScheme: 'http',
    cleartext: true
  };
}

export default config;

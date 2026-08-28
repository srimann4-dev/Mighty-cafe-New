const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite web support requires WASM files to be treated as assets.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}
config.resolver.unstable_enablePackageExports = true;

// react-native-thermal-receipt-printer-image-qr imports react-native-ping
// for network printing which we don't use. Mock it so Metro doesn't error.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'react-native-ping': require.resolve('./src/mocks/react-native-ping.js'),
};

module.exports = config;

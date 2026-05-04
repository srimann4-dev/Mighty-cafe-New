const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// react-native-thermal-receipt-printer-image-qr imports react-native-ping
// for network printing which we don't use. Mock it so Metro doesn't error.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  'react-native-ping': require.resolve('./src/mocks/react-native-ping.js'),
};

module.exports = config;

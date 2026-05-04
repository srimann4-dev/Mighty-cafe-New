// Mock for react-native-ping — only needed by the network printing path
// of react-native-thermal-receipt-printer-image-qr which we don't use.
// We only use Bluetooth printing.
module.exports = {
  default: {
    start: () => Promise.resolve(0),
    stop: () => {},
  },
};

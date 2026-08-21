const appJson = require('./app.json');

const profile = process.env.EAS_BUILD_PROFILE;
const isSideloadBuild = profile === 'preview' || profile === 'apk' || profile === 'development';

module.exports = {
  expo: {
    ...appJson.expo,
    updates: {
      ...appJson.expo.updates,
      // Preview APKs must keep the JS that was compiled into the build.
      // Otherwise ON_LOAD pulls production OTA JS and the new APK looks unchanged.
      enabled: !isSideloadBuild,
      checkAutomatically: isSideloadBuild ? 'NEVER' : 'ON_LOAD',
    },
    runtimeVersion: isSideloadBuild ? '1.0.1-preview' : appJson.expo.runtimeVersion,
  },
};

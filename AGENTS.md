# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

**Mighty Cafe MVP** is an offline-first React Native (Expo SDK 54) café POS app. Data is stored in on-device SQLite via `expo-sqlite`. There is no in-repo backend server.

### Required services

| Service | Command | Notes |
|---------|---------|-------|
| Metro bundler (native dev) | `npm start` | Serves JS bundle for Android/iOS |
| Expo web preview | `npm run web` | Requires web deps in `package.json` and WASM config in `metro.config.js` |
| Android native build | `npm run android` | Requires Android SDK + device/emulator (not preinstalled in cloud VM) |

### Common commands

- Install deps: `npm install` (uses `legacy-peer-deps=true` from `.npmrc`)
- Typecheck (lint): `npm run typecheck`
- Start Metro: `npm start`
- Web preview: `npm run web` (listens on port 8081)

There is no ESLint config or automated test suite in this repo.

### Default login

- Admin PIN: `1234` (see `src/config/appConfig.ts`)

### Web development caveats

1. **WASM / SQLite**: `metro.config.js` must include `wasm` in `resolver.assetExts` for `expo-sqlite` web support. Without this, Metro fails to bundle `wa-sqlite.wasm`.
2. **Binary permissions**: If `tsc` or `expo` report "Permission denied", run `chmod +x node_modules/.bin/*`.
3. **Stale Metro process**: If port 8081 is in use, kill the old Expo process before restarting (`pkill -f "expo start"`).
4. **Bluetooth features** (printer, scanner) do not work on web; test those on a native Android build (`npx expo run:android`).
5. **Android emulator** is not available in the cloud VM (no KVM). Use web preview for cloud-agent E2E testing, or connect a physical Android device for native testing.

### Optional integrations

- **Supabase sync**: Configure in-app from Settings; schema at `scripts/supabase_schema.sql`
- **EAS Build**: Config in `eas.json`

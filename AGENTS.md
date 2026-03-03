## Cursor Cloud specific instructions

This is an **Expo React Native** project (SDK 54, React 19, React Native 0.81) named "voice-reminder". It uses file-based routing via `expo-router`, TypeScript with strict mode, and ESLint with the flat config format (`eslint.config.js`).

### Key commands

| Command | Purpose |
|---|---|
| `npm install` | Install/refresh dependencies |
| `npm run start` | Start Expo dev server (Metro bundler) |
| `npm run web` | Start Expo dev server and open web |
| `npm run lint` | Run ESLint via `expo lint` |
| `npm run typecheck` | Run `tsc --noEmit` |
| `bash ./scripts/cloud-setup.sh` | Idempotent cloud bootstrap + validation |

### Project structure

- `app/` — File-based routes (expo-router). `(tabs)/` contains the tab navigator screens.
- `components/` — Shared React Native components.
- `constants/` — Theme/color constants.
- `hooks/` — Custom React hooks (color scheme, theme).
- `assets/images/` — Static image assets.
- `scripts/` — Utility scripts (`reset-project.js`).

### Non-obvious notes

- `npm run start` launches Metro on port 8081 by default. Press `w` in the terminal to open the web version.
- To test in the cloud environment (no physical device), use `npx expo start --web --port 8081` to run in web mode.
- The `expo-env.d.ts` file and `.expo/` directory are generated at build time and git-ignored.
- The `tsconfig.json` extends `expo/tsconfig.base`; path alias `@/*` maps to the project root.
- ESLint uses the flat config format (`eslint.config.js`) with `eslint-config-expo`.
- `.cursor/environment.json` runs `scripts/cloud-setup.sh` on cloud-machine startup so dependencies and checks are preconfigured.
- Reminder-native modules validated in cloud setup: `expo-av`, `expo-location`, `expo-notifications`, `expo-task-manager`, `@react-native-async-storage/async-storage`, `@react-native-community/datetimepicker`.

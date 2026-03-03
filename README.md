# Voice Reminder Mobile App

Mobile reminder system built with Expo + React Native.

## What it does

- Records a **voice message** for each reminder.
- Stores the **association context as part of the same reminder** (spoken phrase + trigger metadata).
- Supports reminder triggers by:
  - **Time** (local scheduled notification)
  - **Location** (geofence entry background task)
  - **External integration events** (deep-link trigger endpoint)

## Trigger model

Each reminder includes:

- `audioUri` - recorded voice audio.
- `associationPhrase` - the reminder phrase/context (recommended to match what was spoken).
- `trigger` - one of:
  - `time` with `atISO`
  - `location` with `latitude`, `longitude`, `radiusMeters`
  - `integration` with `eventKey`, `source`

## External systems integration

External automations/devices can trigger reminders using the custom URL scheme:

`voicereminder://trigger/<eventKey>?source=<iot|calendar|bluetooth|nfc|custom>`

Example:

`voicereminder://trigger/garage-opened?source=iot`

This lets you connect third-party systems (IoT hubs, workflow automations, calendar scripts, Bluetooth/NFC gateways) by forwarding events into the app.

## Local development

### 1) Install dependencies

```bash
npm install
```

### 2) Start Expo

```bash
npm run start
```

### 3) Run checks

```bash
npm run typecheck
npm run lint
```

## EAS Update setup (fixes "no EAS update branch")

If you see a "no EAS update branch" error, it usually means your update channel is not mapped to a branch yet.

### 1) Login and link project once

```bash
npx eas-cli login
npx eas-cli project:init
```

### 2) Publish using the helper script

This repository includes an update helper that keeps channel and branch names aligned:

```bash
npm run eas:update:preview -- "Preview update"
npm run eas:update:production -- "Production update"
```

You can also pick a custom channel/branch name:

```bash
npm run eas:update -- staging "Staging update"
```

The helper will:

- create the channel if needed
- publish to a branch with the same name
- map the channel to that branch

This alignment prevents the common "no EAS update branch" failure.

### 3) Run update from GitHub Actions (free option)

This repo includes `.github/workflows/eas-update.yml` for manual updates.

First, add your Expo token as a repo secret:

1. Create token: https://expo.dev/accounts/[your-expo-username]/settings/access-tokens
2. In GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**
3. Name: `EXPO_TOKEN`
4. Value: paste your Expo access token

Then run the workflow:

1. Open **Actions** tab
2. Select **EAS Update**
3. Click **Run workflow**
4. Choose `preview` or `production`
5. Optionally enter a message
6. Click **Run workflow**

## Permission requirements

- Microphone: voice recording.
- Notifications: time + external trigger alerts.
- Foreground/background location: geofence reminders.

## Notes

- Geofence reminders require background location permission.
- Time reminders are one-shot scheduled notifications.
- Reminder data is persisted locally with AsyncStorage.
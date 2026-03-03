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

## Permission requirements

- Microphone: voice recording.
- Notifications: time + external trigger alerts.
- Foreground/background location: geofence reminders.

## Notes

- Geofence reminders require background location permission.
- Time reminders are one-shot scheduled notifications.
- Reminder data is persisted locally with AsyncStorage.
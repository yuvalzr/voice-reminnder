import * as Location from "expo-location";
import * as Notifications from "expo-notifications";

import type {
  IntegrationSource,
  LocationReminderTrigger,
  VoiceReminder,
} from "../types/reminder";
import { GEOFENCE_TASK_NAME } from "./geofenceTask";

let notificationLayerConfigured = false;

export async function configureNotificationLayer(): Promise<void> {
  if (notificationLayerConfigured) {
    return;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  await Notifications.setNotificationChannelAsync("reminders", {
    name: "Voice reminders",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 200, 100, 200],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });

  notificationLayerConfigured = true;
}

export async function requestNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) {
    return true;
  }
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function requestLocationPermissionsForGeofencing(): Promise<boolean> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) {
    return false;
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  return background.granted;
}

export async function scheduleTimeReminderNotification(
  reminder: VoiceReminder,
): Promise<string | undefined> {
  if (reminder.trigger.type !== "time") {
    return undefined;
  }

  const scheduledFor = new Date(reminder.trigger.atISO);
  if (Number.isNaN(scheduledFor.getTime())) {
    return undefined;
  }

  if (scheduledFor.getTime() <= Date.now()) {
    return undefined;
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Voice reminder",
      body: reminder.associationPhrase,
      data: {
        reminderId: reminder.id,
        triggerType: "time",
      },
      sound: "default",
    },
    trigger: {
      channelId: "reminders",
      date: scheduledFor,
      type: Notifications.SchedulableTriggerInputTypes.DATE,
    },
  });
}

export async function cancelTimeReminderNotification(
  reminder: VoiceReminder,
): Promise<void> {
  if (reminder.trigger.type !== "time" || !reminder.trigger.notificationId) {
    return;
  }
  await Notifications.cancelScheduledNotificationAsync(
    reminder.trigger.notificationId,
  );
}

export async function syncLocationGeofencing(
  reminders: VoiceReminder[],
): Promise<void> {
  const locationReminders = reminders.filter(
    (
      item,
    ): item is VoiceReminder & { trigger: LocationReminderTrigger } =>
      item.trigger.type === "location",
  );

  if (locationReminders.length === 0) {
    const geofenceActive = await Location.hasStartedGeofencingAsync(
      GEOFENCE_TASK_NAME,
    );
    if (geofenceActive) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK_NAME);
    }
    return;
  }

  const foregroundPermission = await Location.getForegroundPermissionsAsync();
  const backgroundPermission = await Location.getBackgroundPermissionsAsync();
  if (!foregroundPermission.granted || !backgroundPermission.granted) {
    return;
  }

  const regions: Location.LocationRegion[] = locationReminders.map((item) => ({
    identifier: item.id,
    latitude: item.trigger.latitude,
    longitude: item.trigger.longitude,
    radius: item.trigger.radiusMeters,
    notifyOnEnter: true,
    notifyOnExit: false,
  }));

  await Location.startGeofencingAsync(GEOFENCE_TASK_NAME, regions);
}

export async function triggerIntegrationReminders(
  reminders: VoiceReminder[],
  eventKey: string,
  source?: IntegrationSource,
): Promise<{ reminders: VoiceReminder[]; triggeredCount: number }> {
  const nowISO = new Date().toISOString();
  let triggeredCount = 0;

  const updatedReminders: VoiceReminder[] = reminders.map((item) => {
    if (item.trigger.type !== "integration") {
      return item;
    }

    const keyMatches =
      item.trigger.eventKey.trim().toLowerCase() ===
      eventKey.trim().toLowerCase();
    const sourceMatches =
      !source || item.trigger.source === source || item.trigger.source === "custom";
    if (!keyMatches || !sourceMatches) {
      return item;
    }

    triggeredCount += 1;
    return {
      ...item,
      lastTriggeredAtISO: nowISO,
    };
  });

  if (triggeredCount > 0) {
    for (const reminder of updatedReminders) {
      if (
        reminder.trigger.type === "integration" &&
        reminder.lastTriggeredAtISO === nowISO &&
        reminder.trigger.eventKey.trim().toLowerCase() ===
          eventKey.trim().toLowerCase()
      ) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Integration-triggered voice reminder",
            body: reminder.associationPhrase,
            data: {
              reminderId: reminder.id,
              triggerType: "integration",
              eventKey,
              source: source ?? reminder.trigger.source,
            },
            sound: "default",
          },
          trigger: null,
        });
      }
    }
  }

  return { reminders: updatedReminders, triggeredCount };
}

export function parseIntegrationTriggerUrl(
  url: string,
): { eventKey: string; source?: IntegrationSource } | null {
  const [basePart = "", queryString] = url.split("?");
  const normalized = basePart.replace("voicereminder://", "");
  const pathSegments = normalized.split("/").filter(Boolean);
  if (pathSegments.length < 2 || pathSegments[0] !== "trigger") {
    return null;
  }

  const eventKey = decodeURIComponent(pathSegments[1] ?? "").trim();
  if (!eventKey) {
    return null;
  }

  if (!queryString) {
    return { eventKey };
  }

  const searchParams = new URLSearchParams(queryString);
  const rawSource = (searchParams.get("source") ?? "").trim();
  if (!rawSource) {
    return { eventKey };
  }

  const allowedSources: IntegrationSource[] = [
    "iot",
    "calendar",
    "bluetooth",
    "nfc",
    "custom",
  ];
  if (!allowedSources.includes(rawSource as IntegrationSource)) {
    return { eventKey };
  }

  return { eventKey, source: rawSource as IntegrationSource };
}

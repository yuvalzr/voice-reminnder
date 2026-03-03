import * as Notifications from "expo-notifications";
import { GeofencingEventType } from "expo-location";
import * as TaskManager from "expo-task-manager";

import { loadReminders, saveReminders } from "./storage";

export const GEOFENCE_TASK_NAME = "voice-reminder:geofence";

if (!TaskManager.isTaskDefined(GEOFENCE_TASK_NAME)) {
  TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
    if (error || !data) {
      return;
    }

    const geofenceData = data as {
      eventType: GeofencingEventType;
      region?: { identifier?: string };
    };

    if (geofenceData.eventType !== GeofencingEventType.Enter) {
      return;
    }

    const reminderId = geofenceData.region?.identifier;
    if (!reminderId) {
      return;
    }

    const reminders = await loadReminders();
    const matchedReminder = reminders.find((item) => item.id === reminderId);
    if (!matchedReminder) {
      return;
    }

    const updatedReminders = reminders.map((item) =>
      item.id === reminderId
        ? {
            ...item,
            lastTriggeredAtISO: new Date().toISOString(),
          }
        : item,
    );
    await saveReminders(updatedReminders);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Location voice reminder",
        body: matchedReminder.associationPhrase,
        data: {
          reminderId,
          triggerType: "location",
        },
      },
      trigger: null,
    });
  });
}

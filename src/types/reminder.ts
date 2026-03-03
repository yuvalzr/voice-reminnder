export type ReminderTriggerType = "time" | "location" | "integration";

export type IntegrationSource =
  | "iot"
  | "calendar"
  | "bluetooth"
  | "nfc"
  | "custom";

export interface TimeReminderTrigger {
  type: "time";
  atISO: string;
  notificationId?: string;
}

export interface LocationReminderTrigger {
  type: "location";
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface IntegrationReminderTrigger {
  type: "integration";
  eventKey: string;
  source: IntegrationSource;
}

export type ReminderTrigger =
  | TimeReminderTrigger
  | LocationReminderTrigger
  | IntegrationReminderTrigger;

export interface VoiceReminder {
  id: string;
  createdAtISO: string;
  associationPhrase: string;
  audioUri: string;
  trigger: ReminderTrigger;
  lastTriggeredAtISO?: string;
}

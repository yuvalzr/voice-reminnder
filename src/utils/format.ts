import type { VoiceReminder } from "../types/reminder";

export function formatDateTime(isoDate: string): string {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return "Invalid date";
  }
  return parsed.toLocaleString();
}

export function formatTrigger(reminder: VoiceReminder): string {
  switch (reminder.trigger.type) {
    case "time":
      return `Time: ${formatDateTime(reminder.trigger.atISO)}`;
    case "location":
      return `Location: (${reminder.trigger.latitude.toFixed(5)}, ${reminder.trigger.longitude.toFixed(5)}) within ${reminder.trigger.radiusMeters}m`;
    case "integration":
      return `Integration: ${reminder.trigger.source}:${reminder.trigger.eventKey}`;
    default:
      return "Unknown trigger";
  }
}

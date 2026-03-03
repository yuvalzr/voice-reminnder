import AsyncStorage from "@react-native-async-storage/async-storage";

import type { VoiceReminder } from "../types/reminder";

const REMINDER_STORAGE_KEY = "voice-reminder:items";

export async function loadReminders(): Promise<VoiceReminder[]> {
  const rawValue = await AsyncStorage.getItem(REMINDER_STORAGE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as VoiceReminder[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch {
    return [];
  }
}

export async function saveReminders(reminders: VoiceReminder[]): Promise<void> {
  await AsyncStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(reminders));
}

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { VoiceReminder } from '../types/reminder';

const REMINDER_STORAGE_KEY = 'voice-reminder:items';
const reminderSubscribers = new Set<(reminders: VoiceReminder[]) => void>();

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
  for (const subscriber of reminderSubscribers) {
    subscriber(reminders);
  }
}

export function subscribeReminders(
  subscriber: (reminders: VoiceReminder[]) => void,
): () => void {
  reminderSubscribers.add(subscriber);
  return () => {
    reminderSubscribers.delete(subscriber);
  };
}

import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import { triggerIntegrationReminders } from '@/src/services/reminderEngine';
import { loadReminders, saveReminders, subscribeReminders } from '@/src/services/storage';
import type { IntegrationSource, VoiceReminder } from '@/src/types/reminder';

const INTEGRATION_SOURCES: IntegrationSource[] = ['iot', 'calendar', 'bluetooth', 'nfc', 'custom'];

export default function IntegrationScreen() {
  const [manualEventKey, setManualEventKey] = useState('');
  const [manualEventSource, setManualEventSource] = useState<IntegrationSource>('custom');
  const [integrationReminderCount, setIntegrationReminderCount] = useState(0);
  const [totalReminderCount, setTotalReminderCount] = useState(0);

  const inputBackground = useThemeColor({ light: '#f8fafc', dark: '#0f172a' }, 'background');
  const inputTextColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({ light: '#cbd5e1', dark: '#334155' }, 'icon');
  const mutedText = useThemeColor({ light: '#64748b', dark: '#94a3b8' }, 'icon');
  const buttonPrimary = useThemeColor({ light: '#0a7ea4', dark: '#38bdf8' }, 'tint');

  const refreshCounts = useCallback(async () => {
    const reminders = await loadReminders();
    updateCounts(reminders, setTotalReminderCount, setIntegrationReminderCount);
  }, []);

  useEffect(() => {
    void refreshCounts();
  }, [refreshCounts]);

  useEffect(() => {
    const unsubscribe = subscribeReminders((reminders) => {
      updateCounts(reminders, setTotalReminderCount, setIntegrationReminderCount);
    });
    return unsubscribe;
  }, []);

  const handleManualTrigger = useCallback(async () => {
    const eventKey = manualEventKey.trim();
    if (!eventKey) {
      Alert.alert('Missing event key', 'Provide an event key before triggering an integration.');
      return;
    }

    const reminders = await loadReminders();
    const result = await triggerIntegrationReminders(reminders, eventKey, manualEventSource);
    if (result.triggeredCount === 0) {
      Alert.alert(
        'No reminders matched',
        'No integration reminders matched this event key and source.',
      );
      return;
    }

    await saveReminders(result.reminders);
    Alert.alert('Triggered', `${result.triggeredCount} reminder(s) were triggered.`);
  }, [manualEventKey, manualEventSource]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="title">Integrations</ThemedText>
      <ThemedText style={[styles.helperText, { color: mutedText }]}>
        External systems can trigger reminders by opening a deep link or by calling a bridge in your
        own app.
      </ThemedText>

      <ThemedView style={[styles.card, { borderColor }]}>
        <ThemedText type="subtitle">Deep-link trigger format</ThemedText>
        <ThemedText style={[styles.codeText, { color: mutedText }]}>
          voicereminder://trigger/&lt;eventKey&gt;?source=&lt;iot|calendar|bluetooth|nfc|custom&gt;
        </ThemedText>
        <ThemedText style={[styles.helperText, { color: mutedText }]}>
          Example: voicereminder://trigger/garage-opened?source=iot
        </ThemedText>
      </ThemedView>

      <ThemedView style={[styles.card, { borderColor }]}>
        <ThemedText type="subtitle">Manual integration simulation</ThemedText>
        <TextInput
          value={manualEventKey}
          onChangeText={setManualEventKey}
          placeholder="Event key (example: garage-opened)"
          placeholderTextColor={mutedText}
          style={[
            styles.input,
            { backgroundColor: inputBackground, color: inputTextColor, borderColor },
          ]}
        />
        <View style={styles.row}>
          {INTEGRATION_SOURCES.map((sourceOption) => (
            <Pressable
              key={sourceOption}
              onPress={() => setManualEventSource(sourceOption)}
              style={[
                styles.pill,
                {
                  borderColor,
                  backgroundColor: manualEventSource === sourceOption ? buttonPrimary : 'transparent',
                },
              ]}>
              <ThemedText style={styles.pillText}>{sourceOption}</ThemedText>
            </Pressable>
          ))}
        </View>

        <Pressable onPress={() => void handleManualTrigger()} style={[styles.button, { backgroundColor: buttonPrimary }]}>
          <ThemedText style={styles.buttonText}>Trigger external event</ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedView style={[styles.card, { borderColor }]}>
        <ThemedText type="subtitle">Current reminder stats</ThemedText>
        <ThemedText style={[styles.helperText, { color: mutedText }]}>
          Total reminders: {totalReminderCount}
        </ThemedText>
        <ThemedText style={[styles.helperText, { color: mutedText }]}>
          Integration reminders: {integrationReminderCount}
        </ThemedText>
      </ThemedView>
    </ScrollView>
  );
}

function updateCounts(
  reminders: VoiceReminder[],
  setTotalReminderCount: (count: number) => void,
  setIntegrationReminderCount: (count: number) => void,
) {
  setTotalReminderCount(reminders.length);
  setIntegrationReminderCount(reminders.filter((item) => item.trigger.type === 'integration').length);
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 44,
    gap: 14,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  helperText: {
    lineHeight: 18,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillText: {
    textTransform: 'capitalize',
  },
  button: {
    borderRadius: 8,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  buttonText: {
    color: '#f8fafc',
    fontWeight: '600',
  },
});

import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useThemeColor } from '@/hooks/use-theme-color';
import {
  cancelTimeReminderNotification,
  requestLocationPermissionsForGeofencing,
  scheduleTimeReminderNotification,
} from '@/src/services/reminderEngine';
import { loadReminders, saveReminders, subscribeReminders } from '@/src/services/storage';
import type { IntegrationSource, ReminderTriggerType, VoiceReminder } from '@/src/types/reminder';
import { formatDateTime, formatTrigger } from '@/src/utils/format';

const INTEGRATION_SOURCES: IntegrationSource[] = ['iot', 'calendar', 'bluetooth', 'nfc', 'custom'];

function createReminderId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function ReminderScreen() {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const playbackRef = useRef<Audio.Sound | null>(null);

  const [reminders, setReminders] = useState<VoiceReminder[]>([]);
  const [isHydrating, setIsHydrating] = useState(true);
  const [isRecording, setIsRecording] = useState(false);

  const [associationPhrase, setAssociationPhrase] = useState('');
  const [recordedUri, setRecordedUri] = useState<string | null>(null);

  const [triggerType, setTriggerType] = useState<ReminderTriggerType>('time');
  const [reminderTime, setReminderTime] = useState<Date>(new Date(Date.now() + 5 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [latitudeInput, setLatitudeInput] = useState('');
  const [longitudeInput, setLongitudeInput] = useState('');
  const [radiusInput, setRadiusInput] = useState('100');

  const [integrationEventKey, setIntegrationEventKey] = useState('');
  const [integrationSource, setIntegrationSource] = useState<IntegrationSource>('custom');

  const inputBackground = useThemeColor({ light: '#f8fafc', dark: '#0f172a' }, 'background');
  const inputTextColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({ light: '#cbd5e1', dark: '#334155' }, 'icon');
  const mutedText = useThemeColor({ light: '#64748b', dark: '#94a3b8' }, 'icon');
  const buttonPrimary = useThemeColor({ light: '#0a7ea4', dark: '#38bdf8' }, 'tint');

  const refreshReminders = useCallback(async () => {
    const loaded = await loadReminders();
    setReminders(loaded);
    setIsHydrating(false);
  }, []);

  useEffect(() => {
    void refreshReminders();
  }, [refreshReminders]);

  useFocusEffect(
    useCallback(() => {
      void refreshReminders();
    }, [refreshReminders]),
  );

  useEffect(() => {
    const unsubscribe = subscribeReminders((nextReminders) => {
      setReminders(nextReminders);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    return () => {
      if (playbackRef.current) {
        void playbackRef.current.unloadAsync();
      }
    };
  }, []);

  const reminderCount = useMemo(() => reminders.length, [reminders]);

  const persistReminders = useCallback(async (nextReminders: VoiceReminder[]) => {
    setReminders(nextReminders);
    await saveReminders(nextReminders);
  }, []);

  const clearDraft = useCallback(() => {
    setAssociationPhrase('');
    setRecordedUri(null);
    setReminderTime(new Date(Date.now() + 5 * 60 * 1000));
    setLatitudeInput('');
    setLongitudeInput('');
    setRadiusInput('100');
    setIntegrationEventKey('');
    setIntegrationSource('custom');
    setTriggerType('time');
  }, []);

  const handleRecordStart = useCallback(async () => {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Microphone required', 'Allow microphone access to record voice reminders.');
      return;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await recording.startAsync();

    recordingRef.current = recording;
    setIsRecording(true);
  }, []);

  const handleRecordStop = useCallback(async () => {
    const activeRecording = recordingRef.current;
    if (!activeRecording) {
      return;
    }

    await activeRecording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });

    const uri = activeRecording.getURI();
    recordingRef.current = null;
    setIsRecording(false);

    if (!uri) {
      Alert.alert('Recording failed', 'Unable to access the saved audio.');
      return;
    }
    setRecordedUri(uri);
  }, []);

  const handleUseCurrentLocation = useCallback(async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Location required', 'Allow location access to use your current coordinates.');
      return;
    }
    const current = await Location.getCurrentPositionAsync({});
    setLatitudeInput(current.coords.latitude.toFixed(6));
    setLongitudeInput(current.coords.longitude.toFixed(6));
  }, []);

  const handleSaveReminder = useCallback(async () => {
    if (!recordedUri) {
      Alert.alert('Record a message', 'Record audio before saving the reminder.');
      return;
    }
    if (!associationPhrase.trim()) {
      Alert.alert('Association missing', 'Enter a phrase that includes reminder context.');
      return;
    }

    let reminder: VoiceReminder;

    if (triggerType === 'time') {
      if (reminderTime.getTime() <= Date.now()) {
        Alert.alert('Invalid time', 'Choose a time in the future.');
        return;
      }

      reminder = {
        id: createReminderId(),
        createdAtISO: new Date().toISOString(),
        associationPhrase: associationPhrase.trim(),
        audioUri: recordedUri,
        trigger: {
          type: 'time',
          atISO: reminderTime.toISOString(),
        },
      };

      const notificationId = await scheduleTimeReminderNotification(reminder);
      if (notificationId && reminder.trigger.type === 'time') {
        reminder = {
          ...reminder,
          trigger: {
            ...reminder.trigger,
            notificationId,
          },
        };
      }
    } else if (triggerType === 'location') {
      const latitude = Number.parseFloat(latitudeInput);
      const longitude = Number.parseFloat(longitudeInput);
      const radiusMeters = Number.parseInt(radiusInput, 10);
      if (
        Number.isNaN(latitude) ||
        Number.isNaN(longitude) ||
        Number.isNaN(radiusMeters) ||
        radiusMeters <= 0
      ) {
        Alert.alert('Invalid location', 'Provide valid latitude, longitude, and radius.');
        return;
      }

      const permissionGranted = await requestLocationPermissionsForGeofencing();
      if (!permissionGranted) {
        Alert.alert(
          'Permission denied',
          'Background location permission is required for location reminders.',
        );
        return;
      }

      reminder = {
        id: createReminderId(),
        createdAtISO: new Date().toISOString(),
        associationPhrase: associationPhrase.trim(),
        audioUri: recordedUri,
        trigger: {
          type: 'location',
          latitude,
          longitude,
          radiusMeters,
        },
      };
    } else {
      const eventKey = integrationEventKey.trim();
      if (!eventKey) {
        Alert.alert('Integration key missing', 'Provide an external integration event key.');
        return;
      }

      reminder = {
        id: createReminderId(),
        createdAtISO: new Date().toISOString(),
        associationPhrase: associationPhrase.trim(),
        audioUri: recordedUri,
        trigger: {
          type: 'integration',
          eventKey,
          source: integrationSource,
        },
      };
    }

    await persistReminders([reminder, ...reminders]);
    clearDraft();
    Alert.alert('Saved', 'Voice reminder saved.');
  }, [
    associationPhrase,
    clearDraft,
    integrationEventKey,
    integrationSource,
    latitudeInput,
    longitudeInput,
    persistReminders,
    radiusInput,
    recordedUri,
    reminderTime,
    reminders,
    triggerType,
  ]);

  const handlePlayReminder = useCallback(async (target: VoiceReminder) => {
    if (playbackRef.current) {
      await playbackRef.current.unloadAsync();
      playbackRef.current = null;
    }

    const { sound } = await Audio.Sound.createAsync({ uri: target.audioUri }, { shouldPlay: true });
    playbackRef.current = sound;
    sound.setOnPlaybackStatusUpdate((status: AVPlaybackStatus) => {
      if (!status.isLoaded || !status.didJustFinish) {
        return;
      }
      void sound.unloadAsync();
      if (playbackRef.current === sound) {
        playbackRef.current = null;
      }
    });
  }, []);

  const handleDeleteReminder = useCallback(
    (target: VoiceReminder) => {
      Alert.alert('Delete reminder?', 'This action cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await cancelTimeReminderNotification(target);
              const nextReminders = reminders.filter((item) => item.id !== target.id);
              await persistReminders(nextReminders);
            })();
          },
        },
      ]);
    },
    [persistReminders, reminders],
  );

  const onDateChange = useCallback((_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      setReminderTime(selectedDate);
    }
  }, []);

  if (isHydrating) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Loading reminders...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText type="title">Voice reminders</ThemedText>
      <ThemedText style={[styles.helperText, { color: mutedText }]}>
        Record a phrase that includes the association context, then choose a trigger type.
      </ThemedText>

      <ThemedView style={[styles.card, { borderColor }]}>
        <ThemedText type="subtitle">1) Record and describe</ThemedText>
        <TextInput
          value={associationPhrase}
          onChangeText={setAssociationPhrase}
          placeholder="Example: Remind me to call Alex when I leave work at 6 PM"
          placeholderTextColor={mutedText}
          style={[
            styles.input,
            { backgroundColor: inputBackground, color: inputTextColor, borderColor },
          ]}
          multiline
        />
        <Pressable
          onPress={isRecording ? handleRecordStop : handleRecordStart}
          style={[
            styles.button,
            {
              backgroundColor: isRecording ? '#ea580c' : buttonPrimary,
            },
          ]}>
          <ThemedText style={styles.buttonText}>
            {isRecording ? 'Stop recording' : 'Start recording'}
          </ThemedText>
        </Pressable>
        {recordedUri ? <ThemedText style={[styles.helperText, { color: mutedText }]}>Audio captured.</ThemedText> : null}
      </ThemedView>

      <ThemedView style={[styles.card, { borderColor }]}>
        <ThemedText type="subtitle">2) Trigger type</ThemedText>
        <View style={styles.row}>
          {(['time', 'location', 'integration'] as ReminderTriggerType[]).map((typeOption) => (
            <Pressable
              key={typeOption}
              onPress={() => setTriggerType(typeOption)}
              style={[
                styles.pill,
                {
                  borderColor,
                  backgroundColor: triggerType === typeOption ? buttonPrimary : 'transparent',
                },
              ]}>
              <ThemedText style={styles.pillText}>{typeOption}</ThemedText>
            </Pressable>
          ))}
        </View>

        {triggerType === 'time' ? (
          <View style={styles.triggerBlock}>
            <ThemedText style={[styles.helperText, { color: mutedText }]}>
              Scheduled for: {formatDateTime(reminderTime.toISOString())}
            </ThemedText>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={[styles.button, { backgroundColor: buttonPrimary }]}>
              <ThemedText style={styles.buttonText}>Pick date and time</ThemedText>
            </Pressable>
            {showDatePicker ? (
              <DateTimePicker value={reminderTime} mode="datetime" onChange={onDateChange} />
            ) : null}
          </View>
        ) : null}

        {triggerType === 'location' ? (
          <View style={styles.triggerBlock}>
            <Pressable
              onPress={handleUseCurrentLocation}
              style={[styles.button, { backgroundColor: buttonPrimary }]}>
              <ThemedText style={styles.buttonText}>Use current location</ThemedText>
            </Pressable>
            <TextInput
              value={latitudeInput}
              onChangeText={setLatitudeInput}
              placeholder="Latitude"
              placeholderTextColor={mutedText}
              keyboardType="numeric"
              style={[
                styles.input,
                { backgroundColor: inputBackground, color: inputTextColor, borderColor },
              ]}
            />
            <TextInput
              value={longitudeInput}
              onChangeText={setLongitudeInput}
              placeholder="Longitude"
              placeholderTextColor={mutedText}
              keyboardType="numeric"
              style={[
                styles.input,
                { backgroundColor: inputBackground, color: inputTextColor, borderColor },
              ]}
            />
            <TextInput
              value={radiusInput}
              onChangeText={setRadiusInput}
              placeholder="Radius (meters)"
              placeholderTextColor={mutedText}
              keyboardType="numeric"
              style={[
                styles.input,
                { backgroundColor: inputBackground, color: inputTextColor, borderColor },
              ]}
            />
          </View>
        ) : null}

        {triggerType === 'integration' ? (
          <View style={styles.triggerBlock}>
            <TextInput
              value={integrationEventKey}
              onChangeText={setIntegrationEventKey}
              placeholder="Integration event key (example: garage-opened)"
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
                  onPress={() => setIntegrationSource(sourceOption)}
                  style={[
                    styles.pill,
                    {
                      borderColor,
                      backgroundColor: integrationSource === sourceOption ? buttonPrimary : 'transparent',
                    },
                  ]}>
                  <ThemedText style={styles.pillText}>{sourceOption}</ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <Pressable onPress={handleSaveReminder} style={[styles.button, { backgroundColor: buttonPrimary }]}>
          <ThemedText style={styles.buttonText}>Save voice reminder</ThemedText>
        </Pressable>
      </ThemedView>

      <ThemedView style={[styles.card, { borderColor }]}>
        <ThemedText type="subtitle">Saved reminders ({reminderCount})</ThemedText>
        {reminders.length === 0 ? (
          <ThemedText style={[styles.helperText, { color: mutedText }]}>No reminders yet.</ThemedText>
        ) : null}
        {reminders.map((item) => (
          <View key={item.id} style={[styles.reminderRow, { borderColor }]}>
            <ThemedText type="defaultSemiBold">{item.associationPhrase}</ThemedText>
            <ThemedText style={[styles.helperText, { color: mutedText }]}>{formatTrigger(item)}</ThemedText>
            <ThemedText style={[styles.helperText, { color: mutedText }]}>
              Created: {formatDateTime(item.createdAtISO)}
            </ThemedText>
            {item.lastTriggeredAtISO ? (
              <ThemedText style={[styles.helperText, { color: mutedText }]}>
                Last triggered: {formatDateTime(item.lastTriggeredAtISO)}
              </ThemedText>
            ) : null}
            <View style={styles.row}>
              <Pressable
                onPress={() => void handlePlayReminder(item)}
                style={[styles.button, styles.inlineButton, { backgroundColor: buttonPrimary }]}>
                <ThemedText style={styles.buttonText}>Play</ThemedText>
              </Pressable>
              <Pressable
                onPress={() => handleDeleteReminder(item)}
                style={[styles.button, styles.inlineButton, { backgroundColor: '#b91c1c' }]}>
                <ThemedText style={styles.buttonText}>Delete</ThemedText>
              </Pressable>
            </View>
          </View>
        ))}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 44,
    gap: 14,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
  helperText: {
    lineHeight: 18,
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
  triggerBlock: {
    gap: 8,
  },
  reminderRow: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    gap: 6,
  },
  inlineButton: {
    flex: 1,
  },
});

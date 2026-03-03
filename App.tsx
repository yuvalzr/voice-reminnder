import "./src/services/geofenceTask";

import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Audio, type AVPlaybackStatus } from "expo-av";
import * as Linking from "expo-linking";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  cancelTimeReminderNotification,
  configureNotificationLayer,
  parseIntegrationTriggerUrl,
  requestLocationPermissionsForGeofencing,
  requestNotificationPermission,
  scheduleTimeReminderNotification,
  syncLocationGeofencing,
  triggerIntegrationReminders,
} from "./src/services/reminderEngine";
import { loadReminders, saveReminders } from "./src/services/storage";
import type {
  IntegrationSource,
  ReminderTriggerType,
  VoiceReminder,
} from "./src/types/reminder";
import { formatDateTime, formatTrigger } from "./src/utils/format";

const INTEGRATION_SOURCES: IntegrationSource[] = [
  "iot",
  "calendar",
  "bluetooth",
  "nfc",
  "custom",
];

function createReminderId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function App() {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const playbackRef = useRef<Audio.Sound | null>(null);

  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isRecording, setIsRecording] = useState(false);

  const [reminders, setReminders] = useState<VoiceReminder[]>([]);

  const [associationPhrase, setAssociationPhrase] = useState("");
  const [recordedUri, setRecordedUri] = useState<string | null>(null);

  const [triggerType, setTriggerType] = useState<ReminderTriggerType>("time");

  const [reminderTime, setReminderTime] = useState<Date>(
    new Date(Date.now() + 5 * 60 * 1000),
  );
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [latitudeInput, setLatitudeInput] = useState("");
  const [longitudeInput, setLongitudeInput] = useState("");
  const [radiusInput, setRadiusInput] = useState("100");

  const [integrationEventKey, setIntegrationEventKey] = useState("");
  const [integrationSource, setIntegrationSource] =
    useState<IntegrationSource>("custom");

  const [manualEventKey, setManualEventKey] = useState("");
  const [manualEventSource, setManualEventSource] =
    useState<IntegrationSource>("custom");

  const reminderCount = useMemo(() => reminders.length, [reminders]);

  const persistReminders = useCallback(async (nextReminders: VoiceReminder[]) => {
    setReminders(nextReminders);
    await saveReminders(nextReminders);
    await syncLocationGeofencing(nextReminders);
  }, []);

  const markReminderTriggered = useCallback(async (reminderId: string) => {
    const nowISO = new Date().toISOString();
    setReminders((current) => {
      let changed = false;
      const next = current.map((item) => {
        if (item.id !== reminderId) {
          return item;
        }
        changed = true;
        return {
          ...item,
          lastTriggeredAtISO: nowISO,
        };
      });
      if (changed) {
        void saveReminders(next);
      }
      return next;
    });
  }, []);

  const triggerIntegrationEvent = useCallback(
    async (eventKey: string, source?: IntegrationSource, showAlerts = true) => {
      if (!eventKey.trim()) {
        if (showAlerts) {
          Alert.alert("Missing event key", "Enter an integration event key.");
        }
        return;
      }

      const triggerResult = await triggerIntegrationReminders(
        reminders,
        eventKey,
        source,
      );
      if (triggerResult.triggeredCount === 0) {
        if (showAlerts) {
          Alert.alert(
            "No reminders matched",
            "No integration reminder matched this event key/source.",
          );
        }
        return;
      }

      await persistReminders(triggerResult.reminders);
      if (showAlerts) {
        Alert.alert(
          "Reminder triggered",
          `${triggerResult.triggeredCount} reminder(s) triggered from integration event "${eventKey}".`,
        );
      }
    },
    [persistReminders, reminders],
  );

  const handleIntegrationUrl = useCallback(
    async (url: string) => {
      const parsed = parseIntegrationTriggerUrl(url);
      if (!parsed) {
        return;
      }
      await triggerIntegrationEvent(parsed.eventKey, parsed.source, false);
    },
    [triggerIntegrationEvent],
  );

  useEffect(() => {
    const bootstrapAsync = async (): Promise<void> => {
      await configureNotificationLayer();
      await requestNotificationPermission();

      const loadedReminders = await loadReminders();
      setReminders(loadedReminders);
      await syncLocationGeofencing(loadedReminders);

      setIsBootstrapping(false);
    };

    void bootstrapAsync();
  }, []);

  useEffect(() => {
    const notificationReceivedSubscription =
      Notifications.addNotificationReceivedListener((notification) => {
        const reminderId = notification.request.content.data?.reminderId;
        if (typeof reminderId === "string") {
          void markReminderTriggered(reminderId);
        }
      });

    const notificationResponseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const reminderId = response.notification.request.content.data?.reminderId;
        if (typeof reminderId === "string") {
          void markReminderTriggered(reminderId);
        }
      });

    const linkingSubscription = Linking.addEventListener("url", ({ url }) => {
      void handleIntegrationUrl(url);
    });

    void Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) {
        void handleIntegrationUrl(initialUrl);
      }
    });

    return () => {
      notificationReceivedSubscription.remove();
      notificationResponseSubscription.remove();
      linkingSubscription.remove();
    };
  }, [handleIntegrationUrl, markReminderTriggered]);

  useEffect(() => {
    return () => {
      if (playbackRef.current) {
        void playbackRef.current.unloadAsync();
      }
    };
  }, []);

  const handleRecordStart = useCallback(async () => {
    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Microphone required", "Allow microphone access to record.");
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
      Alert.alert("Recording failed", "Unable to read the recorded audio.");
      return;
    }
    setRecordedUri(uri);
  }, []);

  const handleUseCurrentLocation = useCallback(async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Location required", "Allow location access to fill coordinates.");
      return;
    }

    const currentPosition = await Location.getCurrentPositionAsync({});
    setLatitudeInput(currentPosition.coords.latitude.toFixed(6));
    setLongitudeInput(currentPosition.coords.longitude.toFixed(6));
  }, []);

  const clearDraft = useCallback(() => {
    setAssociationPhrase("");
    setRecordedUri(null);
    setReminderTime(new Date(Date.now() + 5 * 60 * 1000));
    setLatitudeInput("");
    setLongitudeInput("");
    setRadiusInput("100");
    setIntegrationEventKey("");
    setIntegrationSource("custom");
    setTriggerType("time");
  }, []);

  const handleSaveReminder = useCallback(async () => {
    if (!recordedUri) {
      Alert.alert("Record a message", "Record audio before saving.");
      return;
    }
    if (!associationPhrase.trim()) {
      Alert.alert(
        "Association missing",
        "Describe the reminder content and trigger context.",
      );
      return;
    }

    let reminder: VoiceReminder;
    if (triggerType === "time") {
      if (reminderTime.getTime() <= Date.now()) {
        Alert.alert("Invalid time", "Choose a future time.");
        return;
      }

      reminder = {
        id: createReminderId(),
        createdAtISO: new Date().toISOString(),
        associationPhrase: associationPhrase.trim(),
        audioUri: recordedUri,
        trigger: {
          type: "time",
          atISO: reminderTime.toISOString(),
        },
      };

      const notificationId = await scheduleTimeReminderNotification(reminder);
      if (notificationId && reminder.trigger.type === "time") {
        reminder = {
          ...reminder,
          trigger: {
            ...reminder.trigger,
            notificationId,
          },
        };
      }
    } else if (triggerType === "location") {
      const latitude = Number.parseFloat(latitudeInput);
      const longitude = Number.parseFloat(longitudeInput);
      const radiusMeters = Number.parseInt(radiusInput, 10);
      if (
        Number.isNaN(latitude) ||
        Number.isNaN(longitude) ||
        Number.isNaN(radiusMeters)
      ) {
        Alert.alert(
          "Invalid location",
          "Provide valid latitude, longitude, and radius values.",
        );
        return;
      }

      const locationPermission = await requestLocationPermissionsForGeofencing();
      if (!locationPermission) {
        Alert.alert(
          "Permission denied",
          "Background location permission is required for geofence reminders.",
        );
        return;
      }

      reminder = {
        id: createReminderId(),
        createdAtISO: new Date().toISOString(),
        associationPhrase: associationPhrase.trim(),
        audioUri: recordedUri,
        trigger: {
          type: "location",
          latitude,
          longitude,
          radiusMeters,
        },
      };
    } else {
      const eventKey = integrationEventKey.trim();
      if (!eventKey) {
        Alert.alert(
          "Integration key missing",
          "Provide an event key for this integration reminder.",
        );
        return;
      }

      reminder = {
        id: createReminderId(),
        createdAtISO: new Date().toISOString(),
        associationPhrase: associationPhrase.trim(),
        audioUri: recordedUri,
        trigger: {
          type: "integration",
          eventKey,
          source: integrationSource,
        },
      };
    }

    const nextReminders = [reminder, ...reminders];
    await persistReminders(nextReminders);
    clearDraft();
    Alert.alert("Saved", "Voice reminder saved.");
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

  const handleDeleteReminder = useCallback(
    (target: VoiceReminder) => {
      Alert.alert("Delete reminder?", "This action cannot be undone.", [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              await cancelTimeReminderNotification(target);
              const next = reminders.filter((item) => item.id !== target.id);
              await persistReminders(next);
            })();
          },
        },
      ]);
    },
    [persistReminders, reminders],
  );

  const handlePlayReminder = useCallback(async (target: VoiceReminder) => {
    if (playbackRef.current) {
      await playbackRef.current.unloadAsync();
      playbackRef.current = null;
    }

    const { sound } = await Audio.Sound.createAsync(
      { uri: target.audioUri },
      { shouldPlay: true },
    );
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

  const onDateChange = useCallback(
    (_event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS === "android") {
        setShowDatePicker(false);
      }
      if (selectedDate) {
        setReminderTime(selectedDate);
      }
    },
    [],
  );

  if (isBootstrapping) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.heading}>Loading voice reminder engine...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Voice Reminder System</Text>
      <Text style={styles.subtitle}>
        Record a full reminder phrase including association details (for example:
        {" "}
        "Pick up package when I get home at 6 PM").
      </Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>1) Record reminder message</Text>
        <TextInput
          value={associationPhrase}
          onChangeText={setAssociationPhrase}
          placeholder="Reminder phrase with context"
          style={styles.input}
          multiline
        />

        <Pressable
          onPress={isRecording ? handleRecordStop : handleRecordStart}
          style={[styles.button, isRecording ? styles.warningButton : styles.primaryButton]}
        >
          <Text style={styles.buttonText}>
            {isRecording ? "Stop recording" : "Start recording"}
          </Text>
        </Pressable>

        {recordedUri ? (
          <Text style={styles.helperText}>Audio captured and ready to save.</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>2) Choose trigger type</Text>
        <View style={styles.row}>
          {(["time", "location", "integration"] as ReminderTriggerType[]).map(
            (typeOption) => (
              <Pressable
                key={typeOption}
                onPress={() => setTriggerType(typeOption)}
                style={[
                  styles.pill,
                  triggerType === typeOption && styles.activePill,
                ]}
              >
                <Text
                  style={[
                    styles.pillLabel,
                    triggerType === typeOption && styles.activePillLabel,
                  ]}
                >
                  {typeOption}
                </Text>
              </Pressable>
            ),
          )}
        </View>

        {triggerType === "time" ? (
          <View style={styles.triggerBlock}>
            <Text style={styles.helperText}>
              Scheduled for: {formatDateTime(reminderTime.toISOString())}
            </Text>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              style={[styles.button, styles.secondaryButton]}
            >
              <Text style={styles.buttonText}>Pick date and time</Text>
            </Pressable>
            {showDatePicker ? (
              <DateTimePicker
                value={reminderTime}
                mode="datetime"
                onChange={onDateChange}
              />
            ) : null}
          </View>
        ) : null}

        {triggerType === "location" ? (
          <View style={styles.triggerBlock}>
            <Pressable
              onPress={handleUseCurrentLocation}
              style={[styles.button, styles.secondaryButton]}
            >
              <Text style={styles.buttonText}>Use current location</Text>
            </Pressable>

            <TextInput
              value={latitudeInput}
              onChangeText={setLatitudeInput}
              placeholder="Latitude"
              keyboardType="numeric"
              style={styles.input}
            />
            <TextInput
              value={longitudeInput}
              onChangeText={setLongitudeInput}
              placeholder="Longitude"
              keyboardType="numeric"
              style={styles.input}
            />
            <TextInput
              value={radiusInput}
              onChangeText={setRadiusInput}
              placeholder="Radius (meters)"
              keyboardType="numeric"
              style={styles.input}
            />
          </View>
        ) : null}

        {triggerType === "integration" ? (
          <View style={styles.triggerBlock}>
            <TextInput
              value={integrationEventKey}
              onChangeText={setIntegrationEventKey}
              placeholder="External event key (example: door-opened)"
              style={styles.input}
            />

            <Text style={styles.helperText}>Integration source</Text>
            <View style={styles.row}>
              {INTEGRATION_SOURCES.map((sourceOption) => (
                <Pressable
                  key={sourceOption}
                  onPress={() => setIntegrationSource(sourceOption)}
                  style={[
                    styles.pill,
                    integrationSource === sourceOption && styles.activePill,
                  ]}
                >
                  <Text
                    style={[
                      styles.pillLabel,
                      integrationSource === sourceOption && styles.activePillLabel,
                    ]}
                  >
                    {sourceOption}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <Pressable
          onPress={handleSaveReminder}
          style={[styles.button, styles.primaryButton]}
        >
          <Text style={styles.buttonText}>Save voice reminder</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>3) External trigger gateway</Text>
        <Text style={styles.helperText}>
          Any external system can trigger via deep-link:
        </Text>
        <Text style={styles.codeText}>
          voicereminder://trigger/&lt;eventKey&gt;?source=&lt;iot|calendar|bluetooth|nfc|custom&gt;
        </Text>

        <TextInput
          value={manualEventKey}
          onChangeText={setManualEventKey}
          placeholder="Test event key"
          style={styles.input}
        />
        <View style={styles.row}>
          {INTEGRATION_SOURCES.map((sourceOption) => (
            <Pressable
              key={`manual-${sourceOption}`}
              onPress={() => setManualEventSource(sourceOption)}
              style={[
                styles.pill,
                manualEventSource === sourceOption && styles.activePill,
              ]}
            >
              <Text
                style={[
                  styles.pillLabel,
                  manualEventSource === sourceOption && styles.activePillLabel,
                ]}
              >
                {sourceOption}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={() =>
            void triggerIntegrationEvent(manualEventKey, manualEventSource, true)
          }
          style={[styles.button, styles.secondaryButton]}
        >
          <Text style={styles.buttonText}>Trigger external event</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Saved reminders ({reminderCount})</Text>
        {reminders.length === 0 ? (
          <Text style={styles.helperText}>No reminders saved yet.</Text>
        ) : null}

        {reminders.map((item) => (
          <View key={item.id} style={styles.reminderRow}>
            <Text style={styles.reminderPhrase}>{item.associationPhrase}</Text>
            <Text style={styles.helperText}>{formatTrigger(item)}</Text>
            <Text style={styles.helperText}>
              Created: {formatDateTime(item.createdAtISO)}
            </Text>
            {item.lastTriggeredAtISO ? (
              <Text style={styles.helperText}>
                Last triggered: {formatDateTime(item.lastTriggeredAtISO)}
              </Text>
            ) : null}

            <View style={styles.row}>
              <Pressable
                onPress={() => void handlePlayReminder(item)}
                style={[styles.button, styles.secondaryButton, styles.inlineButton]}
              >
                <Text style={styles.buttonText}>Play</Text>
              </Pressable>
              <Pressable
                onPress={() => handleDeleteReminder(item)}
                style={[styles.button, styles.dangerButton, styles.inlineButton]}
              >
                <Text style={styles.buttonText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 64,
    paddingHorizontal: 16,
    paddingBottom: 48,
    backgroundColor: "#0f172a",
    gap: 16,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#f8fafc",
  },
  subtitle: {
    color: "#cbd5e1",
    lineHeight: 20,
  },
  heading: {
    color: "#e2e8f0",
    fontSize: 18,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: "#334155",
  },
  sectionTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "600",
  },
  input: {
    borderColor: "#475569",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#f8fafc",
    backgroundColor: "#0f172a",
  },
  button: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    backgroundColor: "#2563eb",
  },
  secondaryButton: {
    backgroundColor: "#0891b2",
  },
  warningButton: {
    backgroundColor: "#ea580c",
  },
  dangerButton: {
    backgroundColor: "#b91c1c",
  },
  buttonText: {
    color: "#f8fafc",
    fontWeight: "600",
  },
  helperText: {
    color: "#cbd5e1",
  },
  codeText: {
    color: "#bae6fd",
    fontFamily: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
    fontSize: 12,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#475569",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  activePill: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  pillLabel: {
    color: "#cbd5e1",
    textTransform: "capitalize",
  },
  activePillLabel: {
    color: "#f8fafc",
  },
  triggerBlock: {
    gap: 8,
  },
  reminderRow: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 8,
    padding: 10,
    gap: 6,
    backgroundColor: "#0b1220",
  },
  reminderPhrase: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "600",
  },
  inlineButton: {
    flex: 1,
  },
});

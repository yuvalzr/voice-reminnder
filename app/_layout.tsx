import '@/src/services/geofenceTask';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  configureNotificationLayer,
  parseIntegrationTriggerUrl,
  requestNotificationPermission,
  syncLocationGeofencing,
  triggerIntegrationReminders,
} from '@/src/services/reminderEngine';
import { loadReminders, saveReminders, subscribeReminders } from '@/src/services/storage';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  const markReminderTriggered = useCallback(async (reminderId: string) => {
    const reminders = await loadReminders();
    const nowISO = new Date().toISOString();
    let changed = false;
    const updatedReminders = reminders.map((item) => {
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
      await saveReminders(updatedReminders);
    }
  }, []);

  const handleIntegrationUrl = useCallback(async (url: string) => {
    const parsed = parseIntegrationTriggerUrl(url);
    if (!parsed) {
      return;
    }
    const reminders = await loadReminders();
    const result = await triggerIntegrationReminders(
      reminders,
      parsed.eventKey,
      parsed.source,
    );
    if (result.triggeredCount > 0) {
      await saveReminders(result.reminders);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const bootstrapAsync = async () => {
      await configureNotificationLayer();
      await requestNotificationPermission();

      const reminders = await loadReminders();
      if (isMounted) {
        await syncLocationGeofencing(reminders);
      }

      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        await handleIntegrationUrl(initialUrl);
      }
    };

    void bootstrapAsync();
    return () => {
      isMounted = false;
    };
  }, [handleIntegrationUrl]);

  useEffect(() => {
    const unsubscribeReminders = subscribeReminders((reminders) => {
      void syncLocationGeofencing(reminders);
    });

    const notificationReceivedSubscription =
      Notifications.addNotificationReceivedListener((notification) => {
        const reminderId = notification.request.content.data?.reminderId;
        if (typeof reminderId === 'string') {
          void markReminderTriggered(reminderId);
        }
      });

    const notificationResponseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const reminderId = response.notification.request.content.data?.reminderId;
        if (typeof reminderId === 'string') {
          void markReminderTriggered(reminderId);
        }
      });

    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      void handleIntegrationUrl(url);
    });

    return () => {
      unsubscribeReminders();
      notificationReceivedSubscription.remove();
      notificationResponseSubscription.remove();
      linkingSubscription.remove();
    };
  }, [handleIntegrationUrl, markReminderTriggered]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

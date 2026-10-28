import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export const safeHaptic = {
  impact: async (style = Haptics.ImpactFeedbackStyle.Light) => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.impactAsync(style);
    } catch {
      // no-op if hardware unavailable
    }
  },
  notification: async (type = Haptics.NotificationFeedbackType.Success) => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.notificationAsync(type);
    } catch {
      // no-op if hardware unavailable
    }
  },
  selection: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.selectionAsync();
    } catch {
      // no-op if hardware unavailable
    }
  },
};

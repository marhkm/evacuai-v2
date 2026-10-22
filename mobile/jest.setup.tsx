import { configure } from '@testing-library/react-native';

// First test in a cold run includes Babel transform time; the 1 s default made it flaky.
configure({ asyncUtilTimeout: 5000 });

// Native @expo/ui views (SwiftUI / Compose) do not exist in Jest: plain React Native stand-ins with the same props.
jest.mock('@expo/ui', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text, View } = require('react-native');
  return {
    Host: ({ children }: { children: unknown }) => <View>{children}</View>,
    Column: ({ children }: { children: unknown }) => <View>{children}</View>,
    Text: ({ children }: { children: string }) => <Text>{children}</Text>,
    Button: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}><Text>{label}</Text></Pressable>
    ),
    Slider: ({ onValueChange, modifiers }: { onValueChange: (v: number) => void; modifiers?: { accessibilityLabel?: string }[] }) => (
      <Pressable accessibilityRole="adjustable" accessibilityLabel={modifiers?.find(m => m.accessibilityLabel)?.accessibilityLabel} onPress={() => onValueChange(2)} />
    ),
    BottomSheet: ({ isPresented, children }: { isPresented: boolean; children: unknown }) => (isPresented ? <View accessibilityLabel="sheet">{children}</View> : null),
  };
});
jest.mock('@expo/ui/swift-ui/modifiers', () => ({ accessibilityLabel: (label: string) => ({ accessibilityLabel: label }) }));
jest.mock('@expo/ui/jetpack-compose/modifiers', () => ({ semantics: (p: { contentDescription: string }) => ({ accessibilityLabel: p.contentDescription }) }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

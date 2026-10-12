import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const colors = { primary: '#1a7a3c', danger: '#c0392b', text: '#111', muted: '#555', card: '#f2f5f3', border: '#cfd8d3' };

export function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Field({ label, error, ...input }: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        placeholderTextColor={colors.muted}
        style={[styles.input, error ? styles.inputError : null]}
        {...input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function Button({ label, onPress, busy, variant = 'primary' }: {
  label: string; onPress: () => void; busy?: boolean; variant?: 'primary' | 'secondary' | 'danger';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      onPress={onPress}
      style={[styles.button, variant === 'secondary' && styles.secondary, variant === 'danger' && styles.dangerButton, busy && styles.busy]}
    >
      {busy ? <ActivityIndicator color="#fff" /> : (
        <Text style={[styles.buttonText, variant === 'secondary' && styles.secondaryText]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

export function Message({ text, kind = 'error' }: { text?: string | null; kind?: 'error' | 'info' }) {
  if (!text) return null;
  return <Text accessibilityLiveRegion="polite" style={kind === 'error' ? styles.error : styles.info}>{text}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  screen: { padding: 16, gap: 12, width: '100%', maxWidth: 480, alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '700', color: colors.primary, marginVertical: 12 },
  field: { gap: 4 },
  label: { fontSize: 15, color: colors.text, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 17, color: colors.text, minHeight: 48 },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 14 },
  info: { color: colors.primary, fontSize: 14 },
  button: { backgroundColor: colors.primary, borderRadius: 10, minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  secondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.primary },
  dangerButton: { backgroundColor: colors.danger },
  busy: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  secondaryText: { color: colors.primary },
  link: { color: colors.primary, fontSize: 16, textDecorationLine: 'underline', paddingVertical: 4 },
});

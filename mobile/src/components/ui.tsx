import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import type { CSSStyle } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedView, EASE_OUT, useReduced } from '@/lib/motion';
import { fonts, makeStyles, useTheme, type Palette } from '@/theme';

export function Screen({ title, children }: { title: string; children: ReactNode }) {
  const s = useStyles();
  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.screen} keyboardShouldPersistTaps="handled">
        <Text style={s.title} accessibilityRole="header">{title}</Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Field({ label, error, ...input }: TextInputProps & { label: string; error?: string }) {
  const s = useStyles();
  const c = useTheme();
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        placeholderTextColor={c.muted}
        style={[s.input, error ? s.inputError : null]}
        {...input}
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

type Variant = 'primary' | 'secondary' | 'danger' | 'safe';

/**
 * Signage buttons: condensed capitals, 52 pt tall (64 pt for `hero`). Colour carries meaning: `safe` (green) leads
 * out, `danger` (red) is SOS and hazards, `primary` (ink) is everything else, `secondary` is an outline.
 */
export function Button({ label, onPress, busy, variant = 'primary', a11yLabel, hero }: {
  label: string; onPress: () => void; busy?: boolean; variant?: Variant; a11yLabel?: string; hero?: boolean;
}) {
  const s = useStyles();
  const c = useTheme();
  const reduced = useReduced();
  const [pressed, setPressed] = useState(false);
  const outline = variant === 'secondary';
  // Feedback on press-in: shrink to 0.97 over 120 ms (opacity only with reduced motion), commit on release.
  const feedback = pressed ? (reduced ? { opacity: 0.8 } : { transform: [{ scale: 0.97 }] }) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      disabled={busy}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      pressRetentionOffset={16}
    >
      <AnimatedView testID="button-face" style={[s.button, s[variant], hero && s.hero, busy && s.dim, press, feedback]}>
        {busy ? <ActivityIndicator color={outline ? c.ink : buttonText(c, variant)} /> : (
          <Text style={[s.buttonText, hero && s.heroText, { color: outline ? c.ink : buttonText(c, variant) }]}>{label}</Text>
        )}
      </AnimatedView>
    </Pressable>
  );
}
const buttonText = (c: Palette, v: Variant) => (v === 'primary' ? c.surface : c.onColor);
const press: CSSStyle<ViewStyle> = { transitionProperty: ['transform', 'opacity'], transitionDuration: 120, transitionTimingFunction: EASE_OUT };

export function Link({ label, onPress }: { label: string; onPress: () => void }) {
  const s = useStyles();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8}>
      <Text style={s.link}>{label}</Text>
    </Pressable>
  );
}

export function Message({ text, kind = 'error' }: { text?: string | null; kind?: 'error' | 'info' }) {
  const s = useStyles();
  if (!text) return null;
  return <Text accessibilityLiveRegion="polite" style={kind === 'error' ? s.error : s.info}>{text}</Text>;
}

export type Tone = 'danger' | 'safe' | 'warning' | 'info' | 'neutral';

/** Status chip: SAFE, NEEDS HELP, UNKNOWN, BLOCKED, … in the colour of its meaning. */
export function Chip({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const s = useStyles();
  const c = useTheme();
  const fill = { danger: c.dangerFill, safe: c.safeFill, warning: c.drillFill, info: c.infoFill, neutral: c.surface3 }[tone];
  return <Text style={[s.chip, { backgroundColor: fill, color: tone === 'neutral' ? c.ink : c.onColor }]}>{label}</Text>;
}

/** Big condensed number with a label (Responder counters). */
export function Counter({ value, label, tone }: { value?: number | string; label: string; tone?: Exclude<Tone, 'neutral'> }) {
  const s = useStyles();
  const c = useTheme();
  return (
    <View style={s.counter} accessible accessibilityLabel={`${label}: ${value ?? 'loading'}`}>
      <Text style={[s.number, { color: tone ? c[tone] : c.ink }]}>{value ?? '–'}</Text>
      <Text style={s.counterLabel}>{label}</Text>
    </View>
  );
}

export function Card({ children, accent }: { children: ReactNode; accent?: Exclude<Tone, 'neutral'> }) {
  const s = useStyles();
  const c = useTheme();
  return <View style={[s.card, accent && { borderLeftWidth: 5, borderLeftColor: c[accent] }]}>{children}</View>;
}

/** Section heading inside a screen. */
export function Heading({ children }: { children: ReactNode }) {
  const s = useStyles();
  return <Text style={s.heading} accessibilityRole="header">{children}</Text>;
}

/** Body text in the theme colours (`muted` for secondary lines). */
export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  const s = useStyles();
  return <Text style={[muted ? s.muted : s.body, style]}>{children}</Text>;
}

const useStyles = makeStyles(c => ({
  page: { flex: 1, backgroundColor: c.surface },
  screen: { padding: 16, gap: 12, width: '100%', maxWidth: 480, alignSelf: 'center' },
  title: { fontFamily: fonts.display, fontSize: 32, color: c.ink, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 4 },
  heading: { fontFamily: fonts.display, fontSize: 21, color: c.ink, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 8 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: c.ink },
  muted: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: c.muted },
  field: { gap: 4 },
  label: { fontFamily: fonts.bodySemi, fontSize: 15, color: c.ink },
  input: { fontFamily: fonts.body, borderWidth: 1.5, borderColor: c.line, borderRadius: 10, padding: 12, fontSize: 17, color: c.ink, backgroundColor: c.surface, minHeight: 48 },
  inputError: { borderColor: c.danger },
  error: { fontFamily: fonts.bodySemi, color: c.danger, fontSize: 14 },
  info: { fontFamily: fonts.bodySemi, color: c.safeText, fontSize: 14 },
  button: { borderRadius: 10, minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primary: { backgroundColor: c.ink },
  secondary: { backgroundColor: 'transparent', borderWidth: 2, borderColor: c.ink },
  danger: { backgroundColor: c.dangerFill },
  safe: { backgroundColor: c.safeFill },
  hero: { minHeight: 72, borderRadius: 14 },
  dim: { opacity: 0.75 },
  buttonText: { fontFamily: fonts.display, fontSize: 19, letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'center' },
  heroText: { fontSize: 28, letterSpacing: 1.2 },
  link: { fontFamily: fonts.bodySemi, color: c.infoText, fontSize: 16, textDecorationLine: 'underline', paddingVertical: 4 },
  chip: { fontFamily: fonts.displaySemi, fontSize: 14, letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', alignSelf: 'flex-start' },
  counter: { flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, borderRadius: 12, backgroundColor: c.surface2 },
  number: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44 },
  counterLabel: { fontFamily: fonts.bodySemi, fontSize: 12, color: c.muted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.4 },
  card: { padding: 14, borderRadius: 12, backgroundColor: c.surface2, gap: 6 },
}));

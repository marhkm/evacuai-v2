import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { tap } from '@/lib/haptics';
import { fonts, makeStyles, useTheme } from '@/theme';

export type ChipItem = { key: string; label: string; a11yLabel?: string };
export type ChipTone = 'info' | 'danger' | 'safe' | 'warning' | 'ink';

/** Large single-choice buttons (44pt+ targets, selected state announced to screen readers). */
export function Chips({ items, active, onSelect, tone = 'info' }: {
  items: ChipItem[]; active: string | null; onSelect: (key: string) => void; tone?: ChipTone;
}) {
  const s = useStyles();
  const c = useTheme();
  const fill = { info: c.infoFill, danger: c.dangerFill, safe: c.safeFill, warning: c.drillFill, ink: c.ink }[tone];
  const line = { info: c.infoText, danger: c.danger, safe: c.safeText, warning: c.warningText, ink: c.ink }[tone];
  const onFill = tone === 'ink' ? c.surface : c.onColor;
  return (
    <View style={s.chips}>
      {items.map(i => {
        const on = i.key === active;
        return (
          <Pressable key={i.key} accessibilityRole="button" accessibilityLabel={i.a11yLabel ?? i.label} accessibilityState={{ selected: on }}
            onPress={() => { if (!on) tap(); onSelect(i.key); }} style={[s.chip, { borderColor: on ? fill : line }, on && { backgroundColor: fill }]}>
            <Text style={[s.text, { color: on ? onFill : line }]}>{i.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Section({ label, children }: { label: string; children: ReactNode }) {
  const s = useStyles();
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.label}>{label}</Text>
      {children}
    </View>
  );
}

const useStyles = makeStyles(c => ({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 22, borderWidth: 1.5 },
  text: { fontFamily: fonts.bodySemi, fontSize: 15 },
  label: { fontFamily: fonts.display, fontSize: 17, letterSpacing: 0.4, textTransform: 'uppercase', color: c.muted },
}));

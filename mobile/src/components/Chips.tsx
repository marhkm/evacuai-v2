import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/components/ui';

export type ChipItem = { key: string; label: string; a11yLabel?: string };

/** Large single-choice buttons (44pt+ targets, selected state announced to screen readers). */
export function Chips({ items, active, onSelect, color = colors.primary }: {
  items: ChipItem[]; active: string | null; onSelect: (key: string) => void; color?: string;
}) {
  return (
    <View style={styles.chips}>
      {items.map(i => {
        const on = i.key === active;
        return (
          <Pressable key={i.key} accessibilityRole="button" accessibilityLabel={i.a11yLabel ?? i.label} accessibilityState={{ selected: on }}
            onPress={() => onSelect(i.key)} style={[styles.chip, { borderColor: color }, on && { backgroundColor: color }]}>
            <Text style={[styles.text, { color: on ? '#fff' : color }]}>{i.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 22, borderWidth: 1 },
  text: { fontSize: 15, fontWeight: '600' },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
});

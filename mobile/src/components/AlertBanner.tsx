import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Defs, Line, Pattern, Rect } from 'react-native-svg';

import { AlertSheet } from '@/components/AlertSheet';
import { alertTitle, alertTranslations, type AlertItem } from '@/lib/alerts';
import { fonts, makeStyles, useTheme } from '@/theme';

/**
 * The alert "hero" band: full width in the hazard colour (red for a real emergency), with a diagonal stripe edge and
 * a DRILL tag when it is practice. Tapping opens the alert details.
 */
export function AlertBanner({ alert }: { alert: AlertItem }) {
  const s = useStyles();
  const c = useTheme();
  const drill = alert.is_drill;
  const [open, setOpen] = useState(false);
  return (
    <>
    <Pressable
      accessibilityRole="alert"
      accessibilityLabel={[alertTitle(alert), alert.message, ...alertTranslations(alert)].join('. ')}
      accessibilityHint="Shows the alert details"
      onPress={() => setOpen(true)}
      style={[s.banner, { backgroundColor: drill ? c.drillFill : c.dangerFill }]}
    >
      {drill ? (
        <Svg width="100%" height={10} style={s.stripes} accessible={false}>
          <Defs>
            <Pattern id="drill" width={16} height={10} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <Line x1={0} y1={0} x2={0} y2={10} stroke="#FFC23D" strokeWidth={8} />
            </Pattern>
          </Defs>
          <Rect width="100%" height={10} fill="url(#drill)" />
        </Svg>
      ) : null}
      <View style={s.body}>
        <Text style={s.title}>{alertTitle(alert)}</Text>
        <Text style={s.message}>{alert.message}</Text>
        {alertTranslations(alert).map(t => <Text key={t} style={s.translation}>{t}</Text>)}
      </View>
    </Pressable>
    {open ? <AlertSheet alert={alert} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

const useStyles = makeStyles(c => ({
  banner: { borderRadius: 14, overflow: 'hidden' },
  stripes: { opacity: 0.9 },
  body: { padding: 16, gap: 6 },
  title: { fontFamily: fonts.display, color: c.onColor, fontSize: 30, lineHeight: 32, letterSpacing: 0.8, textTransform: 'uppercase' },
  message: { fontFamily: fonts.bodySemi, color: c.onColor, fontSize: 17, lineHeight: 24 },
  translation: { fontFamily: fonts.body, color: c.onColor, fontSize: 15, lineHeight: 21, opacity: 0.92 },
}));

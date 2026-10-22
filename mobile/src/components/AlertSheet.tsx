import { BottomSheet, Button, Column, Host, Text } from '@expo/ui';
import { router } from 'expo-router';

import { alertTitle, alertTranslations, type AlertItem } from '@/lib/alerts';
import { light } from '@/lib/haptics';
import { fonts, useTheme } from '@/theme';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' }) : '');

/** An alert's full details in a native bottom sheet, with the way out one tap away. */
export function AlertSheet({ alert, onClose }: { alert: AlertItem; onClose: () => void }) {
  const c = useTheme();
  const go = (path: '/route' | '/alerts') => { onClose(); router.push(path); };
  return (
    <Host>
      <BottomSheet isPresented onDismiss={onClose}>
        <Column spacing={10}>
          <Text textStyle={{ fontFamily: fonts.display, fontSize: 28, color: alert.is_drill ? c.warningText : c.danger }}>{alertTitle(alert)}</Text>
          <Text textStyle={{ fontFamily: fonts.bodySemi, fontSize: 17, color: c.ink }}>{alert.message}</Text>
          {alertTranslations(alert).map(t => <Text key={t} textStyle={{ fontFamily: fonts.body, fontSize: 16, color: c.ink }}>{t}</Text>)}
          {alert.issued_at ? <Text textStyle={{ fontFamily: fonts.body, fontSize: 14, color: c.muted }}>{`Issued ${when(alert.issued_at)}`}</Text> : null}
          <Button label="Evacuate now" onPress={() => { light(); go('/route'); }} />
          <Button label="All alerts" variant="outlined" onPress={() => go('/alerts')} />
        </Column>
      </BottomSheet>
    </Host>
  );
}

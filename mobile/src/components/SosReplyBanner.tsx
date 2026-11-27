import { router, usePathname } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '@/lib/api';
import { isOfficer, useAuth } from '@/lib/auth';
import { subscribeSos } from '@/lib/realtime';
import { fonts, makeStyles } from '@/theme';

type Sos = { id: number; status: string; messages: { id: number; body: string; mine: boolean }[] };

/**
 * Students: "Safety officer replied" over any screen but the SOS chat while their SOS is open; tapping opens the chat.
 * Replies from before the app opened are left to the push. Nothing once the SOS is closed.
 */
export function SosReplyBanner() {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { token, state } = useAuth();
  const student = state.status === 'signedIn' && !isOfficer(state.user);
  const onChat = usePathname() === '/sos';
  const onChatRef = useRef(onChat);
  useEffect(() => { onChatRef.current = onChat; }, [onChat]);
  const [sos, setSos] = useState<Sos | null>(null);
  const [seen, setSeen] = useState<number | null>(null); // last officer message id the student has seen
  const reply = sos?.messages.filter(m => !m.mine).at(-1);

  const load = useCallback(() => {
    if (!token || !student) return;
    api<{ sos: Sos | null }>('/api/sos/current', { token }).then(r => {
      setSos(r.sos);
      const latest = r.sos?.messages.filter(m => !m.mine).at(-1)?.id ?? 0;
      setSeen(prev => (prev === null || onChatRef.current ? latest : prev));
    }).catch(() => undefined);
  }, [token, student]);
  useEffect(load, [load, onChat]); // leaving the chat (or sending a new SOS there) refetches

  const openId = sos && (sos.status === 'pending' || sos.status === 'acknowledged') ? sos.id : null;
  useEffect(() => {
    if (!openId || !token || onChat) return; // the chat screen keeps itself live
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    subscribeSos(openId, token, load).then(u => (cancelled ? u() : (unsubscribe = u))).catch(() => undefined);
    const sub = AppState.addEventListener('change', a => a === 'active' && load());
    return () => { cancelled = true; unsubscribe?.(); sub.remove(); };
  }, [openId, token, onChat, load]);

  if (!student || !openId || onChat || !reply || seen === null || reply.id <= seen) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLiveRegion="polite" accessibilityLabel={`Safety officer replied: ${reply.body}`}
      accessibilityHint="Opens the SOS chat" onPress={() => { setSeen(reply.id); router.push('/sos'); }}
      style={[s.banner, { top: insets.top + 8 }]}>
      <Text style={s.title}>Safety officer replied</Text>
      <Text style={s.body} numberOfLines={2}>{reply.body}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles(c => ({
  banner: { position: 'absolute', left: 12, right: 12, padding: 14, borderRadius: 12, backgroundColor: c.infoFill, gap: 2, elevation: 6, shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  title: { fontFamily: fonts.bodyBold, fontSize: 16, color: c.onColor },
  body: { fontFamily: fonts.body, fontSize: 15, color: c.onColor },
}));

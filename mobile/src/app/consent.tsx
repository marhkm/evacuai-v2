import { router } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Button, Message, Screen } from '@/components/ui';
import { makeStyles } from '@/theme';
import { ApiError, api } from '@/lib/api';
import { useAuth, type User } from '@/lib/auth';

// RA 10173 (Data Privacy Act of 2012) notice shown once before first use.
export default function Consent() {
  const styles = useStyles();
  const { token, setUser, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function agree() {
    setBusy(true);
    try {
      const { user } = await api<{ user: User }>('/api/me/consent', { method: 'POST', token });
      await setUser(user);
      router.replace('/');
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Your privacy">
      <Text style={styles.p}>EvacuAI helps UCLM keep you safe during earthquakes, fires and floods.</Text>
      <Text style={styles.p}>
        We collect your name, email, role and, only during an active emergency or when you send an SOS or check in,
        the building, floor or room you report. Safety officers and administrators use this to guide evacuation and to
        help people who need assistance.
      </Text>
      <Text style={styles.p}>
        Location reports are deleted after a set retention period. You can edit or delete your account at any time
        from your profile. This processing follows the Data Privacy Act of 2012 (RA 10173).
      </Text>
      <Message text={error} />
      <Button label="I agree" onPress={agree} busy={busy} />
      <Button label="Sign out" variant="secondary" onPress={signOut} />
    </Screen>
  );
}

const useStyles = makeStyles(c => ({ p: { fontSize: 16, lineHeight: 23, color: c.text } }));

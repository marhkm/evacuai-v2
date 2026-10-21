import { detectFloorChanges, type PressureSample } from '@evacuai/routing';
import { Redirect } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Share, Text } from 'react-native';

import { Button, Field, Message, Screen } from '@/components/ui';
import { fonts, makeStyles } from '@/theme';
import { TEST_BUILD } from '@/config';
import { watchPressure } from '@/lib/barometer';

const FLOOR_HEIGHT_M = 3.5;

/**
 * Test builds only: records a barometer trace while walking a known path (e.g. "BE: Ground → Third by Stairs Left"),
 * then shares it as JSON. Traces become fixtures for the floor-change detector tests (spec §7).
 */
export default function PressureRecorder() {
  const styles = useStyles();
  const [note, setNote] = useState('');
  const [recording, setRecording] = useState(false);
  const [samples, setSamples] = useState<PressureSample[]>([]);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef<(() => void) | null>(null);

  useEffect(() => () => stop.current?.(), []);

  if (!TEST_BUILD) return <Redirect href="/" />;

  async function start() {
    setError(null);
    setSamples([]);
    const unsubscribe = await watchPressure(s => setSamples(list => [...list, s]));
    if (!unsubscribe) return setError('This phone has no barometer (pressure sensor). Floor changes cannot be detected on it.');
    stop.current = unsubscribe;
    setRecording(true);
  }

  function finish() {
    stop.current?.();
    stop.current = null;
    setRecording(false);
  }

  const changes = detectFloorChanges(samples, { floorHeight_m: FLOOR_HEIGHT_M });
  const t0 = samples[0]?.t ?? 0;
  const latest = samples.at(-1);

  return (
    <Screen title="Pressure trace">
      <Text style={styles.text}>
        Stand still for 10 seconds, start recording, walk the path in the note, stand still again, then stop and share the file.
      </Text>
      <Field label="What you walked" value={note} onChangeText={setNote} placeholder="BE: Ground → Third by Stairs Left" autoCapitalize="sentences" />
      <Message text={error} />
      {recording ? <Button label="Stop recording" variant="danger" onPress={finish} /> : <Button label="Start recording" onPress={start} />}
      <Text style={styles.stat}>
        {samples.length} samples{latest ? ` · ${latest.hPa.toFixed(2)} hPa · ${((latest.t - t0) / 1000).toFixed(0)} s` : ''}
      </Text>
      <Text style={styles.stat}>
        Detected: {changes.length ? changes.map(c => `${c.floors > 0 ? '+' : ''}${c.floors} at ${((c.t - t0) / 1000).toFixed(0)} s`).join(', ') : 'no floor change'}
      </Text>
      {!recording && samples.length ? (
        <Button label="Share trace" variant="secondary" onPress={() =>
          Share.share({ message: JSON.stringify({ note, floorHeight_m: FLOOR_HEIGHT_M, samples: samples.map(s => ({ t: s.t - t0, hPa: s.hPa })) }) })} />
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  text: { fontFamily: fonts.body, fontSize: 16, color: c.text, lineHeight: 22 },
  stat: { fontFamily: fonts.body, fontSize: 15, color: c.muted },
}));

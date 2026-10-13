import type { CampusNode, CampusSnapshot } from '@evacuai/routing';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Chips, Section } from '@/components/Chips';
import { Button, Link, Message } from '@/components/ui';
import { nodeForQr, parseQr } from '@/lib/estimator';

/**
 * "Pick my room" (building → floor → room) as the main action, with scanning a QR sticker as an optional extra:
 * nobody should have to aim a camera in an emergency. Without onRoom (check-in) the scan is the main action.
 */
export function LocationChooser({ snapshot, onNode, onRoom, scanLabel = 'Scan QR sticker' }: {
  snapshot: CampusSnapshot | null;
  onNode: (node: CampusNode) => void;
  onRoom?: (roomId: string) => void;
  scanLabel?: string;
}) {
  const [mode, setMode] = useState<'none' | 'pick' | 'scan'>('none');
  const [pick, setPick] = useState<{ building?: string; level?: number }>({});
  const [error, setError] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();

  async function startScan() {
    if (!permission?.granted && !(await requestPermission()).granted) return setError('Camera permission is needed to scan stickers. You can pick your room instead.');
    setMode('scan');
  }

  function onScanned(data: string) {
    if (!snapshot || mode !== 'scan') return;
    const qr = parseQr(data);
    const node = qr ? nodeForQr(snapshot, qr) : null;
    if (!node) return setError('That is not an EvacuAI sticker (or it is out of date). Try another one or pick your room.');
    setError(null);
    setMode('none');
    onNode(node);
  }

  const building = snapshot?.buildings.find(b => b.id === pick.building) ?? snapshot?.buildings[0];
  const rooms = snapshot && building && pick.level !== undefined
    ? snapshot.rooms.filter(r => r.building === building.id && r.level === pick.level && r.type !== 'corridor') : [];

  return (
    <>
      {onRoom ? (
        <>
          <Button label="Pick my room" onPress={() => setMode('pick')} />
          <Link label={`${scanLabel} instead`} onPress={startScan} />
        </>
      ) : (
        <Button label={scanLabel} variant="secondary" onPress={startScan} />
      )}
      <Message text={error} />

      {mode === 'scan' ? (
        <View style={styles.camera}>
          <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={r => onScanned(r.data)} />
        </View>
      ) : null}

      {mode === 'pick' && snapshot && onRoom ? (
        <>
          {snapshot.buildings.length > 1 ? (
            <Section label="Building">
              <Chips items={snapshot.buildings.map(b => ({ key: b.id, label: b.name }))} active={building?.id ?? null}
                onSelect={id => setPick({ building: id })} />
            </Section>
          ) : null}
          <Section label="Floor">
            <Chips items={(building?.floors ?? []).map(f => ({ key: String(f.level), label: f.name }))}
              active={pick.level !== undefined ? String(pick.level) : null} onSelect={l => setPick(p => ({ ...p, level: Number(l) }))} />
          </Section>
          {rooms.length ? (
            <Section label="Room">
              <Chips items={rooms.map(r => ({ key: r.id, label: r.name }))} active={null}
                onSelect={id => { setMode('none'); onRoom(id); }} />
            </Section>
          ) : null}
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  camera: { height: 280, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
});

import type { CampusSnapshot } from '@evacuai/routing';
import * as ImagePicker from 'expo-image-picker';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Platform, View } from 'react-native';

import { Chips, Section } from '@/components/Chips';
import { Button, Field, Message, Screen } from '@/components/ui';
import { makeStyles } from '@/theme';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { loadSnapshot } from '@/lib/campus';
import { lastEstimate } from '@/lib/whereabouts';

const HAZARDS = [
  { key: 'fire', label: 'Fire' },
  { key: 'earthquake', label: 'Earthquake' },
  { key: 'flood', label: 'Flood' },
  { key: 'structural_damage', label: 'Structural damage' },
  { key: 'other', label: 'Other' },
];

export default function Report() {
  const styles = useStyles();
  const { state, token } = useAuth();
  const [snapshot, setSnapshot] = useState<CampusSnapshot | null>(null);
  const [hazard, setHazard] = useState<string | null>(null);
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<ApiError | string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Taken in the app just now (the server refuses photos older than 10 minutes): a reused picture is the easiest fake.
  const [photo, setPhoto] = useState<{ asset: ImagePicker.ImagePickerAsset; takenAt: string } | null>(null);

  useEffect(() => {
    if (state.status !== 'signedIn') return;
    loadSnapshot(token).then(r => setSnapshot(r.snapshot)).catch(e => setError((e as Error).message));
  }, [state.status, token]);

  if (state.status === 'loading') return null;
  if (state.status === 'signedOut') return <Redirect href="/login" />;

  const building = snapshot?.buildings.find(b => b.id === buildingId) ?? snapshot?.buildings[0];
  const floor = building?.floors.find(f => f.level === level);
  const rooms = snapshot && building && floor
    ? snapshot.rooms.filter(r => r.building === building.id && r.level === floor.level && r.type !== 'corridor')
    : [];

  async function takePhoto() {
    setError(null);
    if (!(await ImagePicker.requestCameraPermissionsAsync()).granted) return setError('Allow camera access to take a photo of the hazard.');
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, exif: false });
    if (!result.canceled) setPhoto({ asset: result.assets[0], takenAt: new Date().toISOString() });
  }

  async function submit() {
    setError(null);
    setSent(null);
    if (!hazard) return setError('Choose what kind of hazard it is.');
    if (!building || !floor) return setError('Choose the floor where you see it.');
    if (!photo) return setError('Take a photo of the hazard.');
    setBusy(true);
    try {
      const here = lastEstimate(); // where the app last placed you: a hint for officers, never a reason to refuse
      const fields = {
        hazard_type: hazard, building_id: building.id, level: String(floor.level), room_id: roomId, description: description.trim() || null,
        at_building: here?.building ?? null, at_level: here?.floor !== undefined ? String(here.floor) : null,
      };
      const form = new FormData(); // the server strips the photo's metadata and shrinks it
      for (const [k, v] of Object.entries(fields)) if (v !== null) form.append(k, v);
      form.append('photo', await photoPart(photo.asset));
      form.append('taken_at', photo.takenAt);
      await api('/api/hazard-reports', { method: 'POST', token, body: form });
      setPhoto(null);
      setSent('Report sent. Safety officers have been notified. Move away from the hazard.');
      setDescription('');
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  }

  const apiError = typeof error === 'object' && error ? error : null;

  return (
    <Screen title="Report a hazard">
      <Section label="What is it?">
        <Chips items={HAZARDS} active={hazard} onSelect={setHazard} tone="danger" />
      </Section>
      {snapshot && snapshot.buildings.length > 1 ? (
        <Section label="Building">
          <Chips items={snapshot.buildings.map(b => ({ key: b.id, label: b.name }))} active={building?.id ?? null}
            onSelect={id => { setBuildingId(id); setLevel(null); setRoomId(null); }} />
        </Section>
      ) : null}
      {building ? (
        <Section label="Floor">
          <Chips items={building.floors.map(f => ({ key: String(f.level), label: f.name }))} active={floor ? String(floor.level) : null}
            onSelect={l => { setLevel(Number(l)); setRoomId(null); }} />
        </Section>
      ) : null}
      {rooms.length ? (
        <Section label="Room or area (optional)">
          <Chips items={rooms.map(r => ({ key: r.id, label: r.name }))} active={roomId} onSelect={id => setRoomId(id === roomId ? null : id)} />
        </Section>
      ) : null}
      <Field label="What do you see?" value={description} onChangeText={setDescription} multiline maxLength={500}
        placeholder="e.g. Smoke coming from the door. No names or phone numbers." autoCapitalize="sentences" error={apiError?.fieldError('description')} />
      <Section label="Photo (required)">
        {photo ? (
          <View style={styles.photoRow}>
            <Image source={{ uri: photo.asset.uri }} style={styles.thumb} accessibilityLabel="Photo to send with the report" />
            <View style={styles.flex}><Button label="Take again" variant="secondary" onPress={takePhoto} /></View>
          </View>
        ) : (
          <Button label="Take photo" variant="secondary" onPress={takePhoto} />
        )}
      </Section>
      <Message text={typeof error === 'string' ? error : apiError ? apiError.fieldError('photo') ?? apiError.fieldError('taken_at') ?? apiError.fieldError('room_id') ?? apiError.fieldError('level') ?? apiError.message : null} />
      <Message text={sent} kind="info" />
      <Button label="Send report" variant="danger" onPress={submit} busy={busy} />
    </Screen>
  );
}

/** Web gives a File; phones give a file URI that React Native's FormData uploads from disk. */
async function photoPart(asset: ImagePicker.ImagePickerAsset): Promise<Blob> {
  if (asset.file) return asset.file;
  if (Platform.OS === 'web') return (await fetch(asset.uri)).blob();
  return { uri: asset.uri, name: asset.fileName ?? 'photo.jpg', type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob;
}

const useStyles = makeStyles(c => ({
  photoRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  flex: { flex: 1 },
  thumb: { width: 88, height: 88, borderRadius: 8, backgroundColor: c.surface3 },
}));

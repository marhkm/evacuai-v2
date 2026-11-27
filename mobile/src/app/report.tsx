import { displayName } from '@evacuai/campus-view';
import type { CampusSnapshot } from '@evacuai/routing';
import * as ImagePicker from 'expo-image-picker';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';

import { Chips, Section } from '@/components/Chips';
import { Button, Field, Message, Screen } from '@/components/ui';
import { makeStyles } from '@/theme';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { loadSnapshot } from '@/lib/campus';
import { uploadFile } from '@/lib/uploadFile';
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
  const [outdoorId, setOutdoorId] = useState<string | null>(null); // an open ground or safe zone instead of a floor
  const [description, setDescription] = useState('');
  const [error, setError] = useState<ApiError | string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState(false); // the AI did not see the hazard in this photo
  // Taken in the app just now (the server refuses photos older than 10 minutes): a reused picture is the easiest fake.
  const [photo, setPhoto] = useState<{ asset: ImagePicker.ImagePickerAsset; takenAt: string } | null>(null);

  useEffect(() => {
    if (state.status !== 'signedIn') return;
    loadSnapshot(token).then(r => setSnapshot(r.snapshot)).catch(e => setError((e as Error).message));
  }, [state.status, token]);

  if (state.status === 'loading') return null;
  if (state.status === 'signedOut') return <Redirect href="/login" />;

  // Outdoor areas: the safe zones (open grounds, Nature's Spring). Reporting one sends its building and level too.
  const outdoors = snapshot?.nodes.filter(n => n.type === 'assembly_point') ?? [];
  const outdoor = outdoors.find(n => n.id === outdoorId);
  const building = snapshot?.buildings.find(b => b.id === (outdoor?.building ?? buildingId)) ?? snapshot?.buildings[0];
  const floor = building?.floors.find(f => f.level === (outdoor?.level ?? level));
  const rooms = snapshot && building && floor
    ? snapshot.rooms.filter(r => r.building === building.id && r.level === floor.level && r.type !== 'corridor')
    : [];

  async function takePhoto() {
    setError(null);
    if (!(await ImagePicker.requestCameraPermissionsAsync()).granted) return setError('Allow camera access to take a photo of the hazard.');
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, exif: false });
    if (!result.canceled) {
      setPhoto({ asset: result.assets[0], takenAt: new Date().toISOString() });
      setRejected(false);
    }
  }

  /** The server checks the photo before answering (up to 20 s). `anyway`: send it for an officer although the AI said no. */
  async function submit(anyway = false) {
    setError(null);
    setSent(null);
    if (!hazard) return setError('Choose what kind of hazard it is.');
    if (!building || !floor) return setError('Choose the floor where you see it.');
    if (!photo) return setError('Take a photo of the hazard.');
    setBusy(true);
    try {
      const here = lastEstimate(); // where the app last placed you: a hint for officers, never a reason to refuse
      const fields = {
        hazard_type: hazard, building_id: building.id, level: String(floor.level), room_id: outdoor ? null : roomId, node_id: outdoor?.id ?? null,
        description: description.trim() || null,
        at_building: here?.building ?? null, at_level: here?.floor !== undefined ? String(here.floor) : null,
      };
      const form = new FormData(); // the server strips the photo's metadata and shrinks it
      for (const [k, v] of Object.entries(fields)) if (v !== null) form.append(k, v);
      form.append('photo', await photoPart(photo.asset));
      form.append('taken_at', photo.takenAt);
      if (anyway) form.append('send_anyway', '1');
      await api('/api/hazard-reports', { method: 'POST', token, body: form });
      setPhoto(null);
      setRejected(false);
      setSent('Report sent. Safety officers have been notified. Move away from the hazard.');
      setDescription('');
    } catch (e) {
      setError(e as ApiError);
      setRejected((e as ApiError).reason === 'photo_rejected');
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
          <Chips items={snapshot.buildings.map(b => ({ key: b.id, label: b.name }))} active={outdoor ? null : building?.id ?? null}
            onSelect={id => { setBuildingId(id); setLevel(null); setRoomId(null); setOutdoorId(null); }} />
        </Section>
      ) : null}
      {snapshot && outdoors.length ? (
        <Section label="Or an outdoor area">
          <Chips items={outdoors.map(n => ({ key: n.id, label: `Outdoor: ${displayName(snapshot, n.id)}` }))} active={outdoorId}
            onSelect={id => { setOutdoorId(id === outdoorId ? null : id); setRoomId(null); }} />
        </Section>
      ) : null}
      {building && !outdoor ? (
        <Section label="Floor">
          <Chips items={building.floors.map(f => ({ key: String(f.level), label: f.name }))} active={floor ? String(floor.level) : null}
            onSelect={l => { setLevel(Number(l)); setRoomId(null); }} />
        </Section>
      ) : null}
      {rooms.length && !outdoor ? (
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
      <Message text={busy ? 'Checking photo…' : null} kind="info" />
      <Message text={sent} kind="info" />
      {rejected && !busy ? (
        <>
          <Button label="Retake photo" variant="secondary" onPress={takePhoto} />
          <Button label="Send anyway" variant="danger" onPress={() => submit(true)} />
        </>
      ) : (
        <Button label="Send report" variant="danger" onPress={() => submit()} busy={busy} />
      )}
    </Screen>
  );
}

const photoPart = (asset: ImagePicker.ImagePickerAsset) => uploadFile(asset.uri, asset.file);

const useStyles = makeStyles(c => ({
  photoRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  flex: { flex: 1 },
  thumb: { width: 88, height: 88, borderRadius: 8, backgroundColor: c.surface3 },
}));

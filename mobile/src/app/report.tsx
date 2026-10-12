import type { CampusSnapshot } from '@evacuai/routing';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { Chips, Section } from '@/components/Chips';
import { Button, Field, Message, Screen, colors } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { loadSnapshot } from '@/lib/campus';

const HAZARDS = [
  { key: 'fire', label: 'Fire' },
  { key: 'earthquake', label: 'Earthquake' },
  { key: 'flood', label: 'Flood' },
  { key: 'structural_damage', label: 'Structural damage' },
  { key: 'other', label: 'Other' },
];

export default function Report() {
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

  async function submit() {
    setError(null);
    setSent(null);
    if (!hazard) return setError('Choose what kind of hazard it is.');
    if (!building || !floor) return setError('Choose the floor where you see it.');
    setBusy(true);
    try {
      await api('/api/hazard-reports', {
        method: 'POST', token,
        body: { hazard_type: hazard, building_id: building.id, level: floor.level, room_id: roomId, description: description.trim() || null },
      });
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
        <Chips items={HAZARDS} active={hazard} onSelect={setHazard} color={colors.danger} />
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
        placeholder="e.g. Smoke coming from the door" autoCapitalize="sentences" error={apiError?.fieldError('description')} />
      <Message text={typeof error === 'string' ? error : apiError ? apiError.fieldError('room_id') ?? apiError.fieldError('level') ?? apiError.message : null} />
      <Message text={sent} kind="info" />
      <Button label="Send report" variant="danger" onPress={submit} busy={busy} />
    </Screen>
  );
}

import { routeOverlay, routeSteps, toFloorShapes } from '@evacuai/campus-view';
import { findRoute, type Hazard } from '@evacuai/routing';
import { Redirect } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Chips, Section } from '@/components/Chips';
import { FloorPlan } from '@/components/FloorPlan';
import { LocationChooser } from '@/components/LocationChooser';
import { Button, Message, Screen, colors } from '@/components/ui';
import { useAlerts } from '@/lib/alerts';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { current, routeOrigin, type Estimate, type Observation } from '@/lib/estimator';
import { useCampus } from '@/lib/useCampus';
import { watchFloorChanges } from '@/lib/barometer';
import { lastEstimate, moveFloors, updateWhereabouts } from '@/lib/whereabouts';

const HAZARD_CHOICES: { key: Hazard; label: string }[] = [
  { key: 'earthquake', label: 'Earthquake' }, { key: 'fire', label: 'Fire' }, { key: 'flood', label: 'Flood' },
];
// Alert types the router has no special rules for are routed like an earthquake (leave via stairs to an exit).
const toHazard = (t: string): Hazard => (t === 'fire' || t === 'flood' ? t : 'earthquake');

type ScheduleNow = { subject: string; room_id: string; room_name: string; building: string; level: number } | null;

export default function RouteScreen() {
  const { state, token } = useAuth();
  const { active } = useAlerts();
  const { snapshot, offline, error } = useCampus();
  const [chosenHazard, setChosenHazard] = useState<Hazard | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(() => lastEstimate());
  const [schedule, setSchedule] = useState<ScheduleNow>(null);
  const [viewLevel, setViewLevel] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now()); // drives the 10-minute confidence decay

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!token) return;
    api<{ class: ScheduleNow }>('/api/me/schedule/now', { token }).then(r => setSchedule(r.class)).catch(() => undefined);
  }, [token]);

  const hazard: Hazard | null = active[0] ? toHazard(active[0].hazard_type) : chosenHazard;
  const alertActive = !!active[0];

  // Barometer: once we know the building, a stair climb or descent moves the start to the new floor and re-routes.
  const knownBuilding = estimate?.building;
  const floorHeight = snapshot?.buildings.find(b => b.id === knownBuilding)?.floors[0]?.height_m;
  useEffect(() => {
    if (!snapshot || !floorHeight) return;
    return watchFloorChanges(floorHeight, floors => {
      setViewLevel(null);
      setEstimate(moveFloors(snapshot, floors, token, alertActive));
    });
  }, [snapshot, floorHeight, token, alertActive]);
  const live = current(estimate, now);
  const origin = snapshot ? routeOrigin(snapshot, live) : null;
  const result = useMemo(() => (snapshot && origin && hazard ? findRoute(snapshot, origin, hazard) : null), [snapshot, origin, hazard]);

  if (state.status === 'loading') return null;
  if (state.status === 'signedOut') return <Redirect href="/login" />;

  const route = result?.ok ? result.route : null;
  const overlay = snapshot && route ? routeOverlay(snapshot, route) : null;
  const originNode = snapshot?.nodes.find(n => n.id === origin);
  const building = snapshot?.buildings.find(b => b.id === originNode?.building) ?? snapshot?.buildings[0];
  const level = viewLevel ?? originNode?.level ?? building?.floors[0]?.level;
  const shapes = snapshot && building && level !== undefined ? toFloorShapes(snapshot, building.id, level) : null;
  const segment = overlay?.segments.find(s => s.building === building?.id && s.level === level);
  // Explicit null check: React Compiler mis-tracks "route && snapshot?.nodes" as a dependency on snapshot.nodes.
  const goal = route && snapshot ? snapshot.nodes.find(n => n.id === route.destinationId) : undefined;

  function locate(obs: Observation) {
    setViewLevel(null);
    setEstimate(updateWhereabouts(obs, token, alertActive));
  }

  const sourceText = live && { qr: 'scanned sticker', manual: 'you picked it', schedule: 'from your class schedule', barometer: 'floor change detected', gps: 'GPS' }[live.source];

  return (
    <Screen title="Evacuation route">
      <Message text={error} />
      <Message text={offline ? 'Offline: using the last downloaded map. Path changes may be missing.' : null} kind="info" />

      {active[0] ? (
        <Text style={styles.hazard}>Routing for: {active[0].hazard_type.replace(/_/g, ' ')}{active[0].is_drill ? ' (drill)' : ''}</Text>
      ) : (
        <Section label="What is happening?">
          <Chips items={HAZARD_CHOICES} active={chosenHazard} onSelect={k => setChosenHazard(k as Hazard)} />
        </Section>
      )}

      {!live && schedule ? (
        <View style={styles.card}>
          <Text style={styles.cardText}>Your class now: {schedule.subject} in {schedule.room_name}.</Text>
          <Button label={`Yes, I'm in ${schedule.room_name}`} onPress={() =>
            locate({ source: 'schedule', roomId: schedule.room_id, building: schedule.building, floor: schedule.level })} />
        </View>
      ) : null}

      {live && originNode ? (
        <Text style={styles.where}>
          Starting from {snapshot?.rooms.find(r => r.id === originNode.room_id)?.name ?? originNode.name ?? originNode.id.split('/').pop()} ({sourceText})
        </Text>
      ) : null}

      <LocationChooser snapshot={snapshot}
        onNode={n => locate({ source: 'qr', nodeId: n.id, building: n.building, floor: n.level })}
        onRoom={id => {
          const room = snapshot!.rooms.find(r => r.id === id)!;
          locate({ source: 'manual', roomId: id, building: room.building, floor: room.level });
        }} />

      {live && hazard && result && !result.ok ? (
        <Message text={result.reason === 'no_safe_route'
          ? 'No safe way out found from here. Stay where you are if it is safe, call for help, and follow safety officers.'
          : 'That spot is not on the current map. Scan another sticker or pick your room.'} />
      ) : null}

      {route && snapshot ? (
        <View style={styles.steps}>
          <Text style={styles.distance}>{Math.round(route.distance_m)} m to safety</Text>
          {routeSteps(snapshot, route).map((s, i) => <Text key={i} style={styles.step}>{s}</Text>)}
        </View>
      ) : null}

      {building && building.floors.length > 1 && route ? (
        <Chips items={building.floors.map(f => ({ key: String(f.level), label: f.name }))} active={level !== undefined ? String(level) : null}
          onSelect={l => setViewLevel(Number(l))} />
      ) : null}
      {shapes && route ? (
        <FloorPlan shapes={shapes} route={segment?.points}
          you={originNode && originNode.level === level ? [originNode.x, originNode.y] : undefined}
          goal={goal && goal.level === level && goal.building === building?.id ? [goal.x, goal.y] : undefined} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hazard: { fontSize: 16, fontWeight: '700', color: colors.danger, textTransform: 'capitalize' },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 10 },
  cardText: { fontSize: 16, color: colors.text },
  where: { fontSize: 15, color: colors.muted },
  steps: { gap: 6, backgroundColor: '#eef5fd', borderRadius: 12, padding: 14 },
  distance: { fontSize: 18, fontWeight: '800', color: '#0b6bcb' },
  step: { fontSize: 17, color: colors.text, lineHeight: 24 },
});

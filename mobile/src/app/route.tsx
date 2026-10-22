import { exitBadge, floorRoutePoints, routeSteps } from '@evacuai/campus-view';
import { findRoute, type Hazard } from '@evacuai/routing';
import { Redirect } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { Chips, Section } from '@/components/Chips';
import { FloorPlan } from '@/components/FloorPlan';
import { LocationChooser } from '@/components/LocationChooser';
import { Message, Screen } from '@/components/ui';
import { fonts, makeStyles } from '@/theme';
import { useAlerts } from '@/lib/alerts';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { current, routeOrigin, type Estimate, type Observation } from '@/lib/estimator';
import { useCampus } from '@/lib/useCampus';
import { toHazard } from '@/lib/useEvacRoute';
import { watchFloorChanges } from '@/lib/barometer';
import { applyClass, lastEstimate, moveFloors, restoreWhereabouts, updateWhereabouts } from '@/lib/whereabouts';

const HAZARD_CHOICES: { key: Hazard; label: string }[] = [
  { key: 'earthquake', label: 'Earthquake' }, { key: 'fire', label: 'Fire' }, { key: 'flood', label: 'Flood' },
];
// Alert types the router has no special rules for are routed like an earthquake (leave via stairs to an exit).

type ScheduleNow = { subject: string; room_id: string; room_name: string; building: string; level: number; time_start: string } | null;

/** Class start today, in this phone's clock (campus time). */
function startsAt(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

export default function RouteScreen() {
  const styles = useStyles();
  const { state, token } = useAuth();
  const { active } = useAlerts();
  const { snapshot, offline, error } = useCampus();
  const [chosenHazard, setChosenHazard] = useState<Hazard | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(() => lastEstimate());
  const [viewLevel, setViewLevel] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now()); // drives the 10-minute confidence decay

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const hazard: Hazard | null = active[0] ? toHazard(active[0].hazard_type) : chosenHazard;
  const alertActive = !!active[0];

  // No tap needed: today's saved location, or the class in session (unless the user located themselves since it began).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.all([
      restoreWhereabouts(),
      api<{ class: ScheduleNow }>('/api/me/schedule/now', { token }).then(r => r.class).catch(() => null),
    ]).then(([, cls]) => {
      if (cancelled) return;
      setEstimate(applyClass(cls && { roomId: cls.room_id, building: cls.building, floor: cls.level, startsAt: startsAt(cls.time_start) }, token, alertActive));
    });
    return () => { cancelled = true; };
  }, [token, alertActive]);

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
  const originNode = snapshot?.nodes.find(n => n.id === origin);
  const building = snapshot?.buildings.find(b => b.id === originNode?.building) ?? snapshot?.buildings[0];
  const level = viewLevel ?? originNode?.level ?? building?.floors[0]?.level;
  const floorRoute = snapshot && route && building && level !== undefined ? floorRoutePoints(snapshot, route, building.id, level) : undefined;
  const badge = snapshot && route && building && level !== undefined ? exitBadge(snapshot, route, building.id, level) : null;

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
        <Text style={styles.hazard}>Routing for {active[0].hazard_type.replace(/_/g, ' ')}{active[0].is_drill ? ' (drill)' : ''}</Text>
      ) : (
        <Section label="What is happening?">
          <Chips items={HAZARD_CHOICES} active={chosenHazard} onSelect={k => setChosenHazard(k as Hazard)} />
        </Section>
      )}

      {live && originNode ? (
        <Text style={styles.where}>
          Starting from {snapshot?.rooms.find(r => r.id === originNode.room_id)?.name ?? originNode.name ?? originNode.id.split('/').pop()} ({sourceText})
          {live.source === 'schedule' || live.source === 'barometer' ? '. Not there? Pick your room below.' : ''}
        </Text>
      ) : (
        <Text style={styles.where}>Where are you? Pick your room (or scan the sticker by the door).</Text>
      )}

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
          {routeSteps(snapshot, route).map((s, i) => (
            <View key={i} style={styles.stepRow}>
              <Text style={styles.stepNo} accessible={false}>{i + 1}</Text>
              <Text style={styles.step}>{s}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {building && building.floors.length > 1 && route ? (
        <Chips items={building.floors.map(f => ({ key: String(f.level), label: f.name }))} active={level !== undefined ? String(level) : null}
          onSelect={l => setViewLevel(Number(l))} />
      ) : null}
      {snapshot && building && level !== undefined && route ? (
        <FloorPlan snapshot={snapshot} building={building.id} level={level} route={floorRoute} badge={badge}
          you={originNode && originNode.level === level && originNode.building === building.id ? [originNode.x, originNode.y] : undefined} />
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles(c => ({
  hazard: { fontFamily: fonts.display, fontSize: 20, letterSpacing: 0.6, color: c.danger, textTransform: 'uppercase' },
  where: { fontFamily: fonts.body, fontSize: 15, color: c.muted },
  // Green like an exit sign: the way out.
  steps: { gap: 10, backgroundColor: c.safeFill, borderRadius: 14, padding: 16 },
  distance: { fontFamily: fonts.display, fontSize: 30, letterSpacing: 0.8, textTransform: 'uppercase', color: c.onColor },
  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNo: { fontFamily: fonts.display, fontSize: 17, color: c.safeFill, backgroundColor: c.onColor, width: 28, height: 28, lineHeight: 28, borderRadius: 14, textAlign: 'center', overflow: 'hidden' },
  step: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 17, color: c.onColor, lineHeight: 26 },
}));

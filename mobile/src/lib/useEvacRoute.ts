import { findRoute, type CampusSnapshot, type Hazard, type Route } from '@evacuai/routing';
import { useEffect, useMemo, useState } from 'react';

import { useAlerts } from '@/lib/alerts';
import { routeOrigin } from '@/lib/estimator';
import { lastEstimate, restoreWhereabouts } from '@/lib/whereabouts';

export const toHazard = (t: string): Hazard => (t === 'fire' || t === 'flood' ? t : 'earthquake');

/** During an alert, the way out from the student's last known location (null when there is no alert or no location). */
export function useEvacRoute(snapshot: CampusSnapshot | null | undefined): Route | null {
  const { active } = useAlerts();
  const [estimate, setEstimate] = useState(() => lastEstimate());
  useEffect(() => { void restoreWhereabouts().then(() => setEstimate(lastEstimate())); }, []);
  const hazard = active[0] ? toHazard(active[0].hazard_type) : null;
  const origin = snapshot ? routeOrigin(snapshot, estimate) : null;
  return useMemo(() => {
    const r = snapshot && origin && hazard ? findRoute(snapshot, origin, hazard) : null;
    return r?.ok ? r.route : null;
  }, [snapshot, origin, hazard]);
}

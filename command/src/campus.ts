import type { LiveState } from '@evacuai/campus-3d';
import type { CampusSnapshot } from '@evacuai/routing';
import { useQuery } from '@tanstack/react-query';

import { api } from './api';

/** Buildings, floors, rooms and the routing graph. Path status comes from `live`, so this rarely changes. */
export const useSnapshot = () =>
  useQuery({ queryKey: ['snapshot'], queryFn: () => api<CampusSnapshot>('/api/campus-snapshot'), staleTime: Infinity, refetchInterval: false });

export type Live = LiveState & { alert: { id: number; label: string; active: boolean } | null };

/** Path status, hazard rooms, people per room and SOS / check-in pins for the active alert. */
export const useLive = () => useQuery({ queryKey: ['live'], queryFn: () => api<Live>('/api/officer/live') });

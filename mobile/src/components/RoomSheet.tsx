import { BottomSheet, Button, Column, Host, Text } from '@expo/ui';
import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

import { fonts, useTheme } from '@/theme';

export type PickedRoom = { roomId: string; name: string; floorName?: string; count?: number; hazard?: boolean; sos?: boolean };

/** Native bottom sheet for a room tapped in 3D: what is there now, and a route from it. */
export function RoomSheet({ room, onClose, onRouteFrom }: { room: PickedRoom | null; onClose: () => void; onRouteFrom: (r: PickedRoom) => void }) {
  const c = useTheme();
  const n = room?.count ?? 0;
  const title = room ? `${room.name}${room.floorName ? ` · ${room.floorName}` : ''}` : '';
  const people = n === 1 ? '1 person inside' : `${n} people inside`;
  const spoken = room ? [title, people, room.hazard && 'Hazard reported', room.sos && 'SOS here'].filter(Boolean).join('. ') : '';
  // The native sheet does not move screen-reader focus, so say what opened.
  useEffect(() => { if (spoken) AccessibilityInfo.announceForAccessibility(spoken); }, [spoken]);
  return (
    <Host>
      <BottomSheet isPresented={!!room} onDismiss={onClose}>
        {room ? (
          <Column spacing={8}>
            <Text textStyle={{ fontFamily: fonts.display, fontSize: 26, color: c.ink }}>{title}</Text>
            <Text textStyle={{ fontFamily: fonts.body, fontSize: 16, color: c.ink }}>{people}</Text>
            {room.hazard ? <Text textStyle={{ fontFamily: fonts.bodyBold, fontSize: 16, color: c.danger }}>Hazard reported</Text> : null}
            {room.sos ? <Text textStyle={{ fontFamily: fonts.bodyBold, fontSize: 16, color: c.danger }}>SOS here</Text> : null}
            <Button label="Route from here" onPress={() => onRouteFrom(room)} />
            <Button label="Close" variant="outlined" onPress={onClose} />
          </Column>
        ) : null}
      </BottomSheet>
    </Host>
  );
}

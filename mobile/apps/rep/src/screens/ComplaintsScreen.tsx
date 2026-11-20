import React from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { PortalComplaintsScreen } from '@itour/ui';
import type { MainTabParamList } from '../navigation/MainTabNavigator';

/**
 * Complaints that name this rep — visible as soon as they do — with the story (no claim amounts)
 * and their answer thread with the office (text + evidence photos). Shared with the driver app.
 * A notification tap passes `complaintId` to open that complaint.
 */
export function ComplaintsScreen() {
  const route = useRoute<RouteProp<MainTabParamList, 'Complaints'>>();
  return <PortalComplaintsScreen portal="rep" initialId={route.params?.complaintId} key={route.params?.at ?? 0} />;
}

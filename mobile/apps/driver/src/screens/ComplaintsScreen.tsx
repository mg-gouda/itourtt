import React from 'react';
import { PortalComplaintsScreen } from '@itour/ui';

/**
 * Complaints that name this driver — visible as soon as they do — with the story (no claim amounts)
 * and their answer thread with the office (text + evidence photos). Shared with the rep app.
 */
export function ComplaintsScreen() {
  return <PortalComplaintsScreen portal="driver" />;
}

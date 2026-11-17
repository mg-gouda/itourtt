import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { I18nManager } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

/**
 * One icon component for the apps. Ionicons by default; prefix a name with
 * `mc:` for MaterialCommunityIcons (e.g. `mc:airplane-landing`). The font
 * files are bundled by `fonts.gradle` in each app's android/app/build.gradle —
 * without it every icon renders as an empty box.
 */
/**
 * Icons that point "forward" or "back" mirror in right-to-left (Arabic) layouts,
 * so a back arrow still points toward where you came from.
 */
const DIRECTIONAL = /^(mc:)?(chevron|arrow|caret)-(back|forward|left|right)|^(mc:)?send|^log-(in|out)|^return-(up|down)-(back|forward)/;

export function Icon({
  name,
  size = 20,
  color,
  style,
}: {
  name: string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  const flipped = I18nManager.isRTL && DIRECTIONAL.test(name) ? [style, { transform: [{ scaleX: -1 }] }] : style;
  if (name.startsWith('mc:')) {
    return <MaterialCommunityIcons name={name.slice(3)} size={size} color={color} style={flipped} />;
  }
  return <Ionicons name={name} size={size} color={color} style={flipped} />;
}

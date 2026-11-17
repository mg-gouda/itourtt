import React from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

/**
 * One icon component for the apps. Ionicons by default; prefix a name with
 * `mc:` for MaterialCommunityIcons (e.g. `mc:airplane-landing`). The font
 * files are bundled by `fonts.gradle` in each app's android/app/build.gradle —
 * without it every icon renders as an empty box.
 */
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
  if (name.startsWith('mc:')) {
    return <MaterialCommunityIcons name={name.slice(3)} size={size} color={color} style={style} />;
  }
  return <Ionicons name={name} size={size} color={color} style={style} />;
}

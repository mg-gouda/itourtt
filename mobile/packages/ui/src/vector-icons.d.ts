// react-native-vector-icons ships no types for v10; this covers the sets we use.
declare module 'react-native-vector-icons/Ionicons' {
  import type { ComponentType } from 'react';
  import type { TextProps } from 'react-native';
  const Icon: ComponentType<TextProps & { name: string; size?: number; color?: string }>;
  export default Icon;
}
declare module 'react-native-vector-icons/MaterialCommunityIcons' {
  import type { ComponentType } from 'react';
  import type { TextProps } from 'react-native';
  const Icon: ComponentType<TextProps & { name: string; size?: number; color?: string }>;
  export default Icon;
}

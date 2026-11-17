import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors, spacing } from '@itour/shared';
import { Icon } from './Icon';

interface EmptyStateProps {
  /** An icon name (see Icon) or any node. Defaults to a calendar. */
  icon?: React.ReactNode | string;
  title: string;
  message?: string;
  action?: React.ReactNode;
  /** Tint of the icon halo; defaults to the brand accent. */
  tint?: string;
}

/** Friendly empty state: haloed icon, title, one line of help and an optional action. */
export function EmptyState({ icon = 'calendar-clear-outline', title, message, action, tint }: EmptyStateProps) {
  const colors = useColors();
  const c = tint ?? colors.brandAccent;

  return (
    <View style={styles.container}>
      <View style={[styles.haloOuter, { backgroundColor: `${c}12` }]}>
        <View style={[styles.haloInner, { backgroundColor: `${c}22` }]}>
          {typeof icon === 'string' ? <Icon name={icon} size={36} color={c} /> : icon}
        </View>
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {message ? <Text style={[styles.message, { color: colors.mutedForeground }]}>{message}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing[8],
    paddingVertical: spacing[12],
  },
  haloOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[5],
  },
  haloInner: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center', letterSpacing: -0.2 },
  message: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: spacing[2], maxWidth: 300 },
  action: { marginTop: spacing[5] },
});

import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { appAlert, getAlarmKeyInfo, onAlarmsChange, t, turnOffJobAlarms, useColors } from '@itour/shared';
import { Icon } from '../Icon';

/**
 * Login screen note: job alarms stay on this phone after sign-out (alarm key) — whose they are,
 * and a "Turn off" for a shared or handed-over phone.
 */
export function AlarmsOnPhone() {
  const colors = useColors();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const read = () => getAlarmKeyInfo().then((k) => setName(k ? k.name || '—' : null));
    read();
    return onAlarmsChange(read);
  }, []);

  if (!name) return null;
  return (
    <View style={[styles.row, { backgroundColor: colors.muted, borderColor: colors.border }]}>
      <Icon name="alarm-outline" size={16} color={colors.primary} />
      <Text style={[styles.text, { color: colors.foreground }]} numberOfLines={2}>
        {t('alarm.onForName').replace('{name}', name)}
      </Text>
      <Pressable
        hitSlop={8}
        onPress={() =>
          appAlert(t('alarm.serviceOn'), t('alarm.turnOffConfirm'), [
            { text: t('repApp.later'), style: 'cancel' },
            {
              text: t('alarm.turnOff'),
              style: 'destructive',
              onPress: async () => {
                await turnOffJobAlarms();
                setName(null);
              },
            },
          ])
        }
      >
        <Text style={[styles.off, { color: colors.destructive }]}>{t('alarm.turnOff')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 16 },
  text: { flex: 1, fontSize: 13 },
  off: { fontSize: 13, fontWeight: '800' },
});

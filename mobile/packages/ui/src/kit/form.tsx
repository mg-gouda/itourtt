import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { t, useColors } from '@itour/shared';
import { Icon } from '../Icon';

/** Labeled text input with an optional leading icon and a required marker. */
export function Field({
  label,
  icon,
  required,
  error,
  style,
  ...props
}: TextInputProps & { label: string; icon?: string; required?: boolean; error?: boolean }) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.foreground }]}>
        {label}
        {required ? <Text style={{ color: colors.destructive }}> *</Text> : null}
      </Text>
      <View
        style={[
          styles.inputWrap,
          {
            backgroundColor: colors.card,
            borderColor: error ? colors.destructive : colors.input,
            alignItems: props.multiline ? 'flex-start' : 'center',
          },
        ]}
      >
        {icon ? <Icon name={icon} size={18} color={colors.mutedForeground} style={props.multiline ? styles.iconTop : null} /> : null}
        <TextInput
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { color: colors.foreground }, props.multiline && styles.multiline, style]}
          {...props}
        />
      </View>
    </View>
  );
}

/** Single-choice chips. */
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
  required,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | '';
  onChange: (v: T) => void;
  required?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.foreground }]}>
        {label}
        {required ? <Text style={{ color: colors.destructive }}> *</Text> : null}
      </Text>
      <View style={styles.choices}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              style={[
                styles.choice,
                {
                  backgroundColor: active ? colors.primary : colors.card,
                  borderColor: active ? colors.primary : colors.input,
                },
              ]}
            >
              {active ? <Icon name="checkmark" size={14} color={colors.primaryForeground} /> : null}
              <Text style={[styles.choiceText, { color: active ? colors.primaryForeground : colors.foreground }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** − n + counter for head counts. */
export function Counter({
  label,
  value,
  onChange,
  min = 0,
  required,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  required?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.counter, { backgroundColor: colors.card, borderColor: colors.input }]}>
      <Text style={[styles.counterLabel, { color: colors.foreground }]} numberOfLines={1}>
        {label}
        {required ? <Text style={{ color: colors.destructive }}> *</Text> : null}
      </Text>
      <View style={styles.counterRow}>
        <Pressable
          onPress={() => onChange(Math.max(min, value - 1))}
          style={[styles.counterBtn, { backgroundColor: colors.muted }]}
          hitSlop={6}
        >
          <Icon name="remove" size={16} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.counterValue, { color: colors.foreground }]}>{value}</Text>
        <Pressable onPress={() => onChange(value + 1)} style={[styles.counterBtn, { backgroundColor: colors.primarySoft }]} hitSlop={6}>
          <Icon name="add" size={16} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

export const requiredHint = () => t('repApp.required');

const styles = StyleSheet.create({
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 7 },
  inputWrap: {
    flexDirection: 'row',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 50,
  },
  iconTop: { marginTop: 15 },
  input: { flex: 1, fontSize: 15.5, paddingVertical: 12 },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  choiceText: { fontSize: 14, fontWeight: '700' },
  counter: { flex: 1, borderWidth: 1, borderRadius: 14, padding: 12 },
  counterLabel: { fontSize: 12.5, fontWeight: '700' },
  counterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  counterBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  counterValue: { fontSize: 20, fontWeight: '800' },
});

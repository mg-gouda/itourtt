import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  registerDialogHost,
  t,
  useColors,
  type DialogButton,
  type DialogOptions,
  type DialogTone,
  type ThemeColors,
} from '@itour/shared';
import { Icon } from '../Icon';
import { ActionButton } from './kit';

function toneOf(tone: DialogTone, colors: ThemeColors) {
  switch (tone) {
    case 'success':
      return { fg: colors.success, bg: colors.successSoft, icon: 'checkmark-circle' };
    case 'warning':
      return { fg: colors.warning, bg: colors.warningSoft, icon: 'warning' };
    case 'danger':
      return { fg: colors.destructive, bg: colors.destructiveSoft, icon: 'alert-circle' };
    case 'info':
      return { fg: colors.info, bg: colors.infoSoft, icon: 'information-circle' };
    case 'neutral':
      return { fg: colors.mutedForeground, bg: colors.muted, icon: 'chatbox-ellipses' };
    default:
      return { fg: colors.primary, bg: colors.primarySoft, icon: 'information-circle' };
  }
}

/**
 * The app's popup card: navy-tinted backdrop, rounded surface, springy entrance.
 * Used by the dialog host and by pickers (e.g. the jobs date picker).
 */
export function AppModal({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const colors = useColors();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={{
            width: '100%',
            opacity: anim,
            transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
          }}
        >
          <Pressable
            onPress={() => {}}
            style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow }]}
          >
            {children}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function inferTone(opts: DialogOptions): DialogTone {
  if (opts.tone) return opts.tone;
  if (opts.buttons?.some((b) => b.style === 'destructive')) return 'danger';
  return 'primary';
}

function buttonTone(b: DialogButton, dialogTone: DialogTone): DialogTone {
  if (b.style === 'destructive') return 'danger';
  if (b.style === 'cancel') return 'neutral';
  // An error card's "OK" stays brand blue rather than red.
  return dialogTone === 'danger' || dialogTone === 'neutral' ? 'primary' : dialogTone;
}

/**
 * Mount once at the app root. Renders every `appAlert` / `showDialog` call as
 * an app-styled card; calls made while one is open are queued.
 */
export function DialogHost() {
  const colors = useColors();
  const [queue, setQueue] = useState<DialogOptions[]>([]);
  const current = queue[0];

  useEffect(() => registerDialogHost((opts) => setQueue((q) => [...q, opts])), []);

  const close = useCallback((button?: DialogButton) => {
    setQueue((q) => q.slice(1));
    // Let the card close before the action runs (it may navigate or open another dialog).
    if (button?.onPress) setTimeout(button.onPress, 120);
  }, []);

  if (!current) return null;
  const dialogTone = inferTone(current);
  const tone = toneOf(dialogTone, colors);
  const buttons: DialogButton[] = current.buttons?.length ? current.buttons : [{ text: t('common.ok') }];
  const cancelBtn = buttons.find((b) => b.style === 'cancel');
  const cancelable = current.cancelable ?? true;
  const dismiss = () => {
    if (!cancelable) return;
    close(cancelBtn);
  };
  // Two buttons sit side by side (cancel first); three or more stack.
  const ordered = [...buttons].sort((a, b) => Number(b.style === 'cancel') - Number(a.style === 'cancel'));
  const stacked = ordered.length > 2;

  return (
    <AppModal visible onClose={dismiss}>
      <View style={[styles.iconDisc, { backgroundColor: tone.bg }]}>
        <Icon name={current.icon ?? tone.icon} size={28} color={tone.fg} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{current.title}</Text>
      {current.message ? (
        <Text style={[styles.message, { color: colors.mutedForeground }]}>{current.message}</Text>
      ) : null}
      <View style={[styles.actions, stacked && styles.actionsStacked]}>
        {(stacked ? [...ordered].reverse() : ordered).map((b, i) => (
          <ActionButton
            key={`${b.text}-${i}`}
            label={b.text}
            size="md"
            tone={buttonTone(b, dialogTone)}
            variant={b.style === 'cancel' ? 'soft' : 'solid'}
            onPress={() => close(b)}
            style={stacked ? undefined : styles.flexBtn}
          />
        ))}
      </View>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,15,69,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 22,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  iconDisc: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  actionsStacked: { flexDirection: 'column' },
  flexBtn: { flex: 1 },
});

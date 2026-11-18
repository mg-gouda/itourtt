import { Alert } from 'react-native';

/**
 * App-styled replacement for `Alert.alert`. Screens (and shared helpers such
 * as camera / WhatsApp) call `appAlert` or `showDialog`; the `DialogHost` from
 * @itour/ui renders it as a branded card. Without a mounted host (e.g. the
 * supplier/guest apps) it falls back to the native Alert, so it is always safe.
 */

export type DialogTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface DialogOptions {
  title: string;
  message?: string;
  buttons?: DialogButton[];
  tone?: DialogTone;
  /** Ionicons name; picked from the tone when omitted. */
  icon?: string;
  /** Tapping the backdrop / Android back acts as the cancel button (default true). */
  cancelable?: boolean;
}

type Listener = (opts: DialogOptions) => void;
let host: Listener | null = null;

/** Called by DialogHost on mount; returns the unregister function. */
export function registerDialogHost(listener: Listener): () => void {
  host = listener;
  return () => {
    if (host === listener) host = null;
  };
}

export function showDialog(opts: DialogOptions): void {
  if (host) {
    host(opts);
    return;
  }
  Alert.alert(opts.title, opts.message, opts.buttons);
}

/** Drop-in for `Alert.alert(title, message, buttons)` with an optional tone/icon. */
export function appAlert(
  title: string,
  message?: string,
  buttons?: DialogButton[],
  extra?: Pick<DialogOptions, 'tone' | 'icon' | 'cancelable'>,
): void {
  showDialog({ title, message, buttons, ...extra });
}

import { Linking, Platform } from 'react-native';
import { appAlert } from '../utils/dialog';

/**
 * Make a phone call to the given number.
 * Shows a confirmation dialog before dialing.
 */
export function callPhone(phoneNumber: string, name?: string) {
  const cleaned = phoneNumber.replace(/[^\d+]/g, '');
  const label = name ? `Call ${name}?` : 'Make Call?';

  appAlert(label, cleaned, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Call',
      onPress: () => {
        const url = Platform.OS === 'android' ? `tel:${cleaned}` : `telprompt:${cleaned}`;
        Linking.openURL(url).catch(() => {
          appAlert('Error', 'Unable to make phone call');
        });
      },
    },
  ]);
}

/**
 * Open the phone dialer with the number pre-filled (no confirmation).
 */
export function openDialer(phoneNumber: string) {
  const cleaned = phoneNumber.replace(/[^\d+]/g, '');
  Linking.openURL(`tel:${cleaned}`).catch(() => {
    appAlert('Error', 'Unable to open dialer');
  });
}

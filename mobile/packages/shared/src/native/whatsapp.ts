import { Linking } from 'react-native';
import { appAlert } from '../utils/dialog';
import { t } from '../i18n';

/**
 * Turn a phone number into the international digits WhatsApp needs (no "+").
 * Guest numbers are often saved the local Egyptian way (010…, 1…, 0020…);
 * without the country code WhatsApp cannot find the chat. Numbers that already
 * carry a country code (+44…, 0044…, 971…) are kept as they are.
 */
export function toWhatsAppNumber(phoneNumber: string, defaultCountry = '20'): string {
  const raw = phoneNumber.trim();
  let digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  if (raw.startsWith('+')) {
    // "+20 010…" — drop the trunk 0 written after the country code.
    if (digits.startsWith(`${defaultCountry}0`) && digits.length === defaultCountry.length + 11) {
      digits = defaultCountry + digits.slice(defaultCountry.length + 1);
    }
    return digits;
  }
  if (digits.startsWith('00')) return toWhatsAppNumber(`+${digits.slice(2)}`, defaultCountry);
  // Egyptian mobile: 01X XXXX XXXX (11 digits) or 1X XXXX XXXX (10 digits).
  if (defaultCountry === '20') {
    if (/^01[0125]\d{8}$/.test(digits)) return `20${digits.slice(1)}`;
    if (/^1[0125]\d{8}$/.test(digits)) return `20${digits}`;
    if (/^2001[0125]\d{8}$/.test(digits)) return `20${digits.slice(3)}`;
  } else if (digits.startsWith('0')) {
    return defaultCountry + digits.slice(1);
  }
  return digits;
}

/**
 * Open WhatsApp chat with the given phone number (local Egyptian numbers get
 * +20 added). Optionally pre-fills a message.
 */
export async function openWhatsApp(phoneNumber: string, message?: string) {
  const number = toWhatsAppNumber(phoneNumber);
  const encoded = message ? encodeURIComponent(message) : '';
  const url = `whatsapp://send?phone=${number}${encoded ? `&text=${encoded}` : ''}`;

  const supported = await Linking.canOpenURL(url).catch(() => false);
  if (supported) {
    await Linking.openURL(url);
  } else {
    // wa.me opens the app when installed, or the web page otherwise.
    const webUrl = `https://wa.me/${number}${encoded ? `?text=${encoded}` : ''}`;
    Linking.openURL(webUrl).catch(() => {
      appAlert('WhatsApp', t('repApp.whatsappMissing'), undefined, { tone: 'warning', icon: 'logo-whatsapp' });
    });
  }
}

/**
 * Send a WhatsApp message about a job to a phone number.
 * Pre-fills message with job reference and details.
 */
export function sendJobWhatsApp(
  phoneNumber: string,
  jobRef: string,
  details?: { route?: string; date?: string; time?: string },
) {
  let message = `iTour Job: ${jobRef}`;
  if (details?.route) message += `\nRoute: ${details.route}`;
  if (details?.date) message += `\nDate: ${details.date}`;
  if (details?.time) message += `\nTime: ${details.time}`;

  openWhatsApp(phoneNumber, message);
}

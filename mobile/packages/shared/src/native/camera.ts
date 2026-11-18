import { Platform, PermissionsAndroid } from 'react-native';
import { appAlert } from '../utils/dialog';
import { t } from '../i18n';
import { launchCamera, launchImageLibrary, type ImagePickerResponse, type CameraOptions, type ImageLibraryOptions } from 'react-native-image-picker';

export interface CapturedPhoto {
  uri: string;
  fileName: string;
  type: string;
  width?: number;
  height?: number;
  fileSize?: number;
}

/**
 * Request camera permission on Android.
 * iOS handles permission via Info.plist.
 */
async function requestCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA,
    {
      title: 'Camera Permission',
      message: 'This app needs camera access to take photos.',
      buttonPositive: 'Allow',
      buttonNegative: 'Deny',
    },
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}

/**
 * Capture a photo using the device camera.
 * Returns the photo data or null if cancelled/failed.
 */
/**
 * Evidence photo size rule — the same the web portals apply before upload
 * (frontend lib/compress-image.ts): longest edge ≤ 1600 px, JPEG quality 0.82.
 * The server then stamps the photo (date, GPS, people, status).
 */
export const PHOTO_MAX_EDGE = 1600;
export const PHOTO_QUALITY = 0.82;

export async function takePhoto(options?: Partial<CameraOptions>): Promise<CapturedPhoto | null> {
  const hasPermission = await requestCameraPermission();
  if (!hasPermission) {
    appAlert(t('repApp.cameraPermissionTitle'), t('repApp.cameraPermissionBody'), undefined, { tone: 'warning', icon: 'camera' });
    return null;
  }

  return new Promise((resolve) => {
    launchCamera(
      {
        mediaType: 'photo',
        cameraType: 'back',
        quality: PHOTO_QUALITY as CameraOptions['quality'],
        maxWidth: PHOTO_MAX_EDGE,
        maxHeight: PHOTO_MAX_EDGE,
        saveToPhotos: false,
        ...options,
      },
      (response: ImagePickerResponse) => {
        if (response.didCancel || response.errorCode) {
          resolve(null);
          return;
        }
        const asset = response.assets?.[0];
        if (!asset?.uri) {
          resolve(null);
          return;
        }
        resolve({
          uri: asset.uri,
          fileName: asset.fileName || `photo_${Date.now()}.jpg`,
          type: asset.type || 'image/jpeg',
          width: asset.width,
          height: asset.height,
          fileSize: asset.fileSize,
        });
      },
    );
  });
}

/**
 * Pick a photo from the device gallery.
 */
export async function pickPhoto(options?: Partial<ImageLibraryOptions>): Promise<CapturedPhoto | null> {
  return new Promise((resolve) => {
    launchImageLibrary(
      {
        mediaType: 'photo',
        quality: 0.8,
        maxWidth: 1280,
        maxHeight: 1280,
        ...options,
      },
      (response: ImagePickerResponse) => {
        if (response.didCancel || response.errorCode) {
          resolve(null);
          return;
        }
        const asset = response.assets?.[0];
        if (!asset?.uri) {
          resolve(null);
          return;
        }
        resolve({
          uri: asset.uri,
          fileName: asset.fileName || `photo_${Date.now()}.jpg`,
          type: asset.type || 'image/jpeg',
          width: asset.width,
          height: asset.height,
          fileSize: asset.fileSize,
        });
      },
    );
  });
}

/**
 * Show action sheet to choose camera or gallery.
 */
export function captureOrPick(): Promise<CapturedPhoto | null> {
  return new Promise((resolve) => {
    appAlert('Add Photo', 'Choose an option', [
      { text: 'Camera', onPress: () => takePhoto().then(resolve) },
      { text: 'Gallery', onPress: () => pickPhoto().then(resolve) },
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
    ]);
  });
}

import { useState, useCallback } from 'react';
import Geolocation from '@react-native-community/geolocation';
import { Platform, PermissionsAndroid } from 'react-native';

interface GPSPosition {
  lat: number;
  lng: number;
}

export function useGPS() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === 'ios') return true;

    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location Permission',
        message: 'This app needs access to your location for job tracking.',
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }, []);

  const captureGPS = useCallback(
    async (timeout = 15000): Promise<GPSPosition> => {
      setLoading(true);
      setError(null);

      const hasPermission = await requestPermission();
      if (!hasPermission) {
        setLoading(false);
        const err = 'Location permission denied. Please enable GPS access.';
        setError(err);
        throw new Error(err);
      }

      return new Promise((resolve, reject) => {
        Geolocation.getCurrentPosition(
          (position) => {
            setLoading(false);
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
          },
          (positionError) => {
            setLoading(false);
            let msg: string;
            switch (positionError.code) {
              case 1:
                msg = 'Location permission denied. Please enable GPS access.';
                break;
              case 2:
                msg = 'Location unavailable. Please check your GPS settings.';
                break;
              case 3:
                msg = 'Location request timed out. Please try again.';
                break;
              default:
                msg = 'Unable to get location';
            }
            setError(msg);
            reject(new Error(msg));
          },
          {
            enableHighAccuracy: true,
            timeout,
            maximumAge: 30000,
          },
        );
      });
    },
    [requestPermission],
  );

  return { captureGPS, loading, error };
}

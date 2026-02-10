export function captureGPS(timeout = 15000): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error("Location permission denied. Please enable GPS access."));
            break;
          case error.POSITION_UNAVAILABLE:
            reject(new Error("Location unavailable. Please check your GPS settings."));
            break;
          case error.TIMEOUT:
            reject(new Error("Location request timed out. Please try again."));
            break;
          default:
            reject(new Error("Unable to get location"));
        }
      },
      {
        enableHighAccuracy: true,
        timeout,
        maximumAge: 30000,
      }
    );
  });
}

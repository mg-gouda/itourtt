export function captureGPS(timeout = 30000): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser"));
      return;
    }

    // Stage 1: high-accuracy GPS
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        // Only fall back on timeout; propagate permission/unavailable errors immediately
        if (error.code !== error.TIMEOUT) {
          reject(_mapError(error));
          return;
        }

        // Stage 2: network/WiFi fallback (faster, works indoors)
        navigator.geolocation.getCurrentPosition(
          (position) => {
            resolve({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            });
          },
          (fallbackError) => reject(_mapError(fallbackError)),
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
        );
      },
      { enableHighAccuracy: true, timeout, maximumAge: 30000 },
    );
  });
}

function _mapError(error: GeolocationPositionError): Error {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return new Error("Location permission denied. Please enable GPS access.");
    case error.POSITION_UNAVAILABLE:
      return new Error("Location unavailable. Please check your GPS settings.");
    case error.TIMEOUT:
      return new Error("Location request timed out. Please try again later.");
    default:
      return new Error("Unable to get location");
  }
}

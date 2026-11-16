import type { MetadataRoute } from "next";

/**
 * Lets reps/drivers add the portal to their Home Screen. On iPhone this is
 * required for browser push notifications (iOS 16.4+ only pushes to
 * Home-Screen web apps).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "iTour Transport & Traffic",
    short_name: "iTour TT",
    start_url: "/login",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1e3a8a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}

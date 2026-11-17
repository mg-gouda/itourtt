import { setApiBaseUrl } from './api/client';

/** The production server the rep / driver apps talk to (same backend + DB as the web portals). */
export const PRODUCTION_API_URL = 'https://fulvago.itourtt.cloud';

/**
 * Point the API client at the right server. Release builds always use
 * production; a debug build can pass a dev URL (e.g. http://10.0.2.2:3001).
 */
export function configureApi(devUrl?: string) {
  setApiBaseUrl(__DEV__ && devUrl ? devUrl : PRODUCTION_API_URL);
}

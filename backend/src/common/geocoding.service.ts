import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service.js';

export interface PlaceResult {
  placeId: string;
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  constructor(private readonly settings: SettingsService) {}

  private async getApiKey(): Promise<string> {
    const s = await this.settings.getSystemSettings();
    const key = (s as any).googleMapsApiKey;
    if (!key) {
      throw new Error('Google Maps API key not configured. Set it in Settings > System.');
    }
    return key;
  }

  /**
   * Search for places using Google Places Text Search API.
   */
  async searchPlaces(query: string, type?: string): Promise<PlaceResult[]> {
    const apiKey = await this.getApiKey();

    const params = new URLSearchParams({
      query,
      key: apiKey,
    });

    // Map our location types to Google place types for better results
    if (type) {
      const typeMap: Record<string, string> = {
        country: 'country',
        airport: 'airport',
        city: 'locality',
        zone: 'sublocality',
        hotel: 'lodging',
      };
      if (typeMap[type]) {
        params.set('type', typeMap[type]);
      }
    }

    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      this.logger.warn(`Google Places API error: ${data.status} - ${data.error_message || ''}`);
      return [];
    }

    return (data.results || []).slice(0, 10).map((r: any) => ({
      placeId: r.place_id,
      name: r.name,
      formattedAddress: r.formatted_address,
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
    }));
  }

  /**
   * Geocode an address string to coordinates using Google Geocoding API.
   */
  async geocodeAddress(query: string): Promise<PlaceResult[]> {
    const apiKey = await this.getApiKey();

    const params = new URLSearchParams({
      address: query,
      key: apiKey,
    });

    const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      this.logger.warn(`Google Geocoding API error: ${data.status} - ${data.error_message || ''}`);
      return [];
    }

    return (data.results || []).slice(0, 5).map((r: any) => ({
      placeId: r.place_id,
      name: r.formatted_address,
      formattedAddress: r.formatted_address,
      lat: r.geometry.location.lat,
      lng: r.geometry.location.lng,
    }));
  }
}

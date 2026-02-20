import api from '../client';
import type {
  LocationTree,
  VehicleType,
  QuoteRequest,
  QuoteResponse,
  CreateGuestBooking,
  GuestBooking,
} from '../../types';

export const publicApi = {
  getLocations() {
    return api.get<LocationTree>('/public/locations');
  },

  getVehicleTypes() {
    return api.get<VehicleType[]>('/public/vehicle-types');
  },

  getQuote(params: QuoteRequest) {
    return api.post<QuoteResponse>('/public/quote', params);
  },

  createBooking(data: CreateGuestBooking) {
    return api.post<GuestBooking>('/public/bookings', data);
  },

  getBooking(ref: string) {
    return api.get<GuestBooking>(`/public/bookings/${ref}`);
  },

  cancelBooking(ref: string) {
    return api.post(`/public/bookings/${ref}/cancel`);
  },
};

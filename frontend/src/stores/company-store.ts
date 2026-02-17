'use client';

import { create } from 'zustand';
import api from '@/lib/api';

interface CompanyState {
  logoUrl: string | null;
  faviconUrl: string | null;
  companyName: string;
  isLoaded: boolean;
  isLoading: boolean;
  loadCompanySettings: () => Promise<void>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export const useCompanyStore = create<CompanyState>((set, get) => ({
  logoUrl: null,
  faviconUrl: null,
  companyName: 'iTour TT',
  isLoaded: false,
  isLoading: false,

  loadCompanySettings: async () => {
    if (get().isLoading || get().isLoaded) return;
    set({ isLoading: true });
    try {
      const { data } = await api.get('/settings/company');
      set({
        logoUrl: data.logoUrl ? `${API_BASE}${data.logoUrl}` : null,
        faviconUrl: data.faviconUrl ? `${API_BASE}${data.faviconUrl}` : null,
        companyName: data.companyName || 'iTour TT',
        isLoaded: true,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false, isLoaded: true });
    }
  },
}));

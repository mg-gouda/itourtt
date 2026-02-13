'use client';

import { create } from 'zustand';
import api from '@/lib/api';
import type { AuthUser, AuthResponse, LoginPayload } from '@/types';
import { usePermissionsStore } from './permissions-store';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (payload: LoginPayload) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post<AuthResponse>('/auth/login', payload);
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      set({ user: data.user, isAuthenticated: true, isLoading: false });
      // Load granular permissions after successful login
      usePermissionsStore.getState().loadPermissions();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Login failed';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    usePermissionsStore.getState().clear();
    set({ user: null, isAuthenticated: false, error: null });
    window.location.href = '/login';
  },

  hydrate: () => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('accessToken');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as AuthUser;
        set({ user, isAuthenticated: true });
        // Load granular permissions on hydrate
        usePermissionsStore.getState().loadPermissions();
      } catch {
        set({ user: null, isAuthenticated: false });
      }
    }
  },
}));

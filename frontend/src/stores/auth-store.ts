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
  isAccountLocked: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  isAccountLocked: false,

  login: async (payload: LoginPayload) => {
    set({ isLoading: true, error: null, isAccountLocked: false });
    try {
      const { data } = await api.post<AuthResponse>('/auth/login', payload);
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      set({ user: data.user, isAuthenticated: true, isLoading: false });
      // Load granular permissions after successful login
      usePermissionsStore.getState().loadPermissions();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Login failed';

      if (status === 423) {
        // Account locked due to concurrent login
        set({ error: message, isLoading: false, isAccountLocked: true });
      } else {
        set({ error: message, isLoading: false, isAccountLocked: false });
      }
      throw err;
    }
  },

  logout: async () => {
    // Notify the server to clear the session (allows clean re-login)
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignore — clear locally regardless
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    usePermissionsStore.getState().clear();
    set({ user: null, isAuthenticated: false, error: null, isAccountLocked: false });
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

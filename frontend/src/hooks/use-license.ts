'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface LicenseStatus {
  valid: boolean;
  expiresAt: string | null;
  daysRemaining: number | null;
  message: string;
}

export function useLicense() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/settings/license-status')
      .then(({ data }) => setStatus(data))
      .catch(() =>
        setStatus({ valid: false, expiresAt: null, daysRemaining: null, message: 'Unable to verify license' }),
      )
      .finally(() => setLoading(false));
  }, []);

  return { status, loading };
}

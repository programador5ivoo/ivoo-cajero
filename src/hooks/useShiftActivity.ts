import { useCallback, useEffect, useState } from 'react';
import { cashierApi } from '../api';
import type { CashierApi, ShiftActivity } from '../api';

/**
 * "Controller" de la pantalla F.
 *
 * `enabled` evita pedir la actividad antes de que exista sesión de caja (con la
 * API real esa llamada respondería 401). `reload` resuelve los estados PENDING.
 */
export function useShiftActivity(enabled: boolean, api: CashierApi = cashierApi) {
    const [activity, setActivity] = useState<ShiftActivity | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        if (!enabled) return;
        setLoading(true);
        setError(null);
        try {
            setActivity(await api.getShiftActivity());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No pudimos cargar la actividad');
        } finally {
            setLoading(false);
        }
    }, [api, enabled]);

    useEffect(() => {
        void reload();
    }, [reload]);

    return { activity, loading, error, reload };
}

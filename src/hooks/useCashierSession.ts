import { useCallback, useState } from 'react';
import { applyAccessToken, cashierApi } from '../api';
import type { CashierApi, CashierSession } from '../api';

interface UseCashierSession {
    session: CashierSession | null;
    submitting: boolean;
    error: string | null;
    login: (username: string, pin: string) => Promise<void>;
    logout: () => void;
}

/**
 * "Controller" del login, que ahora es la PRIMERA pantalla.
 *
 * Antes la tienda salía de la URL y mandaba sobre todo; ahora primero se
 * identifica la persona y la tienda se elige después, ya autenticado. El rol
 * que vuelve en la sesión decide si va al portal de caja o al panel de
 * administración.
 */
export function useCashierSession(api: CashierApi = cashierApi): UseCashierSession {
    const [session, setSession] = useState<CashierSession | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const login = useCallback(
        async (username: string, pin: string) => {
            setSubmitting(true);
            setError(null);
            try {
                const next = await api.login({ username, pin });
                applyAccessToken(next.accessToken);
                setSession(next);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'No pudimos iniciar la sesión');
            } finally {
                setSubmitting(false);
            }
        },
        [api]
    );

    const logout = useCallback(() => {
        applyAccessToken(null);
        setSession(null);
    }, []);

    return { session, submitting, error, login, logout };
}

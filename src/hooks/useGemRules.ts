import { useEffect, useState } from 'react';
import { cashierApi } from '../api';
import type { CashierApi, GemRules } from '../api';

/**
 * Trae las reglas vigentes del programa.
 *
 * Se piden al backend en vez de hardcodearse en el front: las gemas por método
 * de pago y las horas de retención son configuración de negocio (el panel de
 * gestión las administra), no constantes de esta app.
 */
export function useGemRules(enabled: boolean, api: CashierApi = cashierApi) {
    const [rules, setRules] = useState<GemRules | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        api.getRules()
            .then(next => {
                if (!cancelled) setRules(next);
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : 'No pudimos cargar las reglas');
            });
        return () => {
            cancelled = true;
        };
    }, [api, enabled]);

    return { rules, error };
}

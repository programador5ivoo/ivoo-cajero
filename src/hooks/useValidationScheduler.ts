import { useCallback, useEffect, useRef, useState } from 'react';
import { cashierApi } from '../api';
import type { CashierApi } from '../api';

/** Cada cuánto revisa el portal si hay ventas vencidas. */
const TICK_MS = 60_000;

export interface ValidationRun {
    at: string;
    checked: number;
    released: number;
    rejected: number;
}

/**
 * Dispara la validación diferida de facturas.
 *
 * LIMITACIÓN IMPORTANTE: esto corre en el NAVEGADOR. Revisa al montar y cada
 * minuto, así que una venta se valida la primera vez que alguien abre el portal
 * después de que venció su ventana de 4 horas — no exactamente a las 4 horas.
 * Si nadie lo abre en todo el fin de semana, nadie valida.
 *
 * Es lo máximo que se puede hacer sin backend. En producción esto tiene que ser
 * un CRON DEL SERVIDOR llamando a la misma lógica (`runDueValidations`), y este
 * hook queda solo como refresco de la UI.
 */
export function useValidationScheduler(
    enabled: boolean,
    api: CashierApi = cashierApi
) {
    const [lastRun, setLastRun] = useState<ValidationRun | null>(null);
    const [running, setRunning] = useState(false);
    /** Evita que dos corridas se solapen si una consulta se hace lenta. */
    const inFlight = useRef(false);

    const run = useCallback(async (): Promise<ValidationRun | null> => {
        if (inFlight.current) return null;
        inFlight.current = true;
        setRunning(true);
        try {
            const outcome = await api.runDueValidations();
            const next = { at: new Date().toISOString(), ...outcome };
            setLastRun(next);
            return next;
        } catch {
            // Una corrida fallida no debe romper la pantalla: se reintenta sola
            // en el próximo tick, y las ventas siguen retenidas mientras tanto.
            return null;
        } finally {
            inFlight.current = false;
            setRunning(false);
        }
    }, [api]);

    useEffect(() => {
        if (!enabled) return;

        void run();
        const timer = setInterval(() => void run(), TICK_MS);

        return () => clearInterval(timer);
    }, [enabled, run]);

    return { lastRun, running, run };
}

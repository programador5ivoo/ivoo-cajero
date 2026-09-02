import { useCallback, useRef, useState } from 'react';
import { cashierApi } from '../api';
import type { CashierApi, SaleDraft, SaleResult, Store } from '../api';
import { createIdempotencyKey } from '../domain/idempotency';

/**
 * "Controller" del envío de la venta (pantallas D y E).
 *
 * Tres barreras contra una doble retención, en orden:
 *
 *   1. `disabled={submitting}` en el botón — evita el clic obvio.
 *   2. `inFlight` (ref síncrono) — evita el doble clic rápido que se cuela
 *      antes de que React aplique el estado.
 *   3. La clave de idempotencia, creada UNA vez al abrir la intención
 *      (`beginIntent`) — si aun así llegan dos peticiones, o si el cajero
 *      reintenta tras un fallo de red, el servidor reconoce la misma clave y
 *      devuelve la venta original en vez de crear otra.
 *
 * Y en el servidor hay una cuarta: la misma factura en la misma tienda responde
 * 409, aunque venga con otra clave.
 */
export function useSaleSubmission(api: CashierApi = cashierApi) {
    const idempotencyKey = useRef<string | null>(null);
    /** Envío en curso. Ver la guarda en `submit`. */
    const inFlight = useRef(false);
    const [result, setResult] = useState<SaleResult | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const beginIntent = useCallback(() => {
        idempotencyKey.current = createIdempotencyKey();
        inFlight.current = false;
        setResult(null);
        setError(null);
    }, []);

    /** Devuelve el resultado (o `null` si falló) para que la vista decida el paso. */
    const submit = useCallback(
        async (draft: SaleDraft, store: Store): Promise<SaleResult | null> => {
            // Guarda contra doble envío. `submitting` es estado de React y se
            // aplica en el siguiente render, así que dos clics rápidos pueden
            // colarse antes de que el botón se deshabilite. Este ref es
            // síncrono: el segundo clic sale por acá y no llega a la red.
            if (inFlight.current) return null;
            inFlight.current = true;

            if (!idempotencyKey.current) idempotencyKey.current = createIdempotencyKey();
            setSubmitting(true);
            setError(null);
            try {
                const next = await api.registerSale(draft, store, idempotencyKey.current);
                setResult(next);
                return next;
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : 'No pudimos enviar la venta. Reintenta: no se retendrá dos veces.'
                );
                return null;
            } finally {
                inFlight.current = false;
                setSubmitting(false);
            }
        },
        [api]
    );

    /** Cierra la intención actual. La próxima venta usará una clave nueva. */
    const clearIntent = useCallback(() => {
        idempotencyKey.current = null;
        inFlight.current = false;
        setResult(null);
        setError(null);
    }, []);

    return { result, submitting, error, beginIntent, submit, clearIntent };
}

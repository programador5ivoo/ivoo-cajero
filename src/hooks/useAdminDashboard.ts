import { useCallback, useEffect, useState } from 'react';
import { cashierApi } from '../api';
import type { AdminDashboard, AuditEntry, CashierApi } from '../api';

/**
 * "Controller" del panel de administración: cifras, ventas e historial.
 *
 * Las tres cosas se recargan juntas porque anular una venta mueve las tres a la
 * vez (cifras, estado de la venta y una entrada nueva en el historial).
 */
export function useAdminDashboard(enabled: boolean, api: CashierApi = cashierApi) {
    const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
    const [audit, setAudit] = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [nextDashboard, nextAudit] = await Promise.all([
                api.getAdminDashboard(),
                api.getAuditLog()
            ]);
            setDashboard(nextDashboard);
            setAudit(nextAudit);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No pudimos cargar el panel');
        } finally {
            setLoading(false);
        }
    }, [api]);

    useEffect(() => {
        if (enabled) void reload();
    }, [enabled, reload]);

    const cancelSale = useCallback(
        async (saleId: string, reason: string) => {
            setError(null);
            try {
                await api.cancelSale(saleId, reason);
                await reload();
            } catch (err) {
                setError(
                    err instanceof Error ? err.message : 'No pudimos anular la venta'
                );
            }
        },
        [api, reload]
    );

    return { dashboard, audit, loading, error, reload, cancelSale };
}

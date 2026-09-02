import type {
    AdminDashboard,
    AuditEntry,
    CashierSession,
    GemRules,
    MemberLookup,
    SaleDraft,
    SaleResult,
    ShiftActivity,
    Store
} from './types';

/**
 * Contrato del servicio del portal del cajero (DIP).
 *
 * Los hooks dependen de esta interfaz, nunca de una implementación concreta.
 * Las tiendas y la validación de facturas NO están acá: salen de APIs externas
 * reales (`stores-api.ts`, `invoice-validation.ts`) que no dependen de si el
 * backend de IVOO+ existe o no.
 */
export interface CashierApi {
    /** Abre sesión. La tienda se elige DESPUÉS, ya autenticado. */
    login(input: { username: string; pin: string }): Promise<CashierSession>;

    /** Reglas vigentes: gemas por método de pago y horas de retención. */
    getRules(): Promise<GemRules>;

    lookupMember(documentId: string): Promise<MemberLookup>;

    /**
     * Registra la venta con las gemas RETENIDAS.
     *
     * `idempotencyKey` se genera UNA vez por intención de venta y se reutiliza
     * en cada reintento: si se generara en cada intento, un reintento de red
     * produciría una doble retención.
     */
    registerSale(
        draft: SaleDraft,
        store: Store,
        idempotencyKey: string
    ): Promise<SaleResult>;

    getShiftActivity(): Promise<ShiftActivity>;

    /**
     * Corre la validación de las ventas cuya ventana ya venció.
     *
     * En producción esto es un cron del servidor; acá lo dispara el navegador
     * (ver `mock-cashier-api.ts`). Devuelve cuántas resolvió.
     */
    runDueValidations(): Promise<{ checked: number; released: number; rejected: number }>;

    /** Cifras y ventas del panel de administración. */
    getAdminDashboard(): Promise<AdminDashboard>;

    /** Anula una venta retenida. Queda en el historial, no se borra. */
    cancelSale(saleId: string, reason: string): Promise<void>;

    /** Historial completo, más reciente primero. */
    getAuditLog(): Promise<AuditEntry[]>;
}

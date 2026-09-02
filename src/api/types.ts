/**
 * DTOs del portal del cajero.
 *
 * Espejo manual del contrato. Dos fuentes de verdad EXTERNAS y reales mandan
 * sobre parte de esto (ver `stores-api.ts` e `invoice-validation.ts`):
 *   - tiendas:            GET /api/admin/stores
 *   - validez de factura: GET /api/public/validate-invoice?doc=&cod_t=
 */

export type PaymentMethodCode =
    | 'EFECTIVO'
    | 'TDD'
    | 'PAGO_MOVIL'
    | 'ZELLE'
    | 'BINANCE'
    | 'TRANSFERENCIA'
    | 'TDC_INTERNACIONAL';

export interface PaymentMethod {
    code: PaymentMethodCode;
    label: string;
    /**
     * Gemas que otorga usar este método. Es EL total de la venta, no un sumando:
     * una venta tiene un único método de pago.
     *
     * El valor es VARIABLE y lo sirve el backend (`GET /v1/cashier/rules`). El
     * front nunca lo hardcodea ni asume rangos: si mañana Efectivo pasa de 10 a
     * 250, esta app no cambia.
     */
    gems: number;
}

/** Reglas vigentes del programa, servidas por el backend. */
export interface GemRules {
    gemValue: number;
    currency: string;
    paymentMethods: PaymentMethod[];
    /** Horas que las gemas quedan retenidas antes de validar la factura. */
    retentionHours: number;
}

/** Tienda tal como la devuelve `GET /api/admin/stores`. */
export interface Store {
    /** `id` numérico del API de tiendas. */
    id: number;
    name: string;
    city: string;
    state: string;
    magentoId: string;
    /** `cod_t` de `validate-invoice`: el `id` con relleno a 2 dígitos. */
    code: string;
}

export type CashierRole = 'CASHIER' | 'ADMIN';

export interface Cashier {
    username: string;
    displayName: string;
    role: CashierRole;
    /** Caja asignada dentro de la tienda. Identifica el puesto, no la persona. */
    registerCode?: string;
}

export interface Shift {
    id: string;
    startedAt: string;
}

export interface CashierSession {
    accessToken: string;
    cashier: Cashier;
    shift: Shift;
    /**
     * Tienda asignada al usuario. Viene resuelta desde el servidor: el cajero
     * NO la elige, y por lo tanto no puede operar como otra tienda. `null` para
     * el administrador, que no está atado a ninguna.
     */
    store: Store | null;
}

export interface MemberLookup {
    documentId: string;
    found: boolean;
    fullName?: string;
    memberCode?: string;
    active?: boolean;
}

/** Cómo llegó el documento del cliente: escaneado o tecleado (auditoría). */
export type DocumentSource = 'QR' | 'MANUAL';

/** Lo que el cajero describe de la venta. Sin monto: la factura no lo expone. */
export interface SaleDraft {
    storeId: number;
    invoiceNumber: string;
    documentId: string;
    customerName: string;
    customerPhone: string;
    /**
     * UN método de pago, no una lista.
     *
     * Antes era un arreglo y las gemas eran la suma de lo marcado, lo que
     * permitía inflar la acreditación marcando los siete. Con un solo valor el
     * problema desaparece por construcción: no hay nada que sumar.
     */
    paymentMethod: PaymentMethodCode;
    documentSource: DocumentSource;
}

/**
 * Ciclo de vida de una venta.
 *
 * Las gemas NO se acreditan al registrar: quedan RETENIDAS. Cuatro horas
 * después la tarea programada consulta `validate-invoice`; recién ahí se
 * liberan o se rechazan.
 */
export type SaleStatus =
    /** Registrada. Gemas retenidas, esperando la ventana de validación. */
    | 'RETAINED'
    /** La factura existe en el sistema de la tienda. Gemas liberadas. */
    | 'RELEASED'
    /** La factura no existe. Gemas no se acreditan. */
    | 'REJECTED'
    /** Anulada a mano desde el panel de administración. */
    | 'CANCELLED';

/** Resultado de consultar `validate-invoice` para una venta. */
export interface InvoiceValidation {
    attemptedAt: string;
    /** `true` si la factura devolvió productos (HTTP 200). */
    found: boolean;
    /** Descripción de los productos que devolvió el API, para auditar. */
    product?: string;
    quantity?: string;
    /** Motivo cuando la consulta falló por red/servidor, no por factura ausente. */
    error?: string;
}

export interface SaleRecord {
    id: string;
    /** Fecha de registro. INMUTABLE: se sella en el servidor y no se edita nunca. */
    registeredAt: string;
    /** `registeredAt` + `retentionHours`. Antes de esto no se valida. */
    validateAfter: string;
    storeId: number;
    storeCode: string;
    storeName: string;
    invoiceNumber: string;
    documentId: string;
    customerName: string;
    customerPhone: string;
    /** Único método de pago de la venta. */
    paymentMethod: PaymentMethodCode;
    /** Gemas en juego: retenidas, liberadas o perdidas según `status`. */
    gems: number;
    status: SaleStatus;
    cashierUsername: string;
    documentSource: DocumentSource;
    memberName?: string;
    /** Último intento de validación. `null` mientras no se haya intentado. */
    validation: InvoiceValidation | null;
}

/** Lo que devuelve registrar una venta. */
export interface SaleResult {
    id: string;
    status: SaleStatus;
    gems: number;
    invoiceNumber: string;
    documentId: string;
    customerName: string;
    memberName?: string;
    message: string;
    registeredAt: string;
    validateAfter: string;
}

export interface ShiftActivity {
    startedAt: string;
    total: number;
    retained: number;
    released: number;
    rejected: number;
    sales: SaleRecord[];
}

/** Acciones que quedan en el historial. Nada se borra: el log es append-only. */
export type AuditAction =
    | 'LOGIN'
    | 'LOGOUT'
    | 'LOGIN_BLOCKED'
    | 'SALE_REGISTERED'
    | 'VALIDATION_RUN'
    | 'GEMS_RELEASED'
    | 'SALE_REJECTED'
    | 'SALE_CANCELLED';

export interface AuditEntry {
    id: string;
    at: string;
    action: AuditAction;
    /** Quién la ejecutó. `sistema` para lo que dispara la tarea programada. */
    actor: string;
    saleId?: string;
    invoiceNumber?: string;
    storeCode?: string;
    gems?: number;
    detail: string;
}

/** Cifras del panel de administración. */
export interface AdminDashboard {
    retainedGems: number;
    releasedGems: number;
    rejectedGems: number;
    cancelledGems: number;
    retainedCount: number;
    releasedCount: number;
    rejectedCount: number;
    cancelledCount: number;
    /** Ventas cuya ventana de 4 h ya venció y siguen sin validar. */
    dueCount: number;
    sales: SaleRecord[];
}

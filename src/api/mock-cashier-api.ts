import type { CashierApi } from './cashier-api.interface';
import { CashierApiError } from './http-cashier-api';
import { validateInvoice } from './invoice-validation';
import {
    LOCKOUT_MINUTES,
    MAX_LOGIN_ATTEMPTS,
    mockMembers,
    mockRules,
    mockUsers
} from './mock-data';
import { fetchStores } from './stores-api';
import { gemsForMethod } from '../domain/gems';
import { normalizeDocument } from '../domain/document';
import { isDue, retentionHours, validateAfterFrom } from '../domain/retention';
import type {
    AdminDashboard,
    AuditAction,
    AuditEntry,
    CashierSession,
    GemRules,
    MemberLookup,
    SaleDraft,
    SaleRecord,
    SaleResult,
    ShiftActivity,
    Store
} from './types';

const STORAGE_KEY = 'IVOO_CAJERO_ESTADO_v2';
const delay = (ms = 260) => new Promise(resolve => setTimeout(resolve, ms));

/** Fallos de login por usuario. Persistido: un refresh no debe limpiar el bloqueo. */
interface LoginAttempts {
    failures: number;
    blockedUntil: string | null;
}

interface PersistedState {
    sales: SaleRecord[];
    audit: AuditEntry[];
    /** Respuestas ya emitidas por clave de idempotencia. */
    processed: Record<string, SaleResult>;
    attempts: Record<string, LoginAttempts>;
}

const EMPTY: PersistedState = { sales: [], audit: [], processed: {}, attempts: {} };

/**
 * Implementación local del contrato, para operar sin backend de IVOO+.
 *
 * A diferencia del mock anterior, este PERSISTE en `localStorage`: la retención
 * de gemas dura horas, así que las ventas tienen que sobrevivir a un refresh o
 * el flujo no se puede probar. La SESIÓN sigue siendo solo de memoria — una
 * caja es un equipo compartido y un refresh debe cerrar el turno.
 *
 * La validación de facturas NO es simulada: pega contra el API real
 * (`validate-invoice`). Lo único fingido acá es el ledger de IVOO+.
 */
export class MockCashierApi implements CashierApi {
    private state: PersistedState = readState();
    private currentUser = 'sistema';
    private shiftStartedAt = new Date().toISOString();
    /** Tiendas del API real, cacheadas para no repedirlas en cada login. */
    private storesCache: Store[] | null = null;

    private persist(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
        } catch {
            // Cuota llena o modo privado: el flujo sigue en memoria.
        }
    }

    private log(
        action: AuditAction,
        detail: string,
        extra: Partial<AuditEntry> = {}
    ): void {
        this.state.audit = [
            {
                id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                at: new Date().toISOString(),
                action,
                actor: extra.actor ?? this.currentUser,
                detail,
                ...extra
            },
            ...this.state.audit
        ];
    }

    async login(input: { username: string; pin: string }): Promise<CashierSession> {
        await delay(420);

        const username = input.username.trim().toLowerCase();

        // 1. ¿Está bloqueado? Se comprueba ANTES de mirar la contraseña: si no,
        // el bloqueo no serviría de nada — se podría seguir probando PINs y
        // distinguir "bloqueado" de "PIN incorrecto" por el mensaje.
        const blockedFor = this.remainingBlockMs(username);
        if (blockedFor > 0) {
            throw new CashierApiError(
                `Demasiados intentos fallidos. Vuelve a intentar en ${describeWait(blockedFor)}.`,
                429
            );
        }

        const user = mockUsers[username];
        const ok = Boolean(user) && user.pin === input.pin;

        if (!ok) {
            this.registerFailure(username);
            throw new CashierApiError('Usuario o PIN incorrecto', 401);
        }

        // 2. Un cajero SIN tienda asignada no puede operar: no habría `cod_t`
        // con el que validar sus facturas.
        let store: Store | null = null;
        if (user.role === 'CASHIER') {
            if (!user.storeId) {
                throw new CashierApiError(
                    'Tu usuario no tiene una tienda asignada. Contacta a administración.',
                    403
                );
            }
            store = await this.resolveStore(user.storeId);
            if (!store) {
                throw new CashierApiError(
                    'No pudimos resolver tu tienda asignada. Reintenta en un momento.',
                    503
                );
            }
        }

        // 3. Login correcto: se limpia el contador de fallos.
        delete this.state.attempts[username];

        this.currentUser = username;
        this.shiftStartedAt = new Date().toISOString();
        this.log(
            'LOGIN',
            user.role === 'ADMIN'
                ? 'Inició sesión como administrador'
                : `Abrió ${user.registerCode} en ${store?.name}`,
            { storeCode: store?.code }
        );
        this.persist();

        return {
            accessToken: `mock-token-${username}`,
            cashier: {
                username,
                displayName: user.displayName,
                role: user.role,
                registerCode: user.registerCode
            },
            shift: { id: `shift-${Date.now()}`, startedAt: this.shiftStartedAt },
            store
        };
    }

    /** Milisegundos que faltan para poder reintentar. 0 si no está bloqueado. */
    private remainingBlockMs(username: string): number {
        const blockedUntil = this.state.attempts[username]?.blockedUntil;
        if (!blockedUntil) return 0;

        const remaining = new Date(blockedUntil).getTime() - Date.now();
        if (remaining > 0) return remaining;

        // El bloqueo venció: se limpia para que el contador arranque de cero.
        delete this.state.attempts[username];
        this.persist();
        return 0;
    }

    /**
     * Suma un fallo y bloquea al llegar al tope.
     *
     * El historial recibe UNA entrada, al bloquear — no una por cada intento.
     */
    private registerFailure(username: string): void {
        const current = this.state.attempts[username]?.failures ?? 0;
        const failures = current + 1;

        if (failures >= MAX_LOGIN_ATTEMPTS) {
            const blockedUntil = new Date(
                Date.now() + LOCKOUT_MINUTES * 60_000
            ).toISOString();

            this.state.attempts[username] = { failures: 0, blockedUntil };
            this.log(
                'LOGIN_BLOCKED',
                `Bloqueado tras ${MAX_LOGIN_ATTEMPTS} intentos fallidos. Se libera en ${LOCKOUT_MINUTES} min`,
                { actor: username || '(vacío)' }
            );
        } else {
            this.state.attempts[username] = { failures, blockedUntil: null };
        }

        this.persist();
    }

    /** Resuelve la tienda asignada contra el API real, con caché por sesión. */
    private async resolveStore(storeId: number): Promise<Store | null> {
        try {
            if (!this.storesCache) this.storesCache = await fetchStores();
            return this.storesCache.find(store => store.id === storeId) ?? null;
        } catch {
            return null;
        }
    }

    async getRules(): Promise<GemRules> {
        await delay(120);
        return { ...mockRules, retentionHours: retentionHours() };
    }

    async lookupMember(documentId: string): Promise<MemberLookup> {
        await delay(220);
        const normalized = normalizeDocument(documentId);
        return mockMembers[normalized] ?? { documentId: normalized, found: false };
    }

    async registerSale(
        draft: SaleDraft,
        store: Store,
        idempotencyKey: string
    ): Promise<SaleResult> {
        await delay(560);

        // Idempotencia: un reintento con la misma clave devuelve la respuesta
        // original sin volver a retener.
        const already = this.state.processed[idempotencyKey];
        if (already) return already;

        const duplicate = this.state.sales.find(
            sale =>
                sale.invoiceNumber === draft.invoiceNumber &&
                sale.storeCode === store.code &&
                sale.status !== 'CANCELLED'
        );

        if (duplicate) {
            throw new CashierApiError(
                `La factura ${draft.invoiceNumber} ya fue registrada en ${store.name}.`,
                409
            );
        }

        const member = mockMembers[normalizeDocument(draft.documentId)];
        const gems = gemsForMethod(draft.paymentMethod, mockRules);
        // Sellado en el "servidor". El front nunca envía la fecha y no hay
        // ninguna vía para editarla después.
        const registeredAt = new Date().toISOString();

        const sale: SaleRecord = {
            id: `venta-${Date.now()}`,
            registeredAt,
            validateAfter: validateAfterFrom(registeredAt),
            storeId: store.id,
            storeCode: store.code,
            storeName: store.name,
            invoiceNumber: draft.invoiceNumber,
            documentId: draft.documentId,
            customerName: draft.customerName,
            customerPhone: draft.customerPhone,
            paymentMethod: draft.paymentMethod,
            gems,
            status: 'RETAINED',
            cashierUsername: this.currentUser,
            documentSource: draft.documentSource,
            memberName: member?.fullName,
            validation: null
        };

        const result: SaleResult = {
            id: sale.id,
            status: 'RETAINED',
            gems,
            invoiceNumber: sale.invoiceNumber,
            documentId: sale.documentId,
            customerName: sale.customerName,
            memberName: sale.memberName,
            registeredAt,
            validateAfter: sale.validateAfter,
            message: `Se retuvieron ${gems} gemas. Se liberan al validar la factura ${sale.invoiceNumber} en ${store.name}.`
        };

        this.state.sales = [sale, ...this.state.sales];
        this.state.processed[idempotencyKey] = result;
        this.log(
            'SALE_REGISTERED',
            `Registró la factura ${sale.invoiceNumber} (${store.name}) · ${gems} gemas retenidas`,
            {
                saleId: sale.id,
                invoiceNumber: sale.invoiceNumber,
                storeCode: store.code,
                gems
            }
        );
        this.persist();

        return result;
    }

    async getShiftActivity(): Promise<ShiftActivity> {
        await delay(200);

        const sales = this.state.sales.filter(
            sale => sale.cashierUsername === this.currentUser
        );

        return {
            startedAt: this.shiftStartedAt,
            total: sales.length,
            retained: sales.filter(s => s.status === 'RETAINED').length,
            released: sales.filter(s => s.status === 'RELEASED').length,
            rejected: sales.filter(s => s.status === 'REJECTED').length,
            sales
        };
    }

    /**
     * La "tarea programada". En producción esto es un cron del servidor: acá lo
     * dispara el navegador (ver `validation-scheduler.ts`), que es lo mejor que
     * se puede hacer sin backend — si nadie abre el portal, nadie valida.
     */
    async runDueValidations(): Promise<{
        checked: number;
        released: number;
        rejected: number;
    }> {
        const due = this.state.sales.filter(
            sale => sale.status === 'RETAINED' && isDue(sale.validateAfter)
        );

        let released = 0;
        let rejected = 0;

        for (const sale of due) {
            const validation = await validateInvoice(sale.invoiceNumber, sale.storeCode);

            this.log(
                'VALIDATION_RUN',
                `Consultó la factura ${sale.invoiceNumber} (tienda ${sale.storeCode}): ${
                    validation.error
                        ? `error — ${validation.error}`
                        : validation.found
                          ? `existe — ${validation.product}`
                          : 'no encontrada'
                }`,
                {
                    actor: 'sistema',
                    saleId: sale.id,
                    invoiceNumber: sale.invoiceNumber,
                    storeCode: sale.storeCode
                }
            );

            this.updateSale(sale.id, current => ({ ...current, validation }));

            // Un error de red NO rechaza: se reintenta en la próxima corrida.
            if (validation.error) continue;

            if (validation.found) {
                released += 1;
                this.updateSale(sale.id, current => ({ ...current, status: 'RELEASED' }));
                this.log(
                    'GEMS_RELEASED',
                    `Liberó ${sale.gems} gemas de la factura ${sale.invoiceNumber}`,
                    {
                        actor: 'sistema',
                        saleId: sale.id,
                        invoiceNumber: sale.invoiceNumber,
                        storeCode: sale.storeCode,
                        gems: sale.gems
                    }
                );
            } else {
                rejected += 1;
                this.updateSale(sale.id, current => ({ ...current, status: 'REJECTED' }));
                this.log(
                    'SALE_REJECTED',
                    `Rechazó la factura ${sale.invoiceNumber}: no existe en la tienda ${sale.storeCode}. ${sale.gems} gemas no se acreditan`,
                    {
                        actor: 'sistema',
                        saleId: sale.id,
                        invoiceNumber: sale.invoiceNumber,
                        storeCode: sale.storeCode,
                        gems: sale.gems
                    }
                );
            }
        }

        if (due.length) this.persist();

        return { checked: due.length, released, rejected };
    }

    async getAdminDashboard(): Promise<AdminDashboard> {
        await delay(180);

        const sum = (status: SaleRecord['status']) =>
            this.state.sales
                .filter(sale => sale.status === status)
                .reduce((total, sale) => total + sale.gems, 0);

        const count = (status: SaleRecord['status']) =>
            this.state.sales.filter(sale => sale.status === status).length;

        return {
            retainedGems: sum('RETAINED'),
            releasedGems: sum('RELEASED'),
            rejectedGems: sum('REJECTED'),
            cancelledGems: sum('CANCELLED'),
            retainedCount: count('RETAINED'),
            releasedCount: count('RELEASED'),
            rejectedCount: count('REJECTED'),
            cancelledCount: count('CANCELLED'),
            dueCount: this.state.sales.filter(
                sale => sale.status === 'RETAINED' && isDue(sale.validateAfter)
            ).length,
            sales: this.state.sales
        };
    }

    async cancelSale(saleId: string, reason: string): Promise<void> {
        await delay(320);

        const sale = this.state.sales.find(entry => entry.id === saleId);
        if (!sale) throw new CashierApiError('La venta no existe', 404);
        if (sale.status !== 'RETAINED') {
            throw new CashierApiError(
                'Solo se pueden anular ventas con gemas retenidas',
                409
            );
        }

        this.updateSale(saleId, current => ({ ...current, status: 'CANCELLED' }));
        this.log(
            'SALE_CANCELLED',
            `Anuló la factura ${sale.invoiceNumber} (${sale.gems} gemas). Motivo: ${reason}`,
            {
                saleId,
                invoiceNumber: sale.invoiceNumber,
                storeCode: sale.storeCode,
                gems: sale.gems
            }
        );
        this.persist();
    }

    async getAuditLog(): Promise<AuditEntry[]> {
        await delay(140);
        return this.state.audit;
    }

    /** El registro es append-only salvo `status` y `validation`: la fecha nunca cambia. */
    private updateSale(
        saleId: string,
        change: (sale: SaleRecord) => SaleRecord
    ): void {
        this.state.sales = this.state.sales.map(sale =>
            sale.id === saleId
                ? { ...change(sale), registeredAt: sale.registeredAt, id: sale.id }
                : sale
        );
    }
}

function readState(): PersistedState {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...EMPTY };
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        return {
            sales: parsed.sales ?? [],
            audit: parsed.audit ?? [],
            processed: parsed.processed ?? {},
            attempts: parsed.attempts ?? {}
        };
    } catch {
        return { ...EMPTY };
    }
}

/** "5 min" / "42 s", para el mensaje de bloqueo. */
function describeWait(ms: number): string {
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 60) return `${seconds} s`;
    return `${Math.ceil(seconds / 60)} min`;
}

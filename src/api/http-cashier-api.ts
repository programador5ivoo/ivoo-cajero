import type { CashierApi } from './cashier-api.interface';
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

export class CashierApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly code?: string
    ) {
        super(message);
        this.name = 'CashierApiError';
    }
}

/**
 * Cliente HTTP contra la API de IVOO+.
 *
 * NINGUNA de estas rutas existe todavía: la documentación deja el panel de
 * cajero fuera de alcance (`Contexto Maestro` §2, `Plan-Cierre-API`) y
 * `HOW-TO-USE (BACKEND)` marca el rol `CAJERO` como no implementado. Son una
 * PROPUESTA de contrato.
 *
 * OJO con `runDueValidations`: acá se expone como endpoint porque en producción
 * la corrida la dispara un CRON DEL SERVIDOR, no el navegador. Este método
 * queda para poder forzarla a mano desde el panel; el cron no debe depender de
 * que alguien tenga el portal abierto.
 */
export class HttpCashierApi implements CashierApi {
    private accessToken: string | null = null;

    constructor(
        private readonly baseUrl: string,
        private readonly timeoutMs = 15000
    ) {}

    setAccessToken(token: string | null): void {
        this.accessToken = token;
    }

    private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await fetch(`${this.baseUrl}${path}`, {
                ...init,
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.accessToken
                        ? { Authorization: `Bearer ${this.accessToken}` }
                        : {}),
                    ...(init.headers ?? {})
                }
            });

            if (response.status === 204) return undefined as T;
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
                const body = payload as { message?: string; code?: string } | null;
                throw new CashierApiError(
                    body?.message ?? 'Error del servicio IVOO+',
                    response.status,
                    body?.code
                );
            }
            return payload as T;
        } finally {
            clearTimeout(timer);
        }
    }

    async login(input: { username: string; pin: string }): Promise<CashierSession> {
        const session = await this.request<CashierSession>('/v1/cashier/session', {
            method: 'POST',
            body: JSON.stringify(input)
        });
        this.setAccessToken(session.accessToken);
        return session;
    }

    getRules(): Promise<GemRules> {
        return this.request<GemRules>('/v1/cashier/rules');
    }

    lookupMember(documentId: string): Promise<MemberLookup> {
        const query = new URLSearchParams({ document: documentId });
        return this.request<MemberLookup>(`/v1/cashier/members/lookup?${query}`);
    }

    registerSale(
        draft: SaleDraft,
        store: Store,
        idempotencyKey: string
    ): Promise<SaleResult> {
        // La fecha de registro NO se envía: la sella el servidor. Mandarla desde
        // la caja la haría falsificable con el devtools abierto.
        return this.request<SaleResult>('/v1/cashier/sales', {
            method: 'POST',
            body: JSON.stringify({ ...draft, storeId: store.id, storeCode: store.code }),
            headers: { 'Idempotency-Key': idempotencyKey }
        });
    }

    getShiftActivity(): Promise<ShiftActivity> {
        return this.request<ShiftActivity>('/v1/cashier/shifts/current');
    }

    runDueValidations(): Promise<{
        checked: number;
        released: number;
        rejected: number;
    }> {
        return this.request('/v1/cashier/validations/run', { method: 'POST' });
    }

    getAdminDashboard(): Promise<AdminDashboard> {
        return this.request<AdminDashboard>('/v1/cashier/admin/dashboard');
    }

    async cancelSale(saleId: string, reason: string): Promise<void> {
        await this.request<void>(
            `/v1/cashier/sales/${encodeURIComponent(saleId)}/cancel`,
            { method: 'POST', body: JSON.stringify({ reason }) }
        );
    }

    getAuditLog(): Promise<AuditEntry[]> {
        return this.request<AuditEntry[]>('/v1/cashier/admin/audit');
    }
}

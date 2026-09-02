import type { CashierApi } from './cashier-api.interface';
import { HttpCashierApi } from './http-cashier-api';
import { MockCashierApi } from './mock-cashier-api';

/**
 * Único punto donde se decide qué implementación del contrato se usa.
 *
 * Con `VITE_IVOO_API_URL` definida se habla con la API real; sin ella, el portal
 * corre contra la implementación local.
 *
 * OJO: esto NO afecta a las tiendas ni a la validación de facturas. Esas dos
 * salen de APIs externas reales (`stores-api.ts`, `invoice-validation.ts`) y
 * funcionan igual en los dos modos — lo único simulado es el ledger de IVOO+.
 */
const baseUrl = import.meta.env.VITE_IVOO_API_URL as string | undefined;

export const isMockMode = !baseUrl;

export const cashierApi: CashierApi = baseUrl
    ? new HttpCashierApi(baseUrl)
    : new MockCashierApi();

/**
 * Propaga el token de la sesión de caja al cliente HTTP.
 *
 * El token vive SOLO en memoria: una caja es un equipo compartido, y
 * persistirlo dejaría la sesión abierta para el siguiente turno.
 */
export function applyAccessToken(token: string | null): void {
    if (cashierApi instanceof HttpCashierApi) cashierApi.setAccessToken(token);
}

export type { CashierApi } from './cashier-api.interface';
export { CashierApiError } from './http-cashier-api';
export { fetchStores, storeCode } from './stores-api';
export { validateInvoice } from './invoice-validation';
export * from './types';

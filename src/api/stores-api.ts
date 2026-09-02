import type { Store } from './types';

/**
 * Tiendas reales, desde `GET /api/admin/stores`.
 *
 * Responde `{ success: true, data: [...] }`. El `cod_t` que exige
 * `validate-invoice` NO viene en la respuesta: es el `id` con relleno a dos
 * dígitos (id 2 → `02`, verificado contra la factura 001018442 de NAGUANAGUA).
 * Por eso se deriva acá y no se teclea en ningún lado.
 */
const STORES_URL = 'https://delivery.ivoofix.com/api/admin/stores';

interface RawStore {
    id: number;
    name: string;
    magento_id: string;
    address: string;
    city: string;
    state: string;
}

interface StoresResponse {
    success: boolean;
    data: RawStore[];
}

/** `cod_t` de la tienda: el id con al menos dos dígitos. */
export function storeCode(id: number): string {
    return String(id).padStart(2, '0');
}

function toStore(raw: RawStore): Store {
    return {
        id: raw.id,
        name: raw.name,
        city: raw.city,
        state: raw.state,
        magentoId: raw.magento_id,
        code: storeCode(raw.id)
    };
}

export async function fetchStores(timeoutMs = 15000): Promise<Store[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(STORES_URL, { signal: controller.signal });

        if (!response.ok) {
            throw new Error(`El servicio de tiendas respondió ${response.status}`);
        }

        const payload = (await response.json()) as StoresResponse;

        if (!payload?.success || !Array.isArray(payload.data)) {
            throw new Error('El servicio de tiendas devolvió una respuesta inesperada');
        }

        return payload.data
            .map(toStore)
            .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    } finally {
        clearTimeout(timer);
    }
}

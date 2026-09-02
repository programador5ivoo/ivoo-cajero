import type { InvoiceValidation } from './types';

/**
 * Validación real de una factura contra el sistema de la tienda.
 *
 *   GET /api/public/validate-invoice?doc=<factura>&cod_t=<tienda>
 *
 * Contrato observado:
 *   200 → `{ name, qty }`             la factura existe y tiene productos
 *   404 → `{ error: "Factura no encontrada" }`
 *
 * Con varios productos el API igual devuelve UN objeto, con los nombres
 * concatenados y `qty: "Varios"` (ej. factura 001019000). No hay arreglo que
 * recorrer, así que "tiene productos" es simplemente HTTP 200 con `name`.
 *
 * OJO: la factura está atada a la tienda. La misma `doc` con otro `cod_t`
 * responde 404 — por eso la venta guarda el `storeCode` con el que se registró
 * y la validación usa ese, no la tienda del turno que esté abierto después.
 */
const VALIDATE_URL = 'https://delivery.ivoofix.com/api/public/validate-invoice';

interface FoundResponse {
    name?: string;
    qty?: string;
}

/**
 * Nunca lanza. Distingue tres desenlaces, porque no son lo mismo:
 *   - `found: true`             la factura existe
 *   - `found: false` sin error  el sistema dijo que no existe
 *   - `found: false` con error  no se pudo consultar (red, 500, timeout)
 *
 * El tercero NO debe rechazar la venta: se reintenta en la siguiente corrida.
 */
export async function validateInvoice(
    invoiceNumber: string,
    code: string,
    timeoutMs = 15000
): Promise<InvoiceValidation> {
    const attemptedAt = new Date().toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const query = new URLSearchParams({ doc: invoiceNumber, cod_t: code });

    try {
        const response = await fetch(`${VALIDATE_URL}?${query}`, {
            signal: controller.signal
        });

        if (response.status === 404) {
            return { attemptedAt, found: false };
        }

        if (!response.ok) {
            return {
                attemptedAt,
                found: false,
                error: `El validador respondió ${response.status}`
            };
        }

        const payload = (await response.json()) as FoundResponse | null;

        if (!payload?.name) {
            // 200 sin productos: se trata como "no se pudo determinar", no como
            // factura inexistente. Rechazar por una respuesta rara sería perder
            // gemas de un cliente que sí compró.
            return {
                attemptedAt,
                found: false,
                error: 'El validador respondió 200 sin productos'
            };
        }

        return {
            attemptedAt,
            found: true,
            product: payload.name,
            quantity: payload.qty
        };
    } catch (error) {
        const message =
            error instanceof Error && error.name === 'AbortError'
                ? 'El validador no respondió a tiempo'
                : error instanceof Error
                  ? error.message
                  : 'Error consultando el validador';

        return { attemptedAt, found: false, error: message };
    } finally {
        clearTimeout(timer);
    }
}

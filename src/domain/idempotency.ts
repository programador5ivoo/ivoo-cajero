/**
 * Clave de idempotencia de una intención de venta.
 *
 * Se genera UNA vez, cuando el cajero pasa a la pantalla de confirmación, y se
 * reutiliza en todos los reintentos de esa misma venta. Es lo contrario de lo
 * que hace hoy el módulo de la IVOOAPP (`${itemId}-${Date.now()}`), que genera
 * una clave distinta por intento y por eso no protege de nada
 * (ver ANALISIS_DISONANCIAS §E-04).
 */
export function createIdempotencyKey(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    // Fallback para navegadores viejos de caja sin `crypto.randomUUID`.
    return `sale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

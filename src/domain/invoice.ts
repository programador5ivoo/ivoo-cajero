/**
 * El número de factura son SOLO DÍGITOS.
 *
 * El prototipo mostraba `F-004512`, pero el campo se teclea en caja con el
 * cliente esperando: un prefijo que siempre es el mismo solo agrega pulsaciones
 * y variantes (`F-4512`, `f004512`, `F 004512`) que romperían la detección de
 * duplicados. Se normaliza igual que la cédula en Magento (`replace(/\D/g,'')`).
 *
 * PENDIENTE: el tope de 12 dígitos es una guarda, no una regla de negocio. Hay
 * que confirmar el largo real del correlativo de facturación con la operación.
 */
const MAX_INVOICE_DIGITS = 12;

/** Deja solo dígitos y recorta al tope. Es lo que se envía al servidor. */
export function normalizeInvoice(raw: string): string {
    return (raw ?? '').replace(/\D/g, '').slice(0, MAX_INVOICE_DIGITS);
}

export function isValidInvoice(raw: string): boolean {
    const digits = normalizeInvoice(raw);
    return digits.length > 0 && digits.length <= MAX_INVOICE_DIGITS;
}

export { MAX_INVOICE_DIGITS };

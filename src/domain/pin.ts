/**
 * El PIN de caja son SOLO DÍGITOS.
 *
 * Se filtra al teclear, igual que la factura (`invoice.ts`) y el documento
 * (`document.ts`): en caja, con el cliente esperando, es mejor que la letra no
 * entre a que el cajero descubra el problema recién al enviar.
 *
 * PENDIENTE: el mínimo de 4 es el que valida hoy el mock (y el que documenta el
 * README). El máximo de 6 es una guarda, no una regla confirmada — el directorio
 * de cajeros todavía no existe del lado del backend (`HOW-TO-USE (BACKEND)`
 * marca el rol `CAJERO` como no implementado), así que el largo real del PIN
 * está sin definir. Confirmar antes de producción: si el backend emite PINs más
 * largos, este tope los corta y el login falla siempre.
 */
const MIN_PIN_DIGITS = 4;
const MAX_PIN_DIGITS = 6;

/** Deja solo dígitos y recorta al tope. Es lo que se envía al servidor. */
export function normalizePin(raw: string): string {
    return (raw ?? '').replace(/\D/g, '').slice(0, MAX_PIN_DIGITS);
}

export function isValidPin(raw: string): boolean {
    const digits = normalizePin(raw);
    return digits.length >= MIN_PIN_DIGITS && digits.length <= MAX_PIN_DIGITS;
}

export { MIN_PIN_DIGITS, MAX_PIN_DIGITS };

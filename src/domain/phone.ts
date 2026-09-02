/**
 * Teléfono del cliente: solo dígitos, como el resto de los campos numéricos.
 *
 * Se acepta con o sin el 0 inicial (`0412…` y `412…`) porque en caja se teclea
 * de las dos formas. No se fuerza un formato de operadora: el padrón de
 * miembros vive en IVOO+ y todavía no define uno.
 */
const MIN_PHONE_DIGITS = 10;
const MAX_PHONE_DIGITS = 12;

export function normalizePhone(raw: string): string {
    return (raw ?? '').replace(/\D/g, '').slice(0, MAX_PHONE_DIGITS);
}

export function isValidPhone(raw: string): boolean {
    const digits = normalizePhone(raw);
    return digits.length >= MIN_PHONE_DIGITS && digits.length <= MAX_PHONE_DIGITS;
}

/** Formato de lectura: `0412-345.67.89`. Solo para mostrar. */
export function formatPhone(raw: string): string {
    const d = normalizePhone(raw);
    if (d.length < MIN_PHONE_DIGITS) return d;
    return `${d.slice(0, 4)}-${d.slice(4, 7)}.${d.slice(7, 9)}.${d.slice(9)}`;
}

export { MIN_PHONE_DIGITS, MAX_PHONE_DIGITS };

/**
 * El documento del cliente son SOLO DÍGITOS, sin prefijo.
 *
 * Es la forma en que Magento toma la cédula (`casheaPayment.js`: `type="tel"`,
 * `inputMode="numeric"`, `replace(/\D/g,'')`, 6–11 dígitos). El padrón de
 * miembros vive en Magento, así que el cajero tiene que buscar con la misma
 * clave: si aquí se enviara `V-12345678` y allá está guardado `12345678`, la
 * resolución del miembro fallaría siempre.
 *
 * OJO: sin prefijo no se distingue cédula de RIF ni de extranjero. Magento hoy
 * tampoco lo distingue en ese flujo. Si el negocio necesita RIF (J/G) hay que
 * decidirlo primero en Magento y replicarlo aquí, no al revés.
 */
const MIN_DIGITS = 6;
const MAX_DIGITS = 11;

/** Lleva un documento tecleado o escaneado a la forma canónica: solo dígitos. */
export function normalizeDocument(raw: string): string {
    return (raw ?? '').replace(/\D/g, '').slice(0, MAX_DIGITS);
}

export function isValidDocument(raw: string): boolean {
    const digits = normalizeDocument(raw);
    return digits.length >= MIN_DIGITS && digits.length <= MAX_DIGITS;
}

/** Formato de lectura: `12.345.678`. Solo para mostrar, nunca para enviar. */
export function formatDocument(raw: string): string {
    const digits = normalizeDocument(raw);
    if (!digits) return '';
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Extrae el documento del contenido de un QR.
 *
 * Se aceptan varias formas porque el formato del QR de la IVOOAPP todavía no
 * está congelado (ver ANALISIS_DISONANCIAS §B-04):
 *   - texto plano:            `12.345.678` o `V-12.345.678`
 *   - con prefijo de app:     `IVOO+:V-12345678`
 *   - JSON:                   `{"documentId":"12345678"}`
 *   - URL con query:          `https://ivoo.com/m?document=12345678`
 *
 * Un prefijo `V-`/`E-`/`J-` que venga en el QR se descarta al normalizar, igual
 * que si el cajero lo tecleara.
 *
 * Devuelve `null` si el contenido no contiene un documento reconocible — el
 * escáner sigue leyendo en vez de aceptar basura.
 */
export function parseScannedDocument(payload: string): string | null {
    const raw = (payload ?? '').trim();
    if (!raw) return null;

    const candidate =
        fromJson(raw) ?? fromUrl(raw) ?? raw.replace(/^IVOO\+?[:\s]/i, '').trim();

    return isValidDocument(candidate) ? normalizeDocument(candidate) : null;
}

const DOCUMENT_KEYS = ['documentid', 'document', 'cedula', 'ci', 'rif', 'doc'];

function fromJson(raw: string): string | null {
    if (!raw.startsWith('{')) return null;
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        for (const [key, value] of Object.entries(parsed)) {
            if (DOCUMENT_KEYS.includes(key.toLowerCase()) && typeof value === 'string') {
                return value;
            }
        }
    } catch {
        return null;
    }
    return null;
}

function fromUrl(raw: string): string | null {
    if (!/^https?:\/\//i.test(raw)) return null;
    try {
        const url = new URL(raw);
        for (const [key, value] of url.searchParams.entries()) {
            if (DOCUMENT_KEYS.includes(key.toLowerCase())) return value;
        }
    } catch {
        return null;
    }
    return null;
}

export { MIN_DIGITS, MAX_DIGITS };

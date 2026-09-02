import type { CashierRole, GemRules, MemberLookup } from './types';

/**
 * Gemas por método de pago.
 *
 * PENDIENTE: estos valores son los bonus de la especificación §4.3, reusados
 * ahora como el APORTE TOTAL de cada método, porque al quitar el monto elegible
 * no queda nada que multiplicar. El usuario pidió tomarlos "mediante la api",
 * pero en `delivery.ivoofix.com` no existe un endpoint de métodos de pago
 * (probados `/api/{admin,public}/payment-methods`, `/payments`, `/gems`: todos
 * 404). En cuanto exista, se cambia el factory de `index.ts` y esto se borra.
 */
export const mockRules: GemRules = {
    gemValue: 0.01,
    currency: 'USD',
    retentionHours: 4,
    paymentMethods: [
        { code: 'EFECTIVO', label: 'Efectivo', gems: 10 },
        { code: 'TDD', label: 'TDD', gems: 5 },
        { code: 'PAGO_MOVIL', label: 'Pago móvil', gems: 5 },
        { code: 'ZELLE', label: 'Zelle', gems: 10 },
        { code: 'BINANCE', label: 'Binance', gems: 10 },
        { code: 'TRANSFERENCIA', label: 'Transferencia', gems: 5 },
        { code: 'TDC_INTERNACIONAL', label: 'TDC internacional', gems: 10 }
    ]
};

interface MockUser {
    pin: string;
    displayName: string;
    role: CashierRole;
    /** Tienda asignada. Obligatoria para un cajero; el admin no tiene. */
    storeId?: number;
    /** Caja asignada dentro de la tienda. */
    registerCode?: string;
}

/**
 * Directorio de usuarios.
 *
 * Cada cajero está ATADO a una tienda y a una caja. Ya no se elige tienda al
 * entrar: el usuario es la tienda. Un usuario que no esté aquí no entra —
 * antes cualquiera con un PIN de 4 dígitos pasaba, y eso significaba que
 * cualquiera podía registrar ventas en cualquier tienda.
 *
 * `storeId` es el `id` del API real de tiendas (`GET /api/admin/stores`), de
 * donde se resuelve el `cod_t` que valida las facturas. Los ids de acá son
 * reales: 2 = NAGUANAGUA, 3 = PLAZA VENEZUELA, 6 = BARQUISIMETO.
 *
 * PENDIENTE: esto reemplaza a un directorio que el backend todavía no tiene
 * (`HOW-TO-USE (BACKEND)` marca el rol `CAJERO` como no implementado).
 */
export const mockUsers: Record<string, MockUser> = {
    admin: {
        pin: '9999',
        displayName: 'Administración IVOO+',
        role: 'ADMIN'
    },
    jmarin: {
        pin: '1234',
        displayName: 'José Marín',
        role: 'CASHIER',
        storeId: 2,
        registerCode: 'CAJA-01'
    },
    wdiaz: {
        pin: '1234',
        displayName: 'Wilianny Díaz',
        role: 'CASHIER',
        storeId: 2,
        registerCode: 'CAJA-02'
    },
    cbermudez: {
        pin: '5678',
        displayName: 'Carlos Bermúdez',
        role: 'CASHIER',
        storeId: 3,
        registerCode: 'CAJA-01'
    },
    arivas: {
        pin: '5678',
        displayName: 'Ana Rivas',
        role: 'CASHIER',
        storeId: 6,
        registerCode: 'CAJA-03'
    }
};

/**
 * Bloqueo por intentos fallidos.
 *
 * A los 3 fallos el usuario queda bloqueado 5 minutos y se registra en el
 * historial. El contador es POR USUARIO, no por navegador: cambiar de pestaña
 * no lo reinicia, y persiste a un refresh — si viviera en memoria, recargar la
 * página sería la forma trivial de saltárselo.
 *
 * PENDIENTE: 3 intentos y 5 minutos son valores razonables, no una política
 * confirmada con seguridad.
 */
export const MAX_LOGIN_ATTEMPTS = 3;
export const LOCKOUT_MINUTES = 5;

/** Padrón de miembros de prueba, indexado por documento normalizado. */
export const mockMembers: Record<string, MemberLookup> = {
    '12345678': {
        documentId: '12345678',
        found: true,
        fullName: 'Wilianny Díaz',
        memberCode: 'IVOO-8842190',
        active: true
    },
    '9876543': {
        documentId: '9876543',
        found: true,
        fullName: 'Carlos Bermúdez',
        memberCode: 'IVOO-7710455',
        active: true
    },
    '15443220': {
        documentId: '15443220',
        found: true,
        fullName: 'Ana Rivas',
        memberCode: 'IVOO-6620031',
        active: true
    },
    '11220998': {
        documentId: '11220998',
        found: true,
        fullName: 'José Marín',
        memberCode: 'IVOO-5510877',
        active: true
    }
};

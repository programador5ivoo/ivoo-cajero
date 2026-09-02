export function formatGems(gems: number): string {
    return new Intl.NumberFormat('es-VE').format(gems);
}

export function formatMoney(amount: number, currency = 'USD'): string {
    return new Intl.NumberFormat('es-VE', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2
    }).format(amount);
}

/** Hora corta `12:47`, que es lo que muestra la actividad del turno. */
export function formatTime(iso: string): string {
    return new Intl.DateTimeFormat('es-VE', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(new Date(iso));
}

/** "hace 4 min" para el indicador de última venta. */
export function formatRelative(iso: string): string {
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
    if (minutes < 1) return 'hace instantes';
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `hace ${hours} h`;
}

/** Fecha y hora completas `02/09/2026 11:47`, para el sello de registro. */
export function formatDateTime(iso: string): string {
    return new Intl.DateTimeFormat('es-VE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(new Date(iso));
}

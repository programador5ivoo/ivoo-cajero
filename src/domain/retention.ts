/**
 * Ventana de retención de gemas.
 *
 * Al registrar una venta las gemas quedan RETENIDAS. Pasadas N horas la tarea
 * programada consulta `validate-invoice` y recién ahí se liberan o se rechazan.
 * El plazo de negocio son 4 horas.
 *
 * `VITE_RETENTION_HOURS` permite acortarlo para QA — esperar 4 horas reales
 * hace imposible probar el flujo. Acepta decimales (`0.02` ≈ 1 min). En
 * producción se deja sin definir y manda el default.
 */
export const DEFAULT_RETENTION_HOURS = 4;

export function retentionHours(): number {
    const raw = import.meta.env.VITE_RETENTION_HOURS as string | undefined;
    const parsed = Number.parseFloat(raw ?? '');

    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_HOURS;
}

/** Momento a partir del cual la venta se puede validar. */
export function validateAfterFrom(registeredAt: string, hours = retentionHours()): string {
    return new Date(new Date(registeredAt).getTime() + hours * 3_600_000).toISOString();
}

export function isDue(validateAfter: string, now = Date.now()): boolean {
    return now >= new Date(validateAfter).getTime();
}

/** "en 3 h 42 min" / "vencida hace 12 min", para la UI. */
export function describeRemaining(validateAfter: string, now = Date.now()): string {
    const diff = new Date(validateAfter).getTime() - now;
    const overdue = diff < 0;
    const minutes = Math.floor(Math.abs(diff) / 60_000);
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;

    const amount =
        hours > 0 ? `${hours} h${rest ? ` ${rest} min` : ''}` : `${Math.max(minutes, 1)} min`;

    return overdue ? `vencida hace ${amount}` : `en ${amount}`;
}

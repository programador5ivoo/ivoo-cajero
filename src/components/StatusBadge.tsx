import type { SaleStatus } from '../api';

const LABELS: Record<SaleStatus, string> = {
    RETAINED: 'Retenida',
    RELEASED: 'Liberada',
    REJECTED: 'Rechazada',
    CANCELLED: 'Anulada'
};

const TONES: Record<SaleStatus, string> = {
    RETAINED: 'badge-warn',
    RELEASED: 'badge-ok',
    REJECTED: 'badge-error',
    CANCELLED: 'badge-muted'
};

/** Estado de la venta en el ciclo retención → liberación. */
export function StatusBadge({ status }: { status: SaleStatus }) {
    return <span className={`badge ${TONES[status]}`}>{LABELS[status]}</span>;
}

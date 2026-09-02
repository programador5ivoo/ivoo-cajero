import type { ReactNode } from 'react';

/** Fila etiqueta/valor del resumen de confirmación. Componente de presentación puro. */
export function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="summary-row">
            <span className="summary-label">{label}</span>
            <span className="summary-value">{children}</span>
        </div>
    );
}

import type { ReactNode } from 'react';
import type { Cashier, Store } from '../api';

interface Props {
    store?: Store;
    cashier?: Cashier;
    /** Acción secundaria del topbar (ver turno / volver / cerrar). */
    action?: { label: string; onClick: () => void };
    onLogout?: () => void;
    wide?: boolean;
    children: ReactNode;
}

/** Marco común: barra superior IVOO+ y contenedor de la página. */
export function Shell({ store, cashier, action, onLogout, wide, children }: Props) {
    return (
        <div className="shell">
            <header className="topbar">
                <span className="brand">
                    IVOO<span>+</span> cajero
                </span>
                <div className="topbar-meta">
                    {store ? <span className="chip chip-green">{store.name}</span> : null}
                    {cashier?.registerCode ? (
                        <span className="chip">{cashier.registerCode}</span>
                    ) : null}
                    {cashier ? <span className="chip">{cashier.displayName}</span> : null}
                    {action ? (
                        <button type="button" className="linkbtn" onClick={action.onClick}>
                            {action.label}
                        </button>
                    ) : null}
                    {onLogout ? (
                        <button type="button" className="linkbtn" onClick={onLogout}>
                            Cerrar turno
                        </button>
                    ) : null}
                </div>
            </header>

            <main className={wide ? 'page page-wide' : 'page'}>{children}</main>
        </div>
    );
}

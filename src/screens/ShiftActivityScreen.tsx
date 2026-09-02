import type { ShiftActivity } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { formatDocument } from '../domain/document';
import { formatDateTime, formatTime } from '../domain/format';
import { describeRemaining } from '../domain/retention';

interface Props {
    activity: ShiftActivity | null;
    loading: boolean;
    error: string | null;
    onReload: () => void;
    onBack: () => void;
}

/** Actividad del turno del cajero: qué registró y en qué estado está cada venta. */
export function ShiftActivityScreen({ activity, loading, error, onReload, onBack }: Props) {
    return (
        <>
            <h1 className="title">Actividad del turno</h1>
            {activity ? (
                <p className="subtitle">
                    Turno iniciado a las {formatTime(activity.startedAt)}.
                </p>
            ) : null}

            {error ? <p className="notice notice-error">{error}</p> : null}
            {loading && !activity ? <p className="loading">Cargando…</p> : null}

            {activity ? (
                <>
                    <div className="stats">
                        <div className="stat">
                            <span className="stat-label">Registros</span>
                            <span className="stat-value">{activity.total}</span>
                        </div>
                        <div className="stat">
                            <span className="stat-label">Retenidas</span>
                            <span className="stat-value">{activity.retained}</span>
                        </div>
                        <div className="stat">
                            <span className="stat-label">Liberadas</span>
                            <span className="stat-value">{activity.released}</span>
                        </div>
                        <div className="stat">
                            <span className="stat-label">Rechazadas</span>
                            <span className="stat-value">{activity.rejected}</span>
                        </div>
                    </div>

                    {activity.sales.length === 0 ? (
                        <div className="card">
                            <p className="hint">Todavía no registraste ventas en este turno.</p>
                        </div>
                    ) : (
                        <div className="table-wrap">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Registrada</th>
                                        <th>Factura</th>
                                        <th>Cliente</th>
                                        <th>Documento</th>
                                        <th>Tienda</th>
                                        <th className="num">Gemas</th>
                                        <th>Estado</th>
                                        <th>Validación</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activity.sales.map(sale => (
                                        <tr key={sale.id}>
                                            <td>{formatDateTime(sale.registeredAt)}</td>
                                            <td>{sale.invoiceNumber}</td>
                                            <td>{sale.customerName}</td>
                                            <td>{formatDocument(sale.documentId)}</td>
                                            <td>{sale.storeCode}</td>
                                            <td className="num">{sale.gems}</td>
                                            <td>
                                                <StatusBadge status={sale.status} />
                                            </td>
                                            <td className="muted">
                                                {sale.status === 'RETAINED'
                                                    ? describeRemaining(sale.validateAfter)
                                                    : sale.validation?.product ??
                                                      sale.validation?.error ??
                                                      '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            ) : null}

            <div className="actions">
                <button type="button" className="btn btn-ghost" onClick={onReload}>
                    Actualizar estados
                </button>
                <button type="button" className="btn btn-primary" onClick={onBack}>
                    Registrar una venta
                </button>
            </div>
        </>
    );
}

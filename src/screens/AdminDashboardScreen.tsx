import { useState } from 'react';
import type { AdminDashboard, AuditEntry, SaleRecord } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { formatDocument } from '../domain/document';
import { formatPhone } from '../domain/phone';
import { formatDateTime } from '../domain/format';
import { describeRemaining } from '../domain/retention';

interface Props {
    dashboard: AdminDashboard | null;
    audit: AuditEntry[];
    loading: boolean;
    error: string | null;
    running: boolean;
    onReload: () => void;
    onRunValidations: () => void;
    onCancel: (saleId: string, reason: string) => void;
}

type Tab = 'sales' | 'audit';
type Filter = 'ALL' | SaleRecord['status'];

/**
 * Panel de administración (súper usuario).
 *
 * Muestra la retención de gemas, lo liberado, y permite anular una venta
 * retenida. Todo queda en el historial: nada se borra, ni siquiera al anular.
 */
export function AdminDashboardScreen({
    dashboard,
    audit,
    loading,
    error,
    running,
    onReload,
    onRunValidations,
    onCancel
}: Props) {
    const [tab, setTab] = useState<Tab>('sales');
    const [filter, setFilter] = useState<Filter>('ALL');
    const [cancelling, setCancelling] = useState<SaleRecord | null>(null);
    const [reason, setReason] = useState('');

    if (loading && !dashboard) return <p className="loading">Cargando panel…</p>;
    if (!dashboard) {
        return (
            <>
                {error ? <p className="notice notice-error">{error}</p> : null}
                <div className="actions">
                    <button type="button" className="btn btn-primary" onClick={onReload}>
                        Reintentar
                    </button>
                </div>
            </>
        );
    }

    const sales =
        filter === 'ALL'
            ? dashboard.sales
            : dashboard.sales.filter(sale => sale.status === filter);

    const confirmCancel = () => {
        if (!cancelling || reason.trim().length < 4) return;
        onCancel(cancelling.id, reason.trim());
        setCancelling(null);
        setReason('');
    };

    return (
        <>
            <h1 className="title">Panel de administración</h1>
            <p className="subtitle">
                Retención de gemas, liberaciones e historial de acciones.
            </p>

            {error ? <p className="notice notice-error">{error}</p> : null}

            <div className="stats stats-4">
                <div className="stat stat-warn">
                    <span className="stat-label">Gemas retenidas</span>
                    <span className="stat-value">{dashboard.retainedGems}</span>
                    <span className="stat-foot">{dashboard.retainedCount} ventas</span>
                </div>
                <div className="stat stat-ok">
                    <span className="stat-label">Gemas liberadas</span>
                    <span className="stat-value">{dashboard.releasedGems}</span>
                    <span className="stat-foot">{dashboard.releasedCount} ventas</span>
                </div>
                <div className="stat stat-error">
                    <span className="stat-label">Gemas rechazadas</span>
                    <span className="stat-value">{dashboard.rejectedGems}</span>
                    <span className="stat-foot">{dashboard.rejectedCount} ventas</span>
                </div>
                <div className="stat">
                    <span className="stat-label">Gemas anuladas</span>
                    <span className="stat-value">{dashboard.cancelledGems}</span>
                    <span className="stat-foot">{dashboard.cancelledCount} ventas</span>
                </div>
            </div>

            <div className="toolbar">
                <div className="tabs">
                    <button
                        type="button"
                        className={tab === 'sales' ? 'tab tab-active' : 'tab'}
                        onClick={() => setTab('sales')}
                    >
                        Ventas ({dashboard.sales.length})
                    </button>
                    <button
                        type="button"
                        className={tab === 'audit' ? 'tab tab-active' : 'tab'}
                        onClick={() => setTab('audit')}
                    >
                        Historial ({audit.length})
                    </button>
                </div>

                <div className="toolbar-actions">
                    {dashboard.dueCount > 0 ? (
                        <span className="chip chip-warn">
                            {dashboard.dueCount} por validar
                        </span>
                    ) : null}
                    <button
                        type="button"
                        className="btn-inline"
                        disabled={running}
                        onClick={onRunValidations}
                    >
                        {running ? 'Validando…' : 'Validar ahora'}
                    </button>
                    <button type="button" className="btn-inline" onClick={onReload}>
                        Actualizar
                    </button>
                </div>
            </div>

            {tab === 'sales' ? (
                <>
                    <div className="filters">
                        {(['ALL', 'RETAINED', 'RELEASED', 'REJECTED', 'CANCELLED'] as Filter[]).map(
                            option => (
                                <button
                                    key={option}
                                    type="button"
                                    className={filter === option ? 'chip chip-green' : 'chip'}
                                    onClick={() => setFilter(option)}
                                >
                                    {FILTER_LABELS[option]}
                                </button>
                            )
                        )}
                    </div>

                    {sales.length === 0 ? (
                        <div className="card">
                            <p className="hint">No hay ventas en este estado.</p>
                        </div>
                    ) : (
                        <div className="table-wrap">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Registrada</th>
                                        <th>Factura</th>
                                        <th>Tienda</th>
                                        <th>Cliente</th>
                                        <th>Teléfono</th>
                                        <th>Cajero</th>
                                        <th className="num">Gemas</th>
                                        <th>Estado</th>
                                        <th>Validación</th>
                                        <th />
                                    </tr>
                                </thead>
                                <tbody>
                                    {sales.map(sale => (
                                        <tr key={sale.id}>
                                            <td className="nowrap">
                                                {formatDateTime(sale.registeredAt)}
                                            </td>
                                            <td>{sale.invoiceNumber}</td>
                                            <td>
                                                {sale.storeName}
                                                <span className="muted"> · {sale.storeCode}</span>
                                            </td>
                                            <td>
                                                {sale.customerName}
                                                <span className="muted">
                                                    {' '}
                                                    · {formatDocument(sale.documentId)}
                                                </span>
                                            </td>
                                            <td className="nowrap">
                                                {formatPhone(sale.customerPhone)}
                                            </td>
                                            <td>{sale.cashierUsername}</td>
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
                                            <td>
                                                {sale.status === 'RETAINED' ? (
                                                    <button
                                                        type="button"
                                                        className="btn-inline btn-inline-danger"
                                                        onClick={() => {
                                                            setCancelling(sale);
                                                            setReason('');
                                                        }}
                                                    >
                                                        Anular
                                                    </button>
                                                ) : null}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            ) : (
                <AuditTable audit={audit} />
            )}

            {cancelling ? (
                <div className="scanner" role="dialog" aria-modal="true">
                    <div className="card modal">
                        <h2 className="title" style={{ fontSize: 22 }}>
                            Anular la factura {cancelling.invoiceNumber}
                        </h2>
                        <p className="hint">
                            Se liberan {cancelling.gems} gemas de la retención y la venta queda
                            como anulada. La venta no se borra: queda en el historial.
                        </p>
                        <div className="field">
                            <label className="label" htmlFor="cancel-reason">
                                Motivo
                            </label>
                            <input
                                id="cancel-reason"
                                className="input"
                                placeholder="Factura anulada en tienda"
                                value={reason}
                                onChange={event => setReason(event.target.value)}
                            />
                        </div>
                        <div className="actions">
                            <button
                                type="button"
                                className="btn btn-primary"
                                disabled={reason.trim().length < 4}
                                onClick={confirmCancel}
                            >
                                Anular la venta
                            </button>
                            <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => setCancelling(null)}
                            >
                                Volver
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}

const FILTER_LABELS: Record<Filter, string> = {
    ALL: 'Todas',
    RETAINED: 'Retenidas',
    RELEASED: 'Liberadas',
    REJECTED: 'Rechazadas',
    CANCELLED: 'Anuladas'
};

const ACTION_LABELS: Record<AuditEntry['action'], string> = {
    LOGIN: 'Inicio de sesión',
    LOGOUT: 'Cierre de sesión',
    LOGIN_BLOCKED: 'Login bloqueado',
    SALE_REGISTERED: 'Venta registrada',
    VALIDATION_RUN: 'Validación',
    GEMS_RELEASED: 'Gemas liberadas',
    SALE_REJECTED: 'Venta rechazada',
    SALE_CANCELLED: 'Venta anulada'
};

function AuditTable({ audit }: { audit: AuditEntry[] }) {
    if (audit.length === 0) {
        return (
            <div className="card">
                <p className="hint">El historial está vacío.</p>
            </div>
        );
    }

    return (
        <div className="table-wrap">
            <table className="table">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Acción</th>
                        <th>Actor</th>
                        <th>Detalle</th>
                        <th className="num">Gemas</th>
                    </tr>
                </thead>
                <tbody>
                    {audit.map(entry => (
                        <tr key={entry.id}>
                            <td className="nowrap">{formatDateTime(entry.at)}</td>
                            <td className="nowrap">{ACTION_LABELS[entry.action]}</td>
                            <td>{entry.actor}</td>
                            <td>{entry.detail}</td>
                            <td className="num">{entry.gems ?? '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

import type { GemRules, SaleDraft, Store } from '../api';
import { SummaryRow } from '../components/SummaryRow';
import { formatDocument } from '../domain/document';
import { formatPhone } from '../domain/phone';
import { findMethod, gemsForMethod } from '../domain/gems';

interface Props {
    draft: SaleDraft;
    store: Store;
    rules: GemRules;
    submitting: boolean;
    error: string | null;
    onSubmit: () => void;
    onBack: () => void;
}

/**
 * Confirmación antes de enviar.
 *
 * Deja claro que las gemas quedan RETENIDAS, no acreditadas: es la diferencia
 * que el cajero tiene que poder explicarle al cliente en el mostrador.
 */
export function ConfirmSaleScreen({
    draft,
    store,
    rules,
    submitting,
    error,
    onSubmit,
    onBack
}: Props) {
    const method = findMethod(draft.paymentMethod, rules);
    const total = gemsForMethod(draft.paymentMethod, rules);

    return (
        <>
            <h1 className="title">Confirmar antes de enviar</h1>
            <p className="subtitle">Revisa que la factura coincida con lo emitido.</p>

            <div className="card">
                <SummaryRow label="Tienda">{`${store.name} · ${store.code}`}</SummaryRow>
                <SummaryRow label="Factura">{draft.invoiceNumber}</SummaryRow>
                <SummaryRow label="Cliente">{draft.customerName}</SummaryRow>
                <SummaryRow label="Documento">{formatDocument(draft.documentId)}</SummaryRow>
                <SummaryRow label="Teléfono">{formatPhone(draft.customerPhone)}</SummaryRow>

                <SummaryRow label="Método de pago">
                    {method?.label ?? draft.paymentMethod}
                </SummaryRow>

                <div className="estimate">
                    <div className="estimate-total">
                        <span>Gemas a retener</span>
                        <b>{total} gemas</b>
                    </div>
                </div>

                <p className="notice notice-warn" style={{ marginTop: 12 }}>
                    Las gemas quedan <b>retenidas</b>, no acreditadas. Se liberan dentro de{' '}
                    {rules.retentionHours} h, cuando el sistema confirme que la factura{' '}
                    {draft.invoiceNumber} existe en {store.name}. Si no existe, no se acreditan.
                </p>

                {error ? <p className="notice notice-error">{error}</p> : null}

                <div className="actions">
                    <button
                        type="button"
                        className="btn btn-primary"
                        disabled={submitting}
                        onClick={onSubmit}
                    >
                        {submitting ? 'Enviando…' : 'Enviar a IVOO+'}
                    </button>
                    <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={submitting}
                        onClick={onBack}
                    >
                        Volver a editar
                    </button>
                </div>
            </div>
        </>
    );
}

import { useState } from 'react';
import type { GemRules, Store } from '../api';
import type { useSaleForm } from '../hooks/useSaleForm';
import { PaymentMethodPicker } from '../components/PaymentMethodPicker';
import { QrScanner } from '../components/QrScanner';
import { formatDocument, MAX_DIGITS } from '../domain/document';
import { MAX_INVOICE_DIGITS } from '../domain/invoice';
import { MAX_PHONE_DIGITS } from '../domain/phone';
import { gemsForMethod } from '../domain/gems';
import { formatRelative, formatTime } from '../domain/format';

interface Props {
    store: Store;
    registerCode?: string;
    rules: GemRules;
    form: ReturnType<typeof useSaleForm>;
    shift: { startedAt: string; total: number; lastAt?: string };
    onContinue: () => void;
}

/** Pantalla de registro de venta. Sin monto: la factura no expone importe. */
export function RegisterSaleScreen({
    store,
    registerCode,
    rules,
    form,
    shift,
    onContinue
}: Props) {
    const [scanning, setScanning] = useState(false);
    const gems = gemsForMethod(form.values.method, rules);

    const handleContinue = () => {
        form.markTouched();
        if (form.isValid) onContinue();
    };

    return (
        <>
            <div className="stats">
                <div className="stat">
                    <span className="stat-label">Turno iniciado</span>
                    <span className="stat-value">{formatTime(shift.startedAt)}</span>
                </div>
                <div className="stat">
                    <span className="stat-label">Ventas del turno</span>
                    <span className="stat-value">{shift.total}</span>
                </div>
                <div className="stat">
                    <span className="stat-label">Última</span>
                    <span className="stat-value">
                        {shift.lastAt ? formatRelative(shift.lastAt) : '—'}
                    </span>
                </div>
            </div>

            <div className="card">
                <div className="field">
                    <label className="label">Tienda y caja</label>
                    <div className="input input-readonly">
                        {store.name} · código {store.code}
                        {registerCode ? ` · ${registerCode}` : ''}
                    </div>
                </div>

                <div className="field">
                    <label className="label" htmlFor="invoice">
                        Número de factura
                    </label>
                    <input
                        id="invoice"
                        className={`input ${form.errors.invoiceNumber ? 'input-error' : ''}`}
                        placeholder="001018442"
                        type="tel"
                        inputMode="numeric"
                        maxLength={MAX_INVOICE_DIGITS}
                        value={form.values.invoiceNumber}
                        onChange={event => form.setField('invoiceNumber', event.target.value)}
                    />
                    {form.errors.invoiceNumber ? (
                        <p className="field-error">{form.errors.invoiceNumber}</p>
                    ) : (
                        <p className="hint">
                            Se valida contra el sistema de la tienda {rules.retentionHours} h
                            después de registrarla.
                        </p>
                    )}
                </div>

                <div className="field">
                    <label className="label" htmlFor="document">
                        Documento del cliente
                    </label>
                    <div className="input-row">
                        <input
                            id="document"
                            className={`input ${form.errors.documentId ? 'input-error' : ''}`}
                            placeholder="12345678"
                            type="tel"
                            inputMode="numeric"
                            maxLength={MAX_DIGITS}
                            value={form.values.documentId}
                            onChange={event => form.setField('documentId', event.target.value)}
                            onBlur={() => void form.checkMember()}
                        />
                        <button
                            type="button"
                            className="btn-inline"
                            onClick={() => setScanning(true)}
                        >
                            Escanear QR
                        </button>
                    </div>
                    {form.errors.documentId ? (
                        <p className="field-error">{form.errors.documentId}</p>
                    ) : null}
                    <MemberHint form={form} />
                </div>

                <div className="field">
                    <label className="label" htmlFor="customer-name">
                        Nombre del cliente
                    </label>
                    <input
                        id="customer-name"
                        className={`input ${form.errors.customerName ? 'input-error' : ''}`}
                        placeholder="Wilianny Díaz"
                        autoComplete="off"
                        value={form.values.customerName}
                        onChange={event => form.setField('customerName', event.target.value)}
                    />
                    {form.errors.customerName ? (
                        <p className="field-error">{form.errors.customerName}</p>
                    ) : null}
                </div>

                <div className="field">
                    <label className="label" htmlFor="customer-phone">
                        Teléfono del cliente
                    </label>
                    <input
                        id="customer-phone"
                        className={`input ${form.errors.customerPhone ? 'input-error' : ''}`}
                        placeholder="04121234567"
                        type="tel"
                        inputMode="numeric"
                        maxLength={MAX_PHONE_DIGITS}
                        value={form.values.customerPhone}
                        onChange={event => form.setField('customerPhone', event.target.value)}
                    />
                    {form.errors.customerPhone ? (
                        <p className="field-error">{form.errors.customerPhone}</p>
                    ) : null}
                </div>

                <label className="label">Método de pago</label>
                <PaymentMethodPicker
                    methods={rules.paymentMethods}
                    selected={form.values.method}
                    onSelect={form.selectMethod}
                />
                {form.errors.method ? (
                    <p className="field-error">{form.errors.method}</p>
                ) : (
                    <p className="hint">
                        Uno solo. Las gemas salen de ahí: <b>{gems}</b>.
                    </p>
                )}

                <div className="actions">
                    <button type="button" className="btn btn-primary" onClick={handleContinue}>
                        Continuar
                    </button>
                </div>
            </div>

            {scanning ? (
                <QrScanner
                    onDetected={documentId => {
                        form.setScannedDocument(documentId);
                        setScanning(false);
                        void form.checkMember();
                    }}
                    onClose={() => setScanning(false)}
                />
            ) : null}
        </>
    );
}

function MemberHint({ form }: { form: Props['form'] }) {
    if (form.lookingUp) return <p className="hint">Verificando documento…</p>;
    if (!form.member) return null;
    if (!form.member.found) {
        return (
            <p className="notice notice-warn" style={{ marginTop: 10 }}>
                {formatDocument(form.member.documentId)} no tiene cuenta IVOO+. Puedes
                registrar la venta igual: las gemas quedan retenidas hasta que active su
                cuenta.
            </p>
        );
    }
    return (
        <p className="hint" style={{ color: 'var(--green-dark)', fontWeight: 700 }}>
            ✓ {form.member.fullName} · {form.member.memberCode}
        </p>
    );
}

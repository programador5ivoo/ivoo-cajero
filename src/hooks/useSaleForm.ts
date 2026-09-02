import { useCallback, useMemo, useState } from 'react';
import { cashierApi } from '../api';
import type {
    CashierApi,
    DocumentSource,
    MemberLookup,
    PaymentMethodCode,
    SaleDraft,
    Store
} from '../api';
import { isValidDocument, normalizeDocument } from '../domain/document';
import { isValidInvoice, normalizeInvoice } from '../domain/invoice';
import { isValidPhone, normalizePhone } from '../domain/phone';

export interface SaleFormValues {
    invoiceNumber: string;
    documentId: string;
    customerName: string;
    customerPhone: string;
    /** UNO, no una lista: una venta no puede acumular varios métodos. */
    method: PaymentMethodCode | null;
    documentSource: DocumentSource;
}

export type SaleFormErrors = Partial<
    Record<'invoiceNumber' | 'documentId' | 'customerName' | 'customerPhone' | 'method', string>
>;

const EMPTY: SaleFormValues = {
    invoiceNumber: '',
    documentId: '',
    customerName: '',
    customerPhone: '',
    method: null,
    documentSource: 'MANUAL'
};

/**
 * "Controller" de la pantalla de registro.
 *
 * Ya no hay monto elegible: `validate-invoice` solo dice si la factura existe,
 * no cuánto costó, así que no había forma de verificar un importe tecleado. Las
 * gemas salen del ÚNICO método de pago elegido.
 */
export function useSaleForm(api: CashierApi = cashierApi) {
    const [values, setValues] = useState<SaleFormValues>(EMPTY);
    const [touched, setTouched] = useState(false);
    const [member, setMember] = useState<MemberLookup | null>(null);
    const [lookingUp, setLookingUp] = useState(false);

    const errors = useMemo(() => validate(values), [values]);
    const isValid = Object.keys(errors).length === 0;

    /** Los campos numéricos se filtran AL TECLEAR, no al validar. */
    const setField = useCallback(
        <K extends keyof SaleFormValues>(key: K, value: SaleFormValues[K]) => {
            const next =
                key === 'invoiceNumber'
                    ? (normalizeInvoice(value as string) as SaleFormValues[K])
                    : key === 'documentId'
                      ? (normalizeDocument(value as string) as SaleFormValues[K])
                      : key === 'customerPhone'
                        ? (normalizePhone(value as string) as SaleFormValues[K])
                        : value;

            setValues(current => ({ ...current, [key]: next }));
            if (key === 'documentId') setMember(null);
        },
        []
    );

    const setScannedDocument = useCallback((documentId: string) => {
        setValues(current => ({ ...current, documentId, documentSource: 'QR' }));
        setMember(null);
    }, []);

    /**
     * Selecciona el método. Volver a tocar el mismo lo deselecciona — el cajero
     * puede corregirse sin recargar, pero nunca queda con dos.
     */
    const selectMethod = useCallback((code: PaymentMethodCode) => {
        setValues(current => ({
            ...current,
            method: current.method === code ? null : code
        }));
    }, []);

    /**
     * Resuelve el documento contra el padrón y, si el cliente ya es miembro,
     * precarga su nombre — el cajero no tiene por qué volver a teclearlo.
     */
    const checkMember = useCallback(async () => {
        if (!isValidDocument(values.documentId)) return;
        setLookingUp(true);
        try {
            const found = await api.lookupMember(values.documentId);
            setMember(found);
            if (found.found && found.fullName) {
                setValues(current =>
                    current.customerName.trim()
                        ? current
                        : { ...current, customerName: found.fullName as string }
                );
            }
        } catch {
            setMember(null);
        } finally {
            setLookingUp(false);
        }
    }, [api, values.documentId]);

    const toDraft = useCallback(
        (store: Store): SaleDraft => ({
            storeId: store.id,
            invoiceNumber: normalizeInvoice(values.invoiceNumber),
            documentId: normalizeDocument(values.documentId),
            customerName: values.customerName.trim(),
            customerPhone: normalizePhone(values.customerPhone),
            // `validate` garantiza que no es null antes de llegar acá.
            paymentMethod: values.method as PaymentMethodCode,
            documentSource: values.documentSource
        }),
        [values]
    );

    const reset = useCallback(() => {
        setValues(EMPTY);
        setTouched(false);
        setMember(null);
    }, []);

    return {
        values,
        errors: touched ? errors : {},
        isValid,
        member,
        lookingUp,
        setField,
        setScannedDocument,
        selectMethod,
        checkMember,
        markTouched: () => setTouched(true),
        toDraft,
        reset
    };
}

function validate(values: SaleFormValues): SaleFormErrors {
    const errors: SaleFormErrors = {};

    if (!isValidInvoice(values.invoiceNumber)) {
        errors.invoiceNumber = 'Indica el número de factura emitido (solo dígitos).';
    }
    if (!isValidDocument(values.documentId)) {
        errors.documentId = 'Documento inválido: entre 6 y 11 dígitos, sin letras.';
    }
    if (values.customerName.trim().length < 3) {
        errors.customerName = 'Indica el nombre del cliente.';
    }
    if (!isValidPhone(values.customerPhone)) {
        errors.customerPhone = 'Teléfono inválido: entre 10 y 12 dígitos.';
    }
    if (!values.method) {
        errors.method = 'Elige el método de pago: de ahí salen las gemas.';
    }

    return errors;
}

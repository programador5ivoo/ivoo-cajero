import type { SaleResult } from '../api';
import { formatDocument } from '../domain/document';
import { describeRemaining } from '../domain/retention';
import { formatDateTime } from '../domain/format';

interface Props {
    result: SaleResult;
    onRegisterAnother: () => void;
    onViewShift: () => void;
}

/**
 * Resultado del registro.
 *
 * Siempre es "retenida": ya no hay acreditación inmediata. Se muestra cuándo se
 * resuelve, para que el cajero se lo pueda decir al cliente.
 */
export function SaleResultScreen({ result, onRegisterAnother, onViewShift }: Props) {
    return (
        <div className="card result">
            <div className="result-icon result-icon-hold">⏳</div>
            <h1 className="result-title">Venta registrada · gemas retenidas</h1>
            <p className="result-gems result-gems-hold">{result.gems} ◆</p>

            <p className="result-message">{result.message}</p>

            <div className="result-meta">
                <span>
                    {result.customerName} · {formatDocument(result.documentId)}
                </span>
                <span>Registrada: {formatDateTime(result.registeredAt)}</span>
                <span>Se valida {describeRemaining(result.validateAfter)}</span>
            </div>

            <div className="actions">
                <button type="button" className="btn btn-accent" onClick={onRegisterAnother}>
                    Registrar otra venta
                </button>
                <button type="button" className="btn btn-ghost" onClick={onViewShift}>
                    Ver actividad del turno
                </button>
            </div>
        </div>
    );
}

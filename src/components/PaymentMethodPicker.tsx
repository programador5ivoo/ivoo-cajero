import type { PaymentMethod, PaymentMethodCode } from '../api';

interface Props {
    methods: PaymentMethod[];
    selected: PaymentMethodCode | null;
    onSelect: (code: PaymentMethodCode) => void;
}

/**
 * Método de pago de la factura. UNO solo.
 *
 * Se comporta como un grupo de radio, no de casillas: elegir otro reemplaza al
 * anterior. Antes se podían marcar los siete y las gemas se sumaban, lo que
 * permitía inflar la acreditación desde la caja.
 *
 * Las gemas que muestra cada opción vienen de las reglas del backend y son
 * variables — el número de al lado no es una constante de esta app.
 */
export function PaymentMethodPicker({ methods, selected, onSelect }: Props) {
    return (
        <div className="methods" role="radiogroup" aria-label="Método de pago">
            {methods.map(method => (
                <button
                    key={method.code}
                    type="button"
                    role="radio"
                    className="method"
                    aria-checked={selected === method.code}
                    aria-pressed={selected === method.code}
                    onClick={() => onSelect(method.code)}
                >
                    <span>{method.label}</span>
                    <span className="method-bonus">{method.gems} ◆</span>
                </button>
            ))}
        </div>
    );
}

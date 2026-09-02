import type { GemRules, PaymentMethod, PaymentMethodCode } from '../api/types';

/**
 * Gemas de una venta = las del ÚNICO método de pago usado.
 *
 * No hay suma. Una venta tiene un método y ese método define el total: es lo
 * que impide que marcar varios infle la acreditación.
 *
 * La cantidad por método es VARIABLE y viene del backend en las reglas
 * (`GET /v1/cashier/rules`). Acá no se hardcodea ningún valor ni se asume rango:
 * si el método no está en las reglas vigentes, la venta otorga 0 — mejor eso
 * que acreditar con una tabla desactualizada.
 */
export function gemsForMethod(
    method: PaymentMethodCode | null,
    rules: GemRules
): number {
    if (!method) return 0;

    return rules.paymentMethods.find(entry => entry.code === method)?.gems ?? 0;
}

/** El método completo (etiqueta + gemas) para mostrarlo en la confirmación. */
export function findMethod(
    method: PaymentMethodCode | null,
    rules: GemRules
): PaymentMethod | null {
    if (!method) return null;

    return rules.paymentMethods.find(entry => entry.code === method) ?? null;
}

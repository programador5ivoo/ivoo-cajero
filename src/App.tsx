import { useState } from 'react';
import type { SaleDraft } from './api';
import { Shell } from './components/Shell';
import { useAdminDashboard } from './hooks/useAdminDashboard';
import { useCashierSession } from './hooks/useCashierSession';
import { useGemRules } from './hooks/useGemRules';
import { useSaleForm } from './hooks/useSaleForm';
import { useSaleSubmission } from './hooks/useSaleSubmission';
import { useShiftActivity } from './hooks/useShiftActivity';
import { useValidationScheduler } from './hooks/useValidationScheduler';
import { AdminDashboardScreen } from './screens/AdminDashboardScreen';
import { ConfirmSaleScreen } from './screens/ConfirmSaleScreen';
import { LoginScreen } from './screens/LoginScreen';
import { RegisterSaleScreen } from './screens/RegisterSaleScreen';
import { SaleResultScreen } from './screens/SaleResultScreen';
import { ShiftActivityScreen } from './screens/ShiftActivityScreen';

type Step = 'form' | 'confirm' | 'result' | 'shift';

/**
 * Orquestador del portal.
 *
 * Flujo: login → (según el rol) panel de administración, o directo al
 * formulario de venta.
 *
 * El cajero NO elige tienda: su usuario ya trae la tienda y la caja asignadas,
 * resueltas en el login contra `GET /api/admin/stores`. Así no puede registrar
 * ventas en una tienda que no es la suya.
 */
export default function App() {
    const { session, submitting: loggingIn, error: loginError, login, logout } =
        useCashierSession();

    const isAdmin = session?.cashier.role === 'ADMIN';
    const isCashier = Boolean(session) && !isAdmin;

    const { rules, error: rulesError } = useGemRules(Boolean(session));
    const shift = useShiftActivity(isCashier);
    const admin = useAdminDashboard(Boolean(isAdmin));
    // La validación diferida corre mientras haya sesión, con cualquiera de los
    // dos roles: si solo corriera en el panel, nadie validaría en una tienda.
    const scheduler = useValidationScheduler(Boolean(session));

    const form = useSaleForm();
    const submission = useSaleSubmission();

    const [step, setStep] = useState<Step>('form');
    const [draft, setDraft] = useState<SaleDraft | null>(null);

    const closeSession = () => {
        setDraft(null);
        setStep('form');
        form.reset();
        submission.clearIntent();
        logout();
    };

    // --- Login: ahora es la primera pantalla, sin tienda de por medio ---
    if (!session) {
        return (
            <Shell>
                <LoginScreen submitting={loggingIn} error={loginError} onSubmit={login} />
            </Shell>
        );
    }

    // --- Panel de administración ---
    if (isAdmin) {
        return (
            <Shell cashier={session.cashier} onLogout={closeSession} wide>
                <AdminDashboardScreen
                    dashboard={admin.dashboard}
                    audit={admin.audit}
                    loading={admin.loading}
                    error={admin.error}
                    running={scheduler.running}
                    onReload={() => void admin.reload()}
                    onRunValidations={async () => {
                        await scheduler.run();
                        await admin.reload();
                    }}
                    onCancel={(saleId, reason) => void admin.cancelSale(saleId, reason)}
                />
            </Shell>
        );
    }

    if (!rules) {
        return (
            <Shell cashier={session.cashier} onLogout={closeSession}>
                {rulesError ? (
                    <p className="notice notice-error">{rulesError}</p>
                ) : (
                    <p className="loading">Cargando reglas del programa…</p>
                )}
            </Shell>
        );
    }

    // La tienda viene de la sesión. Un cajero sin tienda no debería existir —
    // el login lo rechaza— pero si el contrato cambia, esto lo hace evidente.
    const store = session.store;
    if (!store) {
        return (
            <Shell cashier={session.cashier} onLogout={closeSession}>
                <p className="notice notice-error">
                    Tu usuario no tiene una tienda asignada. Contacta a administración.
                </p>
            </Shell>
        );
    }

    const goToForm = () => {
        submission.clearIntent();
        form.reset();
        setDraft(null);
        setStep('form');
    };

    const goToConfirm = () => {
        setDraft(form.toDraft(store));
        // La clave de idempotencia nace aquí, una sola vez por venta.
        submission.beginIntent();
        setStep('confirm');
    };

    const send = async () => {
        if (!draft) return;
        const result = await submission.submit(draft, store);
        // Si falló, nos quedamos en la confirmación: el cajero reintenta con la
        // MISMA clave, así que no hay riesgo de doble retención.
        if (result) setStep('result');
    };

    return (
        <Shell
            store={store}
            cashier={session.cashier}
            onLogout={closeSession}
            wide={step === 'shift'}
            action={
                step === 'shift'
                    ? { label: 'Registrar venta', onClick: goToForm }
                    : { label: 'Actividad del turno', onClick: () => setStep('shift') }
            }
        >
            {step === 'form' ? (
                <RegisterSaleScreen
                    store={store}
                    registerCode={session.cashier.registerCode}
                    rules={rules}
                    form={form}
                    shift={{
                        startedAt: session.shift.startedAt,
                        total: shift.activity?.total ?? 0,
                        lastAt: shift.activity?.sales[0]?.registeredAt
                    }}
                    onContinue={goToConfirm}
                />
            ) : null}

            {step === 'confirm' && draft ? (
                <ConfirmSaleScreen
                    draft={draft}
                    store={store}
                    rules={rules}
                    submitting={submission.submitting}
                    error={submission.error}
                    onSubmit={send}
                    onBack={() => setStep('form')}
                />
            ) : null}

            {step === 'result' && submission.result ? (
                <SaleResultScreen
                    result={submission.result}
                    onRegisterAnother={() => {
                        void shift.reload();
                        goToForm();
                    }}
                    onViewShift={() => {
                        void shift.reload();
                        setStep('shift');
                    }}
                />
            ) : null}

            {step === 'shift' ? (
                <ShiftActivityScreen
                    activity={shift.activity}
                    loading={shift.loading}
                    error={shift.error}
                    onReload={() => void shift.reload()}
                    onBack={goToForm}
                />
            ) : null}
        </Shell>
    );
}

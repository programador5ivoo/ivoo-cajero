import { useState } from 'react';
import type { FormEvent } from 'react';
import { isValidPin, MAX_PIN_DIGITS, MIN_PIN_DIGITS, normalizePin } from '../domain/pin';

interface Props {
    submitting: boolean;
    error: string | null;
    onSubmit: (username: string, pin: string) => void;
}

/**
 * Identificación — PRIMERA pantalla del portal.
 *
 * El usuario ES la tienda: cada cajero está atado a una tienda y una caja, que
 * llegan resueltas en la sesión. No hay pantalla de selección, y por lo tanto
 * no hay forma de registrar ventas en una tienda ajena.
 *
 * Tras 3 intentos fallidos el backend bloquea al usuario unos minutos y lo
 * anota en el historial. El mensaje del bloqueo llega por `error`.
 *
 * NOTA de diseño: el prototipo decía "Usuario ERP" y "el mismo PIN del ERP".
 * Como no habrá ERP, las credenciales son propias de IVOO+ y el directorio de
 * cajeros vive en el backend.
 */
export function LoginScreen({ submitting, error, onSubmit }: Props) {
    const [username, setUsername] = useState('');
    const [pin, setPin] = useState('');
    /** El aviso de PIN corto no aparece mientras se teclea, solo al intentar entrar. */
    const [tried, setTried] = useState(false);

    const pinTooShort = tried && pin.length > 0 && !isValidPin(pin);
    const canSubmit = Boolean(username.trim()) && isValidPin(pin);

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        setTried(true);
        if (!canSubmit) return;
        onSubmit(username.trim(), pin);
    };

    return (
        <>
            <h1 className="title">Identifícate para abrir caja</h1>
            <p className="subtitle">Tu usuario ya tiene tienda y caja asignadas.</p>

            <form className="card" onSubmit={handleSubmit}>
                <div className="field">
                    <label className="label" htmlFor="username">
                        Usuario
                    </label>
                    <input
                        id="username"
                        className="input"
                        autoComplete="username"
                        autoCapitalize="none"
                        value={username}
                        onChange={event => setUsername(event.target.value)}
                    />
                </div>

                <div className="field">
                    <label className="label" htmlFor="pin">
                        PIN de caja
                    </label>
                    <input
                        id="pin"
                        className={`input ${pinTooShort ? 'input-error' : ''}`}
                        type="password"
                        inputMode="numeric"
                        autoComplete="current-password"
                        maxLength={MAX_PIN_DIGITS}
                        value={pin}
                        onChange={event => setPin(normalizePin(event.target.value))}
                    />
                    {pinTooShort ? (
                        <p className="field-error">
                            El PIN son al menos {MIN_PIN_DIGITS} dígitos.
                        </p>
                    ) : (
                        <p className="hint">
                            PIN asignado por IVOO+ para esta tienda. Solo dígitos.
                        </p>
                    )}
                </div>

                {error ? <p className="notice notice-error">{error}</p> : null}

                <div className="actions">
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={submitting || !username.trim() || !pin}
                    >
                        {submitting ? 'Entrando…' : 'Entrar'}
                    </button>
                </div>
            </form>
        </>
    );
}

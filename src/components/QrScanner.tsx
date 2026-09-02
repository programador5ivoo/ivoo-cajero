import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { parseScannedDocument } from '../domain/document';

interface Props {
    /** Recibe el documento ya normalizado (solo dígitos: `12345678`). */
    onDetected: (documentId: string) => void;
    onClose: () => void;
}

/**
 * Escáner del QR del cliente (decisión N4: el QR resuelve la cédula).
 *
 * Requiere origen seguro: `getUserMedia` solo funciona en HTTPS o en localhost.
 * Si la caja usa un lector 2D físico (que emula teclado), este componente no
 * hace falta: el lector escribe directo en el campo de documento.
 */
export function QrScanner({ onDetected, onClose }: Props) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [unreadable, setUnreadable] = useState(false);

    useEffect(() => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d', { willReadFrequently: true });
        let stream: MediaStream | null = null;
        let frame = 0;
        let stopped = false;

        const scan = () => {
            if (stopped) return;
            frame = requestAnimationFrame(scan);

            const video = videoRef.current;
            if (!context || !video || video.readyState < video.HAVE_ENOUGH_DATA) return;

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);

            const image = context.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(image.data, image.width, image.height, {
                inversionAttempts: 'dontInvert'
            });
            if (!code?.data) return;

            const documentId = parseScannedDocument(code.data);
            if (!documentId) {
                // QR legible pero sin un documento válido: seguimos escaneando.
                setUnreadable(true);
                return;
            }
            stopped = true;
            onDetected(documentId);
        };

        // OJO: en un origen inseguro el navegador no expone `mediaDevices` en
        // absoluto. Encadenar `?.getUserMedia(...).then(...)` reventaba con un
        // TypeError —justo en el caso que más importa: la caja abierta por IP
        // de red— en vez de mostrar el mensaje que explica que hace falta HTTPS.
        if (!navigator.mediaDevices?.getUserMedia) {
            setError(describeCameraError(null));
            return;
        }

        navigator.mediaDevices
            .getUserMedia({ video: { facingMode: 'environment' } })
            .then(async media => {
                if (stopped) {
                    media.getTracks().forEach(track => track.stop());
                    return;
                }
                stream = media;
                const video = videoRef.current;
                if (!video) return;
                video.srcObject = media;
                await video.play();
                scan();
            })
            .catch((err: unknown) => setError(describeCameraError(err)));

        return () => {
            stopped = true;
            cancelAnimationFrame(frame);
            stream?.getTracks().forEach(track => track.stop());
        };
    }, [onDetected]);

    return (
        <div className="scanner" role="dialog" aria-modal="true" aria-label="Escanear QR del cliente">
            <div className="scanner-frame">
                <video ref={videoRef} muted playsInline />
                <div className="scanner-reticle" />
            </div>

            <p className="scanner-text">
                {error ? 'No pudimos abrir la cámara' : 'Apunta al código QR del cliente'}
            </p>
            {error ? <p className="scanner-error">{error}</p> : null}
            {!error && unreadable ? (
                <p className="scanner-error">
                    Ese código no contiene un documento válido. Prueba otra vez o ingrésalo a mano.
                </p>
            ) : null}

            <div className="scanner-actions">
                <button type="button" className="btn btn-accent" onClick={onClose}>
                    Ingresar el documento a mano
                </button>
            </div>
        </div>
    );
}

function describeCameraError(error: unknown): string {
    if (!window.isSecureContext || !navigator.mediaDevices) {
        return 'La cámara solo funciona en HTTPS o en localhost. Publica el portal con certificado o usa un lector físico.';
    }
    const name = error instanceof Error ? error.name : '';
    if (name === 'NotAllowedError') {
        return 'El navegador bloqueó el permiso de cámara. Habilítalo para este sitio y vuelve a intentar.';
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        return 'No se detectó ninguna cámara en este equipo.';
    }
    return 'No se pudo iniciar la cámara en este equipo.';
}

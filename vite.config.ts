import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5183,
        // La cámara (getUserMedia) solo funciona en un origen seguro: localhost
        // cuenta como seguro, cualquier otro host exige HTTPS. Ver README §Escáner.
        host: 'localhost'
    }
});

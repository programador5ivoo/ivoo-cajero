# Entrega del proyecto · Portal del Cajero IVOO+

Guía para quien recibe el código y va a seguir implementándolo. Está escrita
para que puedas trabajar sin preguntarme nada.

**Los tres documentos y para qué sirve cada uno:**

| Documento | Cuándo leerlo |
| --- | --- |
| `README.md` | Referencia rápida: comandos, usuarios de prueba, endpoints |
| `DOCUMENTACION.md` | Especificación: qué hace el sistema y por qué, contratos, reglas |
| **`ENTREGA.md`** (este) | Cómo levantarlo, cómo está organizado, cómo cambiarlo, qué falta |

---

## 1. Qué estás recibiendo

Un portal de caja **funcional de punta a punta**, con dos APIs externas reales
conectadas y el ledger de gemas simulado en `localStorage`.

| | |
| --- | --- |
| Stack | React 18 + TypeScript + Vite |
| Tamaño | ~4.100 líneas, 40 archivos |
| Dependencias | Solo `jsqr` (lector de QR). Sin librería de UI |
| Estado | Todas las pantallas funcionan; falta el backend de IVOO+ |

### Lo que ya es real

- **Tiendas** — `GET https://delivery.ivoofix.com/api/admin/stores` (41 tiendas)
- **Validación de facturas** — `GET .../api/public/validate-invoice?doc=&cod_t=`

Estas dos funcionan siempre, con o sin backend de IVOO+.

### Lo que está simulado

- El **ledger de gemas**: registrar ventas, retener, liberar, anular e historial.
  Vive en `localStorage` (`MockCashierApi`).

**Esa es la frontera exacta del trabajo que queda**: reemplazar el mock por el
backend real. La app no cambia — ver §6.

---

## 2. Levantarlo

```bash
cd ivoo-cajero
npm install
npm run dev        # http://localhost:5183/
```

Entra con `jmarin` / `1234` (cajero de NAGUANAGUA, CAJA-01) o `admin` / `9999`
(panel de administración).

### Problemas que vas a encontrar en Windows

Los encontré yo; te los ahorro:

**Los `.bin` de node_modules no tienen wrappers `.cmd`.** Si `npx jest` o
`npx eslint` dicen "no se reconoce como comando", invoca el script directamente:

```bash
node node_modules/jest/bin/jest.js
node node_modules/eslint/bin/eslint.js src/
```

**`npm install` puede fallar con `EACCES` sobre `node_modules/.bin/`.** Suele ser
el antivirus o un editor con archivos abiertos. Cierra el editor y reintenta; si
insiste, borra `node_modules` y reinstala.

**Jest no descubre tests en este repo.** Encuentra 0 specs de ~900. Es un
problema del entorno, no del proyecto. Ver §7 para cómo pruebo yo.

---

## 3. Mapa del código

```
src/
├── api/          ← habla con el mundo exterior
├── domain/       ← reglas puras: sin red, sin React
├── hooks/        ← estado y orquestación ("controllers")
├── screens/      ← pantallas: solo presentación y eventos
├── components/   ← piezas reutilizables
└── styles/       ← theme.css (tokens) + app.css
```

### La regla que sostiene todo

**Ninguna pantalla ni hook conoce una URL.** Todos dependen de la interfaz
`CashierApi` (`src/api/cashier-api.interface.ts`).

```
screens/ → hooks/ → CashierApi (interfaz)
                        ↙        ↘
              MockCashierApi   HttpCashierApi
```

`src/api/index.ts` es el **único** archivo que decide cuál se usa. Si respetas
esto, cambiar de mock a backend real es una variable de entorno.

> **Si te ves importando `fetch` o una URL dentro de `screens/` o `hooks/`,
> estás rompiendo la arquitectura.** Ponlo en `api/`.

### Qué hay en cada carpeta

**`api/`**

| Archivo | Responsabilidad |
| --- | --- |
| `cashier-api.interface.ts` | El contrato. Empieza a leer por aquí |
| `types.ts` | DTOs. Segunda parada |
| `index.ts` | Elige mock o HTTP |
| `mock-cashier-api.ts` | Ledger local + tarea programada + auditoría (385 líneas, el archivo más grande) |
| `http-cashier-api.ts` | Cliente del backend de IVOO+ (aún inexistente) |
| `mock-data.ts` | Usuarios, reglas, miembros de prueba |
| `stores-api.ts` | **API real** de tiendas |
| `invoice-validation.ts` | **API real** de validación de facturas |

**`domain/`** — funciones puras, sin red ni React. Son las más fáciles de probar
y donde debe vivir cualquier regla nueva.

Cuatro módulos siguen el mismo patrón (`document`, `invoice`, `phone`, `pin`):
una función `normalize*` que filtra al teclear y una `isValid*` que valida largo.
Si agregas un campo numérico, cópialo.

**`hooks/`** — uno por pantalla o por preocupación. Reciben el `api` como
parámetro con valor por defecto (`api: CashierApi = cashierApi`), lo que permite
inyectar un doble en pruebas sin tocar nada más.

---

## 4. Cómo funciona, en orden de lectura

Si vas a tocar el código, léelo en este orden:

1. **`src/App.tsx`** — el orquestador. En 200 líneas ves todo el flujo.
2. **`src/api/types.ts`** — el modelo de datos.
3. **`src/api/mock-cashier-api.ts`** — la lógica de negocio real (hoy).
4. La pantalla que vayas a tocar.

### El ciclo que hay que entender antes de tocar nada

```
registrar venta ──▶ RETAINED (gemas retenidas)
                        │
                4 h después: se consulta validate-invoice
                        ├── 200 → RELEASED  (gemas acreditadas)
                        ├── 404 → REJECTED  (no se acreditan)
                        └── error de red → sigue RETAINED, reintenta
```

Más `CANCELLED`, que solo el administrador puede poner y solo sobre una venta
retenida.

**Las gemas nunca se acreditan al registrar.** Si te encuentras escribiendo
código que acredita al momento de la venta, algo se entendió mal.

---

## 5. Recetas para cambios comunes

### Agregar un campo al formulario de venta

1. `api/types.ts` → agrégalo a `SaleDraft` y `SaleRecord`.
2. `hooks/useSaleForm.ts` → a `SaleFormValues`, a `EMPTY`, a `toDraft`, y su
   regla en `validate`.
3. Si es numérico, crea `domain/<campo>.ts` copiando `phone.ts`, y engánchalo en
   el `setField` (se filtra **al teclear**, no al validar).
4. `screens/RegisterSaleScreen.tsx` → el input.
5. `api/mock-cashier-api.ts` → guárdalo en el `SaleRecord`.
6. Si el admin debe verlo, `screens/AdminDashboardScreen.tsx`.

TypeScript te va a guiar: cambia el tipo primero y sigue los errores.

### Cambiar las gemas de un método de pago

**No toques el código.** Los valores vienen de `getRules()`. Para la demo están
en `mock-data.ts:17`; en producción los sirve el backend. El front no hardcodea
ninguno.

### Cambiar la ventana de retención

`domain/retention.ts`. El default de 4 h se cambia ahí; para QA usa la variable
de entorno (§7).

### Agregar un estado nuevo a la venta

1. `api/types.ts` → `SaleStatus`.
2. `components/StatusBadge.tsx` → etiqueta y estilo (obligatorio: los `Record`
   son exhaustivos, TypeScript te avisa si olvidas uno).
3. `AdminDashboardScreen.tsx` → el filtro.
4. `mock-cashier-api.ts` → quién y cuándo lo pone.

### Agregar una acción al historial

1. `api/types.ts` → `AuditAction`.
2. `AdminDashboardScreen.tsx` → `ACTION_LABELS` (también exhaustivo).
3. Llama a `this.log(...)` donde ocurra.

---

## 6. Lo que falta implementar

En orden de dependencia. Los primeros bloquean a los siguientes.

### 6.1 Decisiones de negocio (bloquean código)

Nadie puede implementar esto hasta que se decidan:

| Decisión | Por qué bloquea |
| --- | --- |
| **¿El cajero entra en alcance?** | Hoy la documentación lo deja fuera explícitamente (`Contexto Maestro §2`, `Plan-Cierre-API`). Sin esto, nadie construye los endpoints |
| **Tasa de gemas en tienda física** | El motor de reglas de la API usa `floor(monto/100)*100`; este portal ya no usa monto. `Contexto Maestro §8` lo sigue listando como pendiente |
| **¿Qué lleva el QR?** | El cajero asume que es la cédula; `Modulo-Identity-QR` dice que es un token de un solo uso. Y nadie tiene asignado construir el endpoint que lo valide |

### 6.2 Backend (el trabajo grande)

**El cron de validación es lo más urgente.** Hoy la tarea corre en el
**navegador** (`useValidationScheduler`): revisa al montar y cada minuto, así
que una venta se valida la primera vez que alguien abre el portal después de
vencida su ventana, no a las 4 horas. **Si nadie abre el portal el fin de
semana, nadie valida.**

La lógica ya está escrita y es reutilizable: `runDueValidations()`. El servidor
debe llamar a lo mismo desde un cron.

Después, los endpoints. Las rutas propuestas están en `http-cashier-api.ts`:

```
POST /v1/cashier/session              abrir turno
GET  /v1/cashier/rules                gemas por método + horas de retención
GET  /v1/cashier/members/lookup       documento → miembro
POST /v1/cashier/sales                registrar venta (Idempotency-Key)
GET  /v1/cashier/shifts/current       actividad del turno
POST /v1/cashier/validations/run      forzar validación
GET  /v1/cashier/admin/dashboard      cifras del panel
POST /v1/cashier/sales/:id/cancel     anular
GET  /v1/cashier/admin/audit          historial
```

**Dos problemas de autenticación sin resolver:**

1. `registerSale` acredita en el ledger. `Arquitectura-Ingesta-Compras §6.2`
   define la ingesta como server-to-server con credencial de servicio y dice
   que **no debe ser alcanzable con un JWT de usuario final**. El token de caja
   es un tercer actor que ese documento no contempla.
2. Hoy solo existen JWT de `END_USER` y `GESTION`. No hay autenticación
   server-to-server de ningún tipo (`Actualizaciones/2026-09-02`).

### 6.3 Datos que faltan

- **Métodos de pago por API.** No existe el endpoint en `delivery.ivoofix.com`
  (probé `/api/{admin,public}/payment-methods`, `/payments`, `/gems`: 404).
  Están en `mock-data.ts`.
- **Directorio de cajeros.** Vive en `mock-data.ts` con las asignaciones de
  tienda y caja. El backend no tiene dónde ponerlo.

### 6.4 Números que me inventé

Son guardas para que la app no acepte basura, **ninguno confirmado con la
operación**. Si el valor real es mayor, el campo corta y el flujo falla en
silencio:

| Valor | Dónde | Riesgo si es incorrecto |
| --- | --- | --- |
| PIN 4–6 dígitos | `domain/pin.ts` | Nadie puede entrar |
| Factura hasta 12 dígitos | `domain/invoice.ts` | Facturas largas se truncan |
| Teléfono 10–12 dígitos | `domain/phone.ts` | Números válidos rechazados |
| 3 intentos / 5 min de bloqueo | `mock-data.ts` | Política de seguridad sin acordar |

### 6.5 Fuera del alcance del prototipo

- Devoluciones y anulaciones de factura (sin ERP nadie dispara el reverso)
- Límites de emisión por turno y aprobación de supervisor
- Identificación por QR (ver §6.1)

---

## 7. Cómo probar

### Jest no funciona aquí

Descubre 0 specs de ~900 en este entorno. Hay specs escritos
(`__tests__/computeOrderGems.spec.js` en el proyecto web) pero no corren.

### Lo que uso en su lugar

Un harness de Node que empaqueta el módulo con esbuild y lo ejerce directo.
Funciona bien y prueba **el código real**, no una copia:

```bash
# 1. Empaquetar el módulo (resuelve imports y sustituye import.meta.env)
node -e "
require('esbuild').build({
  entryPoints: ['src/api/mock-cashier-api.ts'],
  bundle: true, format: 'esm', platform: 'node', target: 'node20',
  outfile: 'tmp-bundle.mjs',
  define: {
    'import.meta.env.VITE_RETENTION_HOURS': 'globalThis.__R__',
    'import.meta.env.VITE_IVOO_API_URL': 'undefined'
  }
})"

# 2. Escribir el test con un localStorage falso, y correrlo
node tmp-test.mjs

# 3. Limpiar
rm tmp-bundle.mjs tmp-test.mjs
```

El `localStorage` falso son cuatro líneas:

```js
const st = new Map();
globalThis.localStorage = {
    getItem: k => (st.has(k) ? st.get(k) : null),
    setItem: (k, v) => st.set(k, String(v)),
    removeItem: k => st.delete(k)
};
```

Así verifiqué el ciclo completo contra las **APIs reales** (factura `001018442`
existe → `RELEASED`; `999999999` no existe → `REJECTED`).

### Probar la retención sin esperar 4 horas

```bash
echo "VITE_RETENTION_HOURS=0.0000001" > .env.local
npm run dev
```

La ventana vence al instante. Entra como `admin` y pulsa **"Validar ahora"**.

**Borra `.env.local` antes de commitear.** Un valor ≤ 0 o inválido cae al
default de 4 h a propósito, pero un `0.0001` olvidado en producción validaría
las facturas antes de que existan en el sistema de la tienda.

### Datos para probar

| Qué | Valor |
| --- | --- |
| Cajero | `jmarin` / `1234` → NAGUANAGUA (`02`), CAJA-01 |
| Administrador | `admin` / `9999` |
| Factura que **existe** | `001018443` en tienda `02` |
| Factura que **no existe** | `999999999` |
| Miembro | `12345678` → Wilianny Díaz |

Otras facturas reales en la tienda `02`: `001018444`, `001018450`, `001019000`
(esta última tiene dos productos y devuelve `qty: "Varios"`).

### Empezar de cero

El estado vive en `localStorage`. En la consola del navegador:

```js
localStorage.removeItem('IVOO_CAJERO_ESTADO_v2');
```

Esto borra ventas, historial **y bloqueos de login**.

---

## 8. Trampas: cosas que parecen bugs y no lo son

Léelas antes de "arreglar" algo.

**El botón de entrar sigue habilitado con un PIN corto.** Deliberado. Si
estuviera deshabilitado, el cajero haría clic, no pasaría nada y no sabría por
qué. El clic es lo que dispara el aviso.

**Un refresh cierra el turno.** Deliberado. Una caja es un equipo compartido; la
sesión vive solo en memoria. Las ventas sí persisten.

**Un error de red no rechaza la venta.** `validateInvoice` distingue tres
desenlaces, no dos: existe, no existe, y *no se pudo consultar*. El tercero deja
la venta retenida para el siguiente intento. Perder las gemas de un cliente que
sí compró por un timeout sería un error caro y silencioso.

**El bloqueo se comprueba antes que el PIN.** Si se validara la contraseña
primero, se podría seguir probando y el mensaje distinto delataría qué usuarios
existen.

**`registeredAt` se reimpone en cada cambio de estado.** `updateSale` la vuelve
a poner a propósito: ninguna transición posterior puede tocar la fecha.

**Hay cuatro barreras contra la doble retención, no una.** Botón deshabilitado,
ref síncrono `inFlight`, clave de idempotencia, y 409 del servidor. Si quitas
una porque "sobra", quitas una capa real: las dos primeras evitan el doble clic
rápido, las dos últimas cubren lo que sí llegó a la red.

**Un método de pago, no varios.** El tipo es `paymentMethod: PaymentMethodCode`,
singular. Era un arreglo y las gemas se sumaban, lo que permitía inflar la
acreditación marcando los siete. **No lo vuelvas a convertir en lista.**

**El `cod_t` se deriva, no se teclea.** Es el `id` de la tienda con relleno a dos
dígitos (`stores-api.ts`). La factura está atada a la tienda: la misma `doc` con
otro `cod_t` responde 404, por eso cada venta guarda el `storeCode` con el que se
registró.

**El documento va sin prefijo.** Solo dígitos, porque así lo guarda Magento
(`casheaPayment.js`). Si enviaras `V-12345678` y allá está `12345678`, la
resolución del miembro fallaría siempre. La contrapartida: no se distingue
cédula de RIF; hay que decidirlo primero en Magento.

**La severidad se codifica con relleno, no con color.** La paleta es verde,
negro y blanco: no hay rojo ni amarillo. Verde = liberada, contorno = retenida,
negro = rechazada, gris = anulada.

---

## 9. Convenciones

- **Comentarios en español**, explicando *por qué*, no *qué*. Si el comentario
  repite el código, sobra.
- **Sin librería de UI.** CSS plano con tokens en `theme.css`. No metas Tailwind
  ni Material sin hablarlo: el bundle actual son 105 kB gzip.
- **`domain/` no importa React ni hace red.** Nunca.
- Los `Record<Tipo, string>` de etiquetas son **exhaustivos** a propósito:
  TypeScript te obliga a actualizarlos al agregar un caso.
- Antes de commitear: `npm run build` (hace typecheck + build).

---

## 10. Contactos del código

Si algo no cuadra, estos son los archivos donde vive cada decisión:

| Pregunta | Archivo |
| --- | --- |
| ¿Cómo se calculan las gemas? | `domain/gems.ts` |
| ¿Cuándo se valida una factura? | `domain/retention.ts` + `hooks/useValidationScheduler.ts` |
| ¿Qué se le envía al servidor? | `api/types.ts` → `SaleDraft` |
| ¿Quién puede entrar? | `api/mock-data.ts` → `mockUsers` |
| ¿Cómo se lee el QR? | `domain/document.ts` → `parseScannedDocument` |
| ¿Qué endpoints faltan? | `api/http-cashier-api.ts` |
| ¿Por qué esta decisión? | `DOCUMENTACION.md` §6 y este documento §8 |

---

*Última actualización: 2 de septiembre de 2026. Los contratos de las APIs
externas se verificaron contra producción esa fecha.*

# Portal del Cajero IVOO+ · Especificación técnica

Registro de ventas en tienda física y **retención** de gemas del programa de
fidelización. Las gemas no se acreditan al registrar la venta: quedan retenidas
y se liberan cuatro horas después, cuando el sistema de la tienda confirma que
la factura existe de verdad.

React 18 + TypeScript + Vite · 4.098 líneas en 40 archivos · puerto 5183
Actualizado: 02/09/2026

---

## 1. Qué es

IVOO+ es el programa de fidelización por gemas de IVOO. Los clientes acumulan
gemas al facturar en cualquier canal. Este portal cubre el canal de **tienda
física**: el cajero registra a mano la factura que acaba de emitir y el cliente
al que corresponde.

Reemplaza al evento de factura que en la especificación original enviaba el ERP.
Como no habrá ERP, **este portal es la única vía de acumulación en tienda
física**.

### El problema que resuelve la retención

Un cajero puede teclear cualquier número de factura. Si las gemas se acreditaran
al instante, una factura inventada acreditaría saldo real. Por eso la
acreditación se parte en dos tiempos: al registrar se *retiene*, y cuatro horas
después una tarea programada consulta el sistema de la tienda para confirmar que
esa factura existe. Solo entonces se libera.

> **Lo que no se puede validar.** El validador dice **si la factura existe**, no
> cuánto costó. Por eso el portal no pide monto: no había forma de verificar un
> importe tecleado. Las gemas salen de los métodos de pago usados.

---

## 2. Arquitectura

Cuatro capas, con inversión de dependencias entre las dos del medio. Ninguna
pantalla ni hook conoce una URL: todos dependen de la interfaz `CashierApi`.

```
screens/          pantallas — solo presentación y eventos
    ↓
hooks/            "controllers" — estado y orquestación
    ↓
api/CashierApi    ← interfaz (DIP). Nadie depende de una implementación
    ↙        ↘
MockCashierApi   HttpCashierApi
(localStorage)   (API de IVOO+, aún inexistente)

domain/           reglas puras, sin red ni React
api/stores-api        ┐ APIs externas REALES,
api/invoice-validation┘ independientes del modo
```

### Las dos implementaciones son intercambiables

`src/api/index.ts` es el único punto que decide cuál se usa. Con
`VITE_IVOO_API_URL` definida habla con la API real; sin ella, corre contra la
implementación local.

**Importante:** ese interruptor **no afecta a las tiendas ni a la validación de
facturas**. Esas dos salen de APIs externas reales y funcionan igual en los dos
modos. Lo único simulado es el ledger de gemas de IVOO+.

### Persistencia

| Qué | Dónde | Por qué |
| --- | --- | --- |
| Ventas e historial | `localStorage` | La retención dura horas: tienen que sobrevivir a un refresh |
| Sesión de caja | Solo memoria | Una caja es un equipo compartido; un refresh cierra el turno *a propósito* |

---

## 3. Flujo

El login es la primera pantalla. La tienda ya no viene de la URL: se elige
después de autenticarse, contra el listado real de tiendas. El rol decide a
dónde va el usuario.

```
login (usuario + PIN)      ← 3 fallos = bloqueo de 5 min
   │
   ├── rol ADMIN  ──→ panel de administración
   │
   └── rol CAJERO ──→ registrar venta
                      (tienda y caja vienen del usuario,
                       resueltas contra el API de tiendas)
                          ↓
                      confirmar  ──→  resultado: gemas RETENIDAS
                                          │
                     4 h después ─────────┘
                 tarea programada consulta la factura
                     ├── existe    → gemas LIBERADAS
                     └── no existe → gemas RECHAZADAS
```

### El usuario ES la tienda

Dos versiones atrás el `store_id` venía en la URL: cualquiera podía cambiar el
parámetro y operar como otra tienda. Después pasó a elegirse de una lista tras
autenticarse, que era mejor pero seguía permitiendo elegir cualquiera de las 41.

Ahora **cada usuario está asignado a una tienda y a una caja**. Llegan resueltas
en la sesión desde el directorio, y no hay pantalla de selección: un cajero no
tiene forma de registrar ventas fuera de su tienda.

Un cajero sin `storeId` no puede entrar (403): sin tienda no hay `cod_t` con el
que validar sus facturas.

### Bloqueo por intentos fallidos

Tras **3 intentos fallidos** el usuario queda bloqueado **5 minutos** y se anota
en el historial de acciones.

| Decisión | Por qué |
| --- | --- |
| Se comprueba **antes** que el PIN | Si no, se podría seguir probando PINs, y el mensaje distinto delataría cuál usuario existe |
| El contador es **por usuario** | Bloquear por navegador dejaría pasar un ataque desde otra pestaña; bloquear global dejaría a toda la tienda fuera |
| Persiste en `localStorage` | Si viviera en memoria, recargar la página sería la forma trivial de saltárselo |
| **Una** entrada en el historial | Se registra el bloqueo, no cada intento. Los dos primeros fallos no dejan rastro |

---

## 4. Ciclo de vida de la venta

```
                                      ┌──────────────┐
                              200 ┌──▶│   RELEASED   │ gemas acreditadas
                                  │   └──────────────┘
 registro    ┌──────────┐    ┌────┴─────┐
 ──────────▶ │ RETAINED │───▶│ ¿existe  │
             └──────────┘    │la factura│
                  │   ▲      └────┬─────┘
                  │   │           │   ┌──────────────┐
                  │   │      404  └──▶│   REJECTED   │ no se acreditan
                  │   │               └──────────────┘
                  │   └── error de red: sigue retenida, reintenta
                  │
                  └── anulación manual ──▶ CANCELLED
```

| Estado | Significa | Gemas | Quién lo pone |
| --- | --- | --- | --- |
| `RETAINED` | Registrada, esperando la ventana | Retenidas | El cajero, al registrar |
| `RELEASED` | La factura existe en la tienda | Acreditadas | La tarea programada |
| `REJECTED` | La factura no existe | No se acreditan | La tarea programada |
| `CANCELLED` | Anulada a mano | Liberadas de la retención | El administrador |

Solo `RETAINED` tiene transiciones de salida: una vez liberada, rechazada o
anulada, la venta no cambia más.

> **Un error de red no rechaza.** El validador distingue tres desenlaces, no dos:
> existe, no existe, y *no se pudo consultar*. Un timeout o un 500 deja la venta
> retenida para el siguiente intento. Perder las gemas de un cliente que sí
> compró por una caída de red sería un error caro y silencioso.

---

## 5. APIs externas

Dos endpoints reales, verificados contra producción. No son mock y funcionan en
cualquier modo. Ambos responden con `Access-Control-Allow-Origin: *`, así que el
navegador los llama directo.

### Tiendas

```
GET https://delivery.ivoofix.com/api/admin/stores

{ "success": true, "data": [
    { "id": 2, "name": "NAGUANAGUA", "magento_id": "203",
      "city": "Naguanagua", "state": "Carabobo", ... }
] }
```

Devuelve **41 tiendas**. El portal las ordena alfabéticamente y ofrece buscador
por nombre, ciudad, estado o código.

> **El `cod_t` no viene en la respuesta.** El código que exige el validador de
> facturas es el `id` con relleno a dos dígitos — id `2` → `02`. Se deriva en
> `stores-api.ts` y nunca se teclea a mano.

### Validación de factura

```
GET https://delivery.ivoofix.com/api/public/validate-invoice?doc=001018442&cod_t=02

200 → { "name": "UPS NW-08UP 800VA/480W NUWE", "qty": "1.00" }
404 → { "error": "Factura no encontrada" }
```

| Caso | Petición | Respuesta | Interpretación |
| --- | --- | --- | --- |
| Factura existe | `doc=001018442` `cod_t=02` | 200 + `name` | Liberar gemas |
| Varios productos | `doc=001019000` `cod_t=02` | 200, `qty:"Varios"` | Liberar gemas |
| No existe | `doc=999999999` | 404 | Rechazar |
| Tienda equivocada | `doc=001018442` `cod_t=06` | 404 | Rechazar |

Con varios productos el API devuelve **igual un solo objeto**, con los nombres
concatenados (`"A (x1) + B (x1)"`) y `qty: "Varios"`. No hay arreglo que
recorrer: «tiene productos» es simplemente 200 con `name`.

> **La factura está atada a la tienda.** La misma `doc` con otro `cod_t` responde
> 404. Por eso cada venta guarda el `storeCode` con el que se registró, y la
> validación usa *ese*, no la tienda del turno que esté abierto cuando corre la
> tarea.

---

## 6. Reglas de negocio

### Cálculo de gemas

Una venta tiene **UN solo método de pago**, y las gemas son las de ese método.
No hay suma.

Antes se podían marcar los siete y las gemas se sumaban, lo que permitía inflar
la acreditación desde la caja. Ahora el tipo es `paymentMethod: PaymentMethodCode`
(singular, no un arreglo): sumar es imposible por construcción, no solo difícil.

| Código | Etiqueta | Gemas |
| --- | --- | ---: |
| `EFECTIVO` | Efectivo | 10 |
| `ZELLE` | Zelle | 10 |
| `BINANCE` | Binance | 10 |
| `TDC_INTERNACIONAL` | TDC internacional | 10 |
| `TDD` | TDD | 5 |
| `PAGO_MOVIL` | Pago móvil | 5 |
| `TRANSFERENCIA` | Transferencia | 5 |

Estos valores son **variables**: los sirve el backend en
`GET /v1/cashier/rules` y el front no hardcodea ninguno. Si Efectivo pasa de 10 a
250, esta app no cambia. Un método que no esté en las reglas vigentes otorga 0 —
mejor eso que acreditar con una tabla desactualizada.

Equivalencia de canje: 1 gema = USD 0,01.

> **Pendiente.** Estos valores son los bonus de la especificación §4.3, reusados
> como el aporte total de cada método. Deberían venir de una API, pero no existe
> endpoint de métodos de pago en `delivery.ivoofix.com` — probados
> `/api/{admin,public}/payment-methods`, `/payments` y `/gems`: todos 404.

### Ventana de retención

| | |
| --- | --- |
| Plazo de negocio | 4 horas desde el registro |
| `validateAfter` | `registeredAt + retentionHours`, calculado al registrar |
| Valor ≤ 0 o inválido | Cae al default de 4 h *a propósito*: nunca valida al instante por un error de configuración |

### Fecha de registro inmutable

La sella el servidor y **no viaja en el payload** — mandarla desde la caja la
haría falsificable con el devtools abierto. `updateSale` la reimpone en cada
cambio de estado, así que ninguna transición posterior puede tocarla.

### Cuatro barreras contra una doble retención

| # | Barrera | Detiene |
| --- | --- | --- |
| 1 | `disabled={submitting}` en el botón | El clic obvio |
| 2 | `inFlight` (ref síncrono) | El doble clic rápido que se cuela antes de que React aplique el estado |
| 3 | Clave de idempotencia, creada una vez al confirmar | Dos peticiones que sí salieron, y el reintento tras un fallo de red |
| 4 | Misma factura + misma tienda → `409` (servidor) | Un segundo registro con otra clave |

La 3 es la importante: si el envío falla, la app se queda en la confirmación y
el cajero reintenta con la **misma** clave, así que el servidor devuelve la venta
original en vez de crear otra.

### Una factura por tienda

Registrar la misma factura dos veces en la misma tienda responde `409`. Las
anuladas no cuentan: una factura anulada se puede volver a registrar.

---

## 7. Validación de campos

Los campos numéricos se filtran **al teclear**, no al enviar: en caja, con el
cliente esperando, es mejor que la letra no entre a que el cajero descubra el
problema al confirmar. El filtrado vive en el hook, no en el `onChange` de la
pantalla, para cubrir también lo que llegue del escáner.

| Campo | Normalización | Largo | Ejemplo |
| --- | --- | --- | --- |
| Número de factura | Solo dígitos | 1–12 | `F-004512` → `004512` |
| Documento del cliente | Solo dígitos, sin prefijo | 6–11 | `V-12.345.678` → `12345678` |
| Teléfono del cliente | Solo dígitos | 10–12 | `0412-123.45.67` → `04121234567` |
| PIN de caja | Solo dígitos | 4–6 | `a1b2c3d4` → `1234` |
| Nombre del cliente | Texto libre | ≥ 3 | Wilianny Díaz |
| Método de pago | Exactamente uno | 1 | Efectivo |

### Por qué el documento no lleva prefijo

Es la forma en que Magento toma la cédula (`casheaPayment.js`:
`replace(/\D/g,'')`, 6–11 dígitos). El padrón de miembros vive en Magento, así
que el cajero tiene que buscar con la misma clave: si aquí se enviara
`V-12345678` y allá está guardado `12345678`, la resolución del miembro fallaría
siempre.

> **Consecuencia.** Sin prefijo no se distingue cédula de RIF ni de extranjero.
> Magento tampoco lo distingue hoy. Si el negocio necesita facturar a empresas
> (`J-`), hay que decidirlo primero en Magento y replicarlo aquí, no al revés.

### Escáner de QR

El QR resuelve la cédula. `parseScannedDocument` acepta texto plano, `IVOO+:`
como prefijo, JSON (`{"documentId":"…"}`) o URL con `?document=`; cualquier
prefijo se descarta al normalizar.

`getUserMedia` exige origen seguro: funciona en `localhost` y en HTTPS, no en
`http://` con IP de red local. Si la caja usa un lector 2D físico (que emula
teclado), el escáner no hace falta: el lector escribe directo en el campo.

---

## 8. Modelo de datos

### SaleRecord

```ts
interface SaleRecord {
    id: string;
    registeredAt: string;      // INMUTABLE, sellada por el servidor
    validateAfter: string;     // registeredAt + retentionHours
    storeId: number;
    storeCode: string;         // cod_t con el que se validará
    storeName: string;
    invoiceNumber: string;
    documentId: string;
    customerName: string;
    customerPhone: string;
    paymentMethods: PaymentMethodCode[];
    gems: number;              // suma de los métodos
    status: SaleStatus;
    cashierUsername: string;
    documentSource: 'QR' | 'MANUAL';
    memberName?: string;
    validation: InvoiceValidation | null;
}
```

### InvoiceValidation

```ts
interface InvoiceValidation {
    attemptedAt: string;
    found: boolean;
    product?: string;   // lo que devolvió el API, para auditar
    quantity?: string;
    error?: string;     // solo si la consulta falló (red/500)
}
```

`found: false` sin `error` significa «el sistema dijo que no existe».
`found: false` *con* `error` significa «no se pudo consultar» y no rechaza la
venta.

### Store

```ts
interface Store {
    id: number;        // del API de tiendas
    name: string;
    city: string;
    state: string;
    magentoId: string;
    code: string;      // cod_t derivado: String(id).padStart(2, '0')
}
```

---

## 9. Pantallas

| Pantalla | Archivo | Qué hace |
| --- | --- | --- |
| Identificación | `LoginScreen.tsx` | Usuario y PIN. El rol decide el destino; 3 fallos bloquean |
| Registrar venta | `RegisterSaleScreen.tsx` | Factura, documento, nombre, teléfono, métodos de pago |
| Confirmar | `ConfirmSaleScreen.tsx` | Desglose de gemas y aviso de retención |
| Resultado | `SaleResultScreen.tsx` | Gemas retenidas y cuándo se resuelven |
| Actividad del turno | `ShiftActivityScreen.tsx` | Lo registrado por ese cajero y el estado de cada venta |
| Panel de admin | `AdminDashboardScreen.tsx` | Cifras, ventas, anulación e historial |

### Detalles de interacción

- Al salir del campo de documento se resuelve el miembro y, si existe, **se
  precarga su nombre** — el cajero no vuelve a teclearlo.
- El botón de entrar queda **habilitado con PIN corto**: si estuviera
  deshabilitado, el cajero haría clic, no pasaría nada, y no sabría por qué. El
  clic dispara el aviso.
- La confirmación dice explícitamente que las gemas quedan *retenidas*, no
  acreditadas: es la diferencia que el cajero tiene que poder explicarle al
  cliente en el mostrador.

---

## 10. Panel de administración

Acceso con súper usuario. Al entrar muestra directamente el dashboard, sin pasar
por selección de tienda.

**Cifras**

- **Gemas retenidas** — comprometidas, todavía sin resolver
- **Gemas liberadas** — acreditadas tras validar la factura
- **Gemas rechazadas** — facturas que no existían
- **Gemas anuladas** — retiradas a mano
- **Por validar** — ventas cuya ventana ya venció y siguen retenidas

**Acciones**

| Acción | Detalle |
| --- | --- |
| Filtrar | Por estado: todas, retenidas, liberadas, rechazadas, anuladas |
| Anular | Solo ventas retenidas. Exige motivo de 4+ caracteres. Anular una ya liberada responde `409` |
| Validar ahora | Fuerza la corrida sin esperar al siguiente tick |

La tabla de ventas muestra fecha de registro, factura, tienda con su código,
cliente con documento, teléfono, cajero que la registró, gemas, estado y el
resultado de la validación (el producto que devolvió el API, o el tiempo
restante si sigue retenida).

---

## 11. Historial

Log **append-only**. Cada acción queda registrada y **nada se borra**: anular no
elimina la venta, la marca.

| Acción | Actor | Cuándo |
| --- | --- | --- |
| `LOGIN` | Usuario | Al abrir sesión; para un cajero, con su caja y tienda |
| `LOGIN_BLOCKED` | Usuario | Al 3er intento fallido, con el plazo del bloqueo |
| `SALE_REGISTERED` | Cajero | Al registrar; incluye factura, tienda y gemas |
| `VALIDATION_RUN` | `sistema` | Cada consulta al validador, con su resultado |
| `GEMS_RELEASED` | `sistema` | Al liberar gemas |
| `SALE_REJECTED` | `sistema` | Al rechazar por factura inexistente |
| `SALE_CANCELLED` | Administrador | Al anular; incluye el motivo |

Cada entrada guarda fecha, acción, actor, detalle legible y —cuando aplica—
identificador de venta, número de factura, código de tienda y gemas.

---

## 12. Configuración

| Variable | Default | Efecto |
| --- | --- | --- |
| `VITE_IVOO_API_URL` | vacía | Sin ella, el ledger corre local. **Sin aviso visual**: la barra de modo demo se quitó |
| `VITE_RETENTION_HOURS` | `4` | Acorta la ventana para QA. Acepta decimales |

### Comandos

```bash
npm install
npm run dev        # http://localhost:5183/
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + build a dist/
npm run preview    # sirve dist/ ya compilado
```

### Datos de prueba

| Credencial / dato | Qué es |
| --- | --- |
| `admin` / `9999` | Súper usuario: entra al panel de administración |
| `jmarin` / `1234` | Cajero · NAGUANAGUA (`02`) · CAJA-01 |
| `wdiaz` / `1234` | Cajero · NAGUANAGUA (`02`) · CAJA-02 |
| `cbermudez` / `5678` | Cajero · PLAZA VENEZUELA (`03`) · CAJA-01 |
| `arivas` / `5678` | Cajero · BARQUISIMETO (`06`) · CAJA-03 |
| cualquier otro | **No entra** — el directorio es autoritativo |
| `001018442` en tienda `02` | Factura que **sí existe** (NAGUANAGUA) |
| `999999999` | Factura que **no existe** |
| `12345678` | Miembro de prueba: Wilianny Díaz |

> **Para probar la retención sin esperar 4 horas:**
> `VITE_RETENTION_HOURS=0.0000001` en `.env.local` vence la ventana al instante.
> **No definir en producción.**

---

## 13. Contrato IVOO+ propuesto

> **Ninguna de estas rutas existe.** Y no están planificadas. La documentación
> deja el panel de cajero explícitamente fuera de alcance (*Contexto Maestro* §2,
> *Plan-Cierre-API*, *Plan-Desarrollo-Backend*), y *HOW-TO-USE (BACKEND)* marca
> el rol `CAJERO` como «No implementado».

| Método | Ruta | Uso |
| --- | --- | --- |
| POST | `/v1/cashier/session` | Abrir turno (usuario + PIN) |
| GET | `/v1/cashier/rules` | Gemas por método y horas de retención |
| GET | `/v1/cashier/members/lookup` | Resolver documento → miembro |
| POST | `/v1/cashier/sales` | Registrar venta (`Idempotency-Key`) |
| GET | `/v1/cashier/shifts/current` | Actividad del turno |
| POST | `/v1/cashier/validations/run` | Forzar corrida de validación |
| GET | `/v1/cashier/admin/dashboard` | Cifras y ventas del panel |
| POST | `/v1/cashier/sales/:id/cancel` | Anular una venta retenida |
| GET | `/v1/cashier/admin/audit` | Historial completo |

### Dos problemas de autenticación por resolver

1. `registerSale` acredita en el ledger. *Arquitectura-Ingesta-Compras* §6.2
   define la ingesta como server-to-server con credencial de servicio, y es
   explícita en que no debe ser alcanzable con un JWT de usuario final. El token
   de caja es **un tercer actor** que ese documento no contempla.
2. *Actualizaciones/2026-09-02* dice que hoy solo existen JWT de `END_USER` y de
   `GESTION`. No hay autenticación server-to-server de ningún tipo.

### Conflicto de tasa de gemas

El motor de reglas de la API (`Modulo-Rules`) usa `purchaseStep: 100` /
`gemsPerStep: 100`, es decir `floor(monto/100)*100`. Este portal ya no usa monto,
así que ese motor no aplica tal cual. *Contexto Maestro* §8 sigue listando «Tasa
exacta de gemas por dólar» como pendiente. **Hay que decidir qué regla rige la
acumulación en tienda física antes de integrar.**

---

## 14. Estructura de archivos

```
src/
├── api/
│   ├── cashier-api.interface.ts   contrato (DIP)
│   ├── types.ts                   DTOs
│   ├── index.ts                   factory mock ↔ HTTP
│   ├── mock-cashier-api.ts        ledger local + tarea + auditoría
│   ├── http-cashier-api.ts        cliente de la API de IVOO+
│   ├── mock-data.ts               reglas, usuarios, miembros
│   ├── stores-api.ts              ← API REAL de tiendas
│   └── invoice-validation.ts      ← API REAL de facturas
├── domain/                        lógica pura, sin red ni React
│   ├── document.ts   invoice.ts   phone.ts   pin.ts
│   ├── gems.ts       retention.ts idempotency.ts format.ts
├── hooks/                         "controllers"
│   ├── useCashierSession.ts       useStores.ts
│   ├── useSaleForm.ts             useSaleSubmission.ts
│   ├── useShiftActivity.ts        useGemRules.ts
│   ├── useValidationScheduler.ts  useAdminDashboard.ts
├── screens/                       7 pantallas
├── components/                    Shell, QrScanner, StatusBadge…
└── styles/                        theme.css (tokens) + app.css
```

Los cuatro módulos de `domain/` que normalizan campos (`document`, `invoice`,
`phone`, `pin`) siguen el mismo patrón: una función `normalize*` que filtra al
teclear y una `isValid*` que valida largo.

---

## 15. Verificación

El ciclo completo se probó contra las APIs reales, no contra dobles de prueba.
**31 aserciones, todas en verde.**

| Caso | Resultado |
| --- | --- |
| Factura `001018442` en tienda `02` | `RELEASED` · producto «UPS NW-08UP 800VA/480W NUWE» |
| Factura `999999999` | `REJECTED` |
| Factura real en tienda equivocada | 404 → no se libera |
| Misma clave de idempotencia | Devuelve la misma venta, no duplica |
| Factura repetida en la tienda | `409` |
| Anular una venta ya liberada | `409` |
| `registeredAt` tras validar | Intacto |
| Historial tras el ciclo completo | 9 entradas con las 6 acciones |
| Gemas: efectivo + Zelle | 20 (10 + 10) |

En el navegador se confirmó el flujo login → selección de tienda con las 41
tiendas reales y el buscador filtrando, y por separado el filtrado de campos:
`F-004512` → `004512`, `V-12.345.678` → `12345678`, `a1b2c3d4e5f6g7` → `123456`.

`npm run build` (typecheck + build) pasa sin errores.

---

## 16. Pendientes

> **Bloqueante para producción.** La tarea programada corre en el navegador.
> Revisa al montar y cada minuto, así que una venta se valida la primera vez que
> alguien abre el portal después de vencida su ventana, no exactamente a las 4 h.
> Si nadie lo abre en todo el fin de semana, nadie valida. Es lo máximo posible
> sin backend: **tiene que ser un cron del servidor** llamando a la misma lógica
> (`runDueValidations`).

### Decisiones de negocio abiertas

- **Tasa de gemas en tienda física** — sin definir; conflicto con el motor de
  reglas de la API (§13)
- **Métodos de pago por API** — no existe el endpoint; hoy están en `mock-data.ts`
- **Directorio de cajeros** — vive en `mock-data.ts` con las asignaciones de
  tienda y caja; el backend no tiene dónde ponerlo todavía
- **Política de bloqueo** — 3 intentos y 5 minutos son razonables, no confirmados
- **Prefijo del documento** — sin prefijo no hay RIF; decidir primero en Magento

### Números que son guardas, no reglas

Estos topes se eligieron para que la app no acepte basura, pero **ninguno está
confirmado** con la operación. Si el valor real es mayor, el campo lo corta y el
flujo falla en silencio:

- PIN de 4 a 6 dígitos
- Correlativo de factura hasta 12 dígitos
- Teléfono de 10 a 12 dígitos

### Fuera de alcance del prototipo

- **Devoluciones y anulaciones de factura** — sin ERP nadie dispara el reverso
- **Límites de emisión** — falta tope por turno y aprobación de supervisor
- **Identificación por QR** — *Modulo-Identity-QR* dice que el QR es un token de
  un solo uso con TTL de ~5 min, no la cédula; y no existe endpoint para validarlo

---

*Documento generado a partir del código en `C:\nuevoProyecto\ivoo-cajero`. Los
contratos de las APIs externas se verificaron contra producción el 2 de
septiembre de 2026.*

---

## 17. Paleta

Verde, negro y blanco. Sin amarillo ni rojo.

| Token | Valor | Uso |
| --- | --- | --- |
| `--green` | `#32dd73` | Acento, estado liberado, foco de teclado |
| `--green-dark` | `#16a34a` | Verde sobre fondo claro cuando hace falta contraste |
| `--black` / `--ink` | `#000000` / `#0a0a0a` | Barra superior, botón primario, estado rechazado |
| `--white` | `#ffffff` | Fondo de tarjetas y campos |
| `--card` / `--card-soft` | `#ececec` / `#f5f5f5` | Superficies inertes |
| `--muted` / `--line` | `#8b8b8b` / `#e6e6e6` | Texto secundario y bordes |

**La severidad no se codifica con color, se codifica con relleno.** Con una sola
familia cromática, invertir el relleno es lo que hace legible un estado de un
vistazo:

| Estado | Tratamiento |
| --- | --- |
| Liberada | Relleno verde, texto negro |
| Retenida | Blanco con contorno negro — pendiente, sin resolver |
| Rechazada | Relleno negro, texto blanco — terminal, el más fuerte |
| Anulada | Gris, texto atenuado — inerte |

Los mensajes de error usan fondo negro con texto blanco en vez de rojo. Es un
tratamiento fuerte y legible, pero **pierde la señal cromática universal de
error**: si en pruebas de caja resulta que los cajeros no distinguen un error de
un aviso normal, hay que reintroducir un tono de alerta.

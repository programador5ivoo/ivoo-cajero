# IVOO+ · Portal del cajero

> **CONGELADO (2026-09-03).** Este prototipo fue portado a
> `IVOO-PLUS-FRONTEND/src/routes/caja/` (fusionado dentro del Panel de Gestión,
> con backend real en `IVOO-PLUS-BACKEND/src/modules/cashier-sales/`) — el
> desarrollo activo continúa allá. Esta carpeta se conserva como referencia:
> los tres documentos (`README.md`, `ENTREGA.md`, `DOCUMENTACION.md`) siguen
> siendo la fuente más rápida para entender el *por qué* de cada decisión de
> diseño (paleta, retención, validación de factura, trampas) si algo no cuadra
> durante el mantenimiento del port. No se desarrolla más código aquí.

Registro de ventas en tienda y **retención** de gemas. Las gemas no se acreditan
al registrar: quedan retenidas y se liberan 4 horas después, cuando el sistema
confirma que la factura existe de verdad.

React 18 + TypeScript + Vite. Sin dependencias de UI: solo `jsqr`.

> **¿Recibes este proyecto por primera vez? Empieza por [ENTREGA.md](ENTREGA.md).**
> Explica cómo levantarlo, cómo está organizado el código, cómo hacer los
> cambios más comunes y qué falta implementar.

| Documento | Para qué |
| --- | --- |
| `README.md` | Referencia rápida (estás aquí) |
| [`ENTREGA.md`](ENTREGA.md) | Guía de trabajo: setup, mapa del código, recetas, pendientes, trampas |
| [`DOCUMENTACION.md`](DOCUMENTACION.md) | Especificación técnica: contratos, reglas de negocio, modelo de datos |

```bash
npm install
npm run dev        # http://localhost:5183/
npm run typecheck
npm run build
```

## Flujo

```
login (usuario + PIN)      ← 3 fallos = bloqueo de 5 min
   ├── rol ADMIN   → panel de administración
   └── rol CAJERO  → registrar venta → confirmar → resultado
                     (tienda y caja vienen del usuario)
                                                            │
                                        4 h después ─────────┘
                                   tarea programada valida la factura
                                        ├── existe    → gemas LIBERADAS
                                        └── no existe → gemas RECHAZADAS
```

| Pantalla | Archivo |
| --- | --- |
| Identificación | `src/screens/LoginScreen.tsx` |
| Registrar venta | `src/screens/RegisterSaleScreen.tsx` |
| Confirmar | `src/screens/ConfirmSaleScreen.tsx` |
| Resultado | `src/screens/SaleResultScreen.tsx` |
| Actividad del turno | `src/screens/ShiftActivityScreen.tsx` |
| Panel de administración | `src/screens/AdminDashboardScreen.tsx` |

## APIs externas reales

Estas dos **no son mock** y funcionan en cualquier modo:

| Uso | Endpoint |
| --- | --- |
| Tiendas (41) | `GET https://delivery.ivoofix.com/api/admin/stores` |
| Validar factura | `GET https://delivery.ivoofix.com/api/public/validate-invoice?doc=&cod_t=` |

El `cod_t` **no viene** en el listado de tiendas: es el `id` con relleno a dos
dígitos (id 2 → `02`). Se deriva en `stores-api.ts`, nunca se teclea.

Contrato de la validación: `200` + `{name, qty}` = existe · `404` = no existe.
Con varios productos devuelve igual un objeto, con los nombres concatenados y
`qty: "Varios"`. La factura está **atada a la tienda**: la misma `doc` con otro
`cod_t` responde 404, por eso cada venta guarda el `storeCode` con el que se
registró.

## Retención de gemas

Al registrar, la venta nace `RETAINED`. Pasadas las horas de retención, la tarea
consulta la factura y la venta pasa a `RELEASED` o `REJECTED`. Un error de red
**no** rechaza: se reintenta en la siguiente corrida.

`VITE_RETENTION_HOURS` acorta la ventana para QA (acepta decimales; `0.0000001`
vence al instante). Un valor ≤ 0 o inválido cae al default de 4 h a propósito.
**No definir en producción.**

## Modo demo

Sin `VITE_IVOO_API_URL` el ledger corre local, persistido en `localStorage` (las
ventas tienen que sobrevivir a un refresh o la retención no se puede probar). La
sesión sigue siendo solo de memoria: una caja es un equipo compartido.

**Ya no hay aviso visual de modo demo.** Se quitó la barra amarilla, así que la
pantalla no distingue si el ledger es local o real: hay que mirar el `.env`.

### Usuarios

| Usuario | PIN | Rol | Tienda | Caja |
| --- | --- | --- | --- | --- |
| `admin` | `9999` | Administrador | — | — |
| `jmarin` | `1234` | Cajero | NAGUANAGUA (`02`) | CAJA-01 |
| `wdiaz` | `1234` | Cajero | NAGUANAGUA (`02`) | CAJA-02 |
| `cbermudez` | `5678` | Cajero | PLAZA VENEZUELA (`03`) | CAJA-01 |
| `arivas` | `5678` | Cajero | BARQUISIMETO (`06`) | CAJA-03 |

Un usuario que no esté en esta tabla **no entra**. Cada cajero está atado a su
tienda y su caja: no hay pantalla de selección, así que no puede registrar
ventas en una tienda ajena.

- **Miembros:** `12345678`, `9876543`, `15443220`, `11220998`
- **Factura que existe:** `001018442` en la tienda `02` (NAGUANAGUA)
- **Factura que no existe:** `999999999`

## Panel de administración

Súper usuario (`admin`). Muestra gemas retenidas, liberadas, rechazadas y
anuladas; permite anular una venta retenida y forzar la corrida de validación.
Pestaña de **historial**: cada acción queda registrada (registro, validación,
liberación, rechazo, anulación, login) y **nada se borra** — anular no elimina la
venta, la marca.

## Decisiones de diseño

**No hay monto elegible.** Se quitó: `validate-invoice` solo dice si la factura
existe, no cuánto costó, así que no había forma de verificar un importe tecleado.
Las gemas son la **suma de los métodos de pago** marcados.

**La fecha de registro es inmutable.** La sella el servidor y no viaja en el
payload — mandarla desde la caja la haría falsificable con el devtools abierto.
`updateSale` la reimpone en cada cambio de estado.

**Campos numéricos filtrados al teclear.** Factura, documento, teléfono y PIN
descartan lo que no sea dígito mientras se escribe, en vez de avisar al enviar.

**Idempotencia real.** La clave se genera una vez al pasar a confirmar y se
reutiliza en cada reintento (`src/domain/idempotency.ts`).

**Una factura por tienda.** Registrarla dos veces en la misma tienda responde
409.

**El usuario ES la tienda.** Antes cualquiera con un PIN de 4 dígitos entraba y
elegía tienda de una lista. Ahora la tienda y la caja vienen del directorio y
llegan resueltas en la sesión.

**Bloqueo por intentos fallidos.** A los 3 fallos el usuario queda bloqueado 5
minutos y se registra en el historial. El bloqueo se comprueba **antes** que el
PIN —si no, se podría seguir probando y distinguir "bloqueado" de "PIN
incorrecto" por el mensaje— es **por usuario**, no por navegador, y **persiste a
un refresh**: si viviera en memoria, recargar sería la forma trivial de
saltárselo.

## Lo que falta

- **La tarea programada corre en el NAVEGADOR** (`useValidationScheduler`):
  revisa al montar y cada minuto, así que una venta se valida la primera vez que
  alguien abre el portal después de vencida su ventana, no exactamente a las 4 h.
  Si nadie lo abre, nadie valida. **Esto tiene que ser un cron del servidor.**
- **Los métodos de pago no salen de una API.** No existe endpoint en
  `delivery.ivoofix.com` (probados `/api/{admin,public}/payment-methods`,
  `/payments`, `/gems`: 404). Están en `mock-data.ts` con los valores de la
  spec §4.3.
- **El directorio de cajeros vive en el front** (`mock-data.ts`), con las
  asignaciones de tienda y caja. El rol `CAJERO` sigue sin implementar en el
  backend, así que no hay dónde ponerlo todavía.
- **3 intentos y 5 minutos** son valores razonables, no una política confirmada
  con seguridad.
- **El largo del PIN (4–6) y del correlativo de factura (12) son guardas**, no
  reglas confirmadas.
- **Sin endpoints de IVOO+.** Los de `http-cashier-api.ts` son una propuesta: la
  documentación deja el panel de cajero fuera de alcance.

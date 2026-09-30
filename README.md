# OA-JRM · Order Approval

Automatización de la bandeja **#DC-MMex Order Approval**: leer las solicitudes de aprobación de órdenes, comparar los artículos de los correos sencillos contra el archivo **Material OH** y registrar el resultado en un Excel.

> **Alcance actual (V1):** solo análisis y registro. No se responden correos, no se ponen banderas ni categorías y no se modifica el buzón compartido; el flujo de Power Automate solo lee los correos.

Sin acceso a Oracle. El inventario se toma solo del archivo Material OH.

| | Qué es | Estado | Abrir |
|---|---|---|---|
| **V1 · Sin API** | PWA con interfaz tipo Outlook. Lee los correos que guarda Power Automate en OneDrive, compara los sencillos contra el Material OH y registra el resultado en `Resultados_OrderApproval.xlsx` | Funcional | [`v1/`](v1/) |
| **V2 · Graph API** | La misma interfaz conectada a Microsoft Graph: llegada en tiempo real, categorías y respuestas automáticas | Simulación | [`v2/`](v2/) |
| **Propuesta sin desarrollo** | Excel + Power Automate + Outlook, sin código | Instrucciones | [`docs/PROPUESTA_SIN_DESARROLLO.md`](docs/PROPUESTA_SIN_DESARROLLO.md) |
| **Guía de la V1** | Flujo OA-1 de Power Automate paso a paso, conexión de la página y el Excel de resultados | Instrucciones | [`docs/FLUJOS_POWER_AUTOMATE.md`](docs/FLUJOS_POWER_AUTOMATE.md) |

Sitio publicado: `https://juander161.github.io/OA-JRM/` (ver [Publicar](#publicar-en-github-pages)).

---

## V1 · Sin API

```
Buzón compartido ──► Flujo OA-1 ──► OneDrive/OrderApproval/Correos/*.json
                                              │
                                   Página V1 (PWA) ◄── Material OH (.xlsx / .csv)
                                              │  compara solo los correos sencillos
                                              ▼
              OneDrive/OrderApproval/Resultados/Resultados_OrderApproval.xlsx
```

- **Bandeja tipo Outlook (solo en la página):** cada correo muestra su resultado antes de abrirlo: **Aprobar**, **Shortage**, **Sin BO#**, **Complejo** (no se analiza, revisión manual) o **Sin validar** (falta Material OH). También indica si la orden es **Crítica** (RDD en 7 días o menos). Nada de esto se refleja en Outlook.
- **Al abrir un correo:** BO#, RDD, Event Date, cliente, tipo y la tabla artículo por artículo (pide, OH, diferencia y estado).
- **Material OH:** acepta `.xlsx` y `.csv`, **con o sin encabezado** (lo detecta solo o se elige manualmente), elige hoja y columnas, y suma varias filas del mismo artículo.
- **Búsquedas en el Material OH:** artículo exacto, contiene, descripción, lista de artículos y texto en toda la fila.
- **Registro en Excel:** cada correo sencillo se registra una sola vez en `OrderApproval/Resultados/Resultados_OrderApproval.xlsx`, con dos hojas: **Resumen** (un renglón por correo: BO#, RDD, cliente, resultado, crítica, Material OH usado) y **Detalle** (un renglón por artículo: pedido, OH, diferencia, estado). El Excel se genera en el navegador, sin librerías ni servidores.
- **Historial fijo:** el renglón guarda el Material OH usado al analizar; cargar otro OH después no cambia lo registrado. El botón **Volver a analizar** actualiza un correo con el OH actual.
- **PWA:** se instala como aplicación y abre sin conexión. El Material OH y el registro se guardan también en el navegador.
- **Privacidad:** los correos y el Material OH se procesan dentro del navegador. No se envían a ningún servidor.

Requisitos: Microsoft Edge o Google Chrome, OneDrive sincronizado y el flujo OA-1 ([instrucciones](docs/FLUJOS_POWER_AUTOMATE.md)).

Probar sin flujo: **V1 → Conexión → Cargar ejemplos** (los ejemplos no se registran en el Excel), o **Abrir archivos** → los `.json` de `ejemplos/OrderApproval/Correos`.

## V2 · Graph API (simulación)

Referencia de un escenario futuro, **fuera del alcance actual**. Muestra cómo funcionaría con Microsoft Graph: suscripción a la bandeja, clasificación con categorías de color al llegar cada correo, respuestas automáticas por regla y envío programado. En **Registro API** se ven las llamadas que se harían (`GET`, `PATCH`, `POST`). Los correos son ficticios y no se envía nada.


## Propuesta sin desarrollo

Para presentar una opción que no involucra desarrollo de software: [docs/PROPUESTA_SIN_DESARROLLO.md](docs/PROPUESTA_SIN_DESARROLLO.md)

- Libro `OrderApproval.xlsx`: Material OH, lectura de correos y comparación con fórmulas, hoja de búsquedas y plantillas.
- Flujo **OA-A**: registra cada correo, pone bandera (sin mover el correo) y envía un resumen con la tabla de comparación.
- Reglas de Outlook: categorías de color en los resúmenes.
- Flujo **OA-B** o plantillas de Outlook: respuestas rápidas y programadas.

---

## Estructura

```
index.html                  inicio (elige V1 o V2)
manifest.webmanifest        PWA
sw.js                       caché sin conexión
assets/
  app.css                   interfaz tipo Outlook
  core.js                   lectura de correos, Material OH, comparación, generación del Excel e interfaz
  v1.js                     conexión con la carpeta de OneDrive y escritura del Excel (sin API)
  v2.js                     simulación de Microsoft Graph
v1/  v2/                    páginas y manifiestos de cada versión
icons/                      íconos de la aplicación
ejemplos/
  correos.json              correos de prueba
  Material_OH_con_encabezado.csv
  Material_OH_sin_encabezado.csv
  OrderApproval/            carpeta de prueba con la estructura de OneDrive
docs/
  FLUJOS_POWER_AUTOMATE.md
  PROPUESTA_SIN_DESARROLLO.md
```

## Publicar en GitHub Pages

1. **Settings → Pages**.
2. **Source:** *Deploy from a branch* · **Branch:** `main` · carpeta `/ (root)` → **Save**.
3. En uno o dos minutos queda en `https://juander161.github.io/OA-JRM/`.

La página no necesita compilación ni servidor: son archivos estáticos.

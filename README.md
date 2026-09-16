# OA-JRM · Order Approval

Automatización de la bandeja **#DC-MMex Order Approval**: leer las solicitudes de aprobación de órdenes, comparar los artículos contra el archivo **Material OH** y dejar cada correo clasificado y listo para responder.

Sin acceso a Oracle. El inventario se toma solo del archivo Material OH.

| | Qué es | Estado | Abrir |
|---|---|---|---|
| **V1 · Sin API** | PWA con interfaz tipo Outlook. Lee los correos que guarda Power Automate en OneDrive, compara contra el Material OH, marca cada correo y crea respuestas y clasificaciones para Outlook | Funcional | [`v1/`](v1/) |
| **V2 · Graph API** | La misma interfaz conectada a Microsoft Graph: llegada en tiempo real, categorías y respuestas automáticas | Simulación | [`v2/`](v2/) |
| **Propuesta sin desarrollo** | Excel + Power Automate + Outlook, sin código | Instrucciones | [`docs/PROPUESTA_SIN_DESARROLLO.md`](docs/PROPUESTA_SIN_DESARROLLO.md) |
| **Flujos de la V1** | Flujos de Power Automate que conectan la V1 con Outlook | Instrucciones | [`docs/FLUJOS_POWER_AUTOMATE.md`](docs/FLUJOS_POWER_AUTOMATE.md) |

Sitio publicado: `https://juander161.github.io/OA-JRM/` (ver [Publicar](#publicar-en-github-pages)).

---

## V1 · Sin API

```
Buzón compartido ──► Flujo OA-1 ──► OneDrive/OrderApproval/Correos/*.json
                                              │
                                   Página V1 (PWA) ◄── Material OH (.xlsx / .csv)
                                              │
                           OneDrive/OrderApproval/Acciones/*.json
                                              │
Buzón compartido ◄── Flujo OA-2 (responder · programar · bandera · carpeta)
```

- **Bandeja tipo Outlook:** cada correo aparece marcado antes de abrirlo: palomita verde **Aprobar**, bandera roja **Shortage** o **Sin BO#**, bandera naranja **Revisión**, gris **Sin validar**. También indica si la orden es **Crítica** (RDD en 7 días o menos).
- **Al abrir un correo:** BO#, RDD, Event Date, cliente, tipo y la tabla artículo por artículo (pide, OH, diferencia y estado).
- **Material OH:** acepta `.xlsx` y `.csv`, **con o sin encabezado** (lo detecta solo o se elige manualmente), elige hoja y columnas, y suma varias filas del mismo artículo.
- **Búsquedas en el Material OH:** artículo exacto, contiene, descripción, lista de artículos y texto en toda la fila.
- **Respuestas rápidas:** plantillas editables con variables (`{BO}`, `{RDD}`, `{FALTANTES}`…). Se envían al momento o se **programan** para una fecha y hora.
- **Clasificar en Outlook:** pone la bandera y mueve el correo a `OA Aprobar`, `OA Shortage` u `OA Revision`, uno por uno o todos a la vez.
- **PWA:** se instala como aplicación y abre sin conexión. El Material OH, las plantillas y el historial se guardan en el navegador.
- **Privacidad:** los correos y el Material OH se procesan dentro del navegador. No se envían a ningún servidor.

Requisitos: Microsoft Edge o Google Chrome, OneDrive sincronizado y los flujos OA-1 y OA-2 ([instrucciones](docs/FLUJOS_POWER_AUTOMATE.md)).

Probar sin flujos: **V1 → Conexión → Cargar ejemplos**, o **Conectar carpeta** → `ejemplos/OrderApproval` de este repositorio descargado.

## V2 · Graph API (simulación)

Muestra cómo funcionaría con Microsoft Graph: suscripción a la bandeja, clasificación con categorías de color al llegar cada correo, respuestas automáticas por regla y envío programado. En **Registro API** se ven las llamadas que se harían (`GET`, `PATCH`, `POST`). Los correos son ficticios y no se envía nada.

¿Se puede hacer funcional sin Graph API? Sí, con tres flujos de Power Automate: [FLUJOS_POWER_AUTOMATE.md § 6](docs/FLUJOS_POWER_AUTOMATE.md#6-la-v2-puede-ser-funcional-sin-graph-api).

## Propuesta sin desarrollo

Para presentar una opción que no involucra desarrollo de software: [docs/PROPUESTA_SIN_DESARROLLO.md](docs/PROPUESTA_SIN_DESARROLLO.md)

- Libro `OrderApproval.xlsx`: Material OH, lectura de correos y comparación con fórmulas, hoja de búsquedas y plantillas.
- Flujo **OA-A**: registra cada correo, pone bandera, mueve de carpeta y envía un resumen con la tabla de comparación.
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
  core.js                   lectura de correos, Material OH, comparación, plantillas e interfaz
  v1.js                     conexión con la carpeta de OneDrive (sin API)
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

# Flujos de Power Automate · Versión 1 (sin API)

La V1 no usa Microsoft Graph API ni registro de aplicaciones en Azure. Toda la comunicación con Outlook la hacen flujos de **Power Automate** con los conectores estándar de **Office 365 Outlook** y **OneDrive para la Empresa**. La página y los flujos se comunican con archivos dentro de una carpeta de OneDrive.

```
OrderApproval/                      (OneDrive para la Empresa, sincronizada en la PC)
├── Correos/                        ← Flujo OA-1 guarda aquí cada correo (.json)
├── Acciones/                       ← la página deja aquí respuestas y clasificaciones
│   ├── Procesadas/                 ← Flujo OA-2 mueve aquí lo que ya ejecutó
│   └── Errores/                    ← Flujo OA-2 mueve aquí lo que falló
└── Material OH.xlsx                (opcional: el archivo que se carga en la página)
```

| Flujo | Qué hace | ¿Obligatorio? |
|---|---|---|
| **OA-1 Guardar correos** | Guarda cada correo nuevo del buzón como archivo `.json` en `Correos/` | Sí |
| **OA-2 Ejecutar acciones** | Lee los archivos de `Acciones/`: envía respuestas (inmediatas o programadas), pone banderas y mueve correos a carpetas en Outlook | Sí, para responder y clasificar desde la página |
| **OA-3 Clasificar al llegar** | Clasifica en Outlook sin abrir la página (compara contra el Material OH en Excel) | Solo para la V2 funcional (ver sección final) |

---

## 0. Preparación (una sola vez)

1. En **OneDrive para la Empresa** crea la carpeta `OrderApproval` y dentro `Correos` y `Acciones`; dentro de `Acciones` crea `Procesadas` y `Errores`.
2. Verifica que OneDrive esté **sincronizado** en la PC (ícono de nube azul junto al reloj). La carpeta debe aparecer en el Explorador de archivos, normalmente en `C:\Users\<usuario>\OneDrive - <Empresa>\OrderApproval`.
3. En el buzón compartido **#DC-MMex Order Approval** crea tres subcarpetas dentro de *Bandeja de entrada*: `OA Aprobar`, `OA Shortage`, `OA Revision`.
4. Anota la dirección de correo del buzón compartido (por ejemplo `dc-mmex-orderapproval@empresa.com`).

> Si los nombres de las acciones de Power Automate aparecen en inglés, se indican ambos: **Español** / *English*.

---

## 1. Flujo OA-1 · Guardar correos

**Tipo:** Flujo de nube automatizado.

### Desencadenador
**Cuando llega un nuevo correo electrónico a un buzón compartido (V2)** / *When a new email arrives in a shared mailbox (V2)*

| Campo | Valor |
|---|---|
| Dirección del buzón original | dirección del buzón compartido |
| Carpeta | `Inbox` / Bandeja de entrada |
| Importancia | Cualquiera |
| Solo con datos adjuntos | No |
| Incluir datos adjuntos | No |

> Si ya tienes un flujo que guarda los correos en una carpeta, puedes reutilizarlo: la página también lee `.eml`, `.html` y `.txt`. El formato `.json` de este paso es el recomendado porque incluye el **Id del mensaje**, necesario para poner banderas y mover correos.

### Acción 1 · Crear archivo
**Crear archivo** / *Create file* (OneDrive para la Empresa)

| Campo | Valor |
|---|---|
| Ruta de acceso de la carpeta | `/OrderApproval/Correos` |
| Nombre de archivo | Expresión: `concat(formatDateTime(triggerOutputs()?['body/receivedDateTime'],'yyyyMMdd-HHmmss'),'_',guid(),'.json')` |
| Contenido del archivo | Expresión: `triggerBody()` |

Guarda y prueba enviando un correo al buzón. En `OrderApproval/Correos` debe aparecer un archivo como `20260916-134200_3f2a….json` con este contenido (resumido):

```json
{
  "id": "AAMkAGI2…AAA=",
  "receivedDateTime": "2026-09-16T13:42:00+00:00",
  "hasAttachments": false,
  "subject": "PRDF: RDD 12-MAR-26, Event Date 12-MAY-26, CLIENTE, Rep REP, BO# 93938905",
  "from": "rep@cliente.com",
  "toRecipients": "dc-mmex-orderapproval@empresa.com",
  "body": "<html>…Item [1012010774] Qty [1] Description […]…</html>"
}
```

La página acepta además estas claves opcionales: `fromName` (nombre del remitente), `internetMessageId`, `conversationId`.

---

## 2. Flujo OA-2 · Ejecutar acciones

**Tipo:** Flujo de nube automatizado.

Cada botón de la página (**Enviar**, **Programar**, **Clasificar en Outlook**) crea un archivo `.json` en `Acciones/`. Este flujo lo ejecuta y lo mueve a `Procesadas/`. Si en la página se cancela una respuesta programada, el archivo se borra y el flujo no la envía.

### Desencadenador
**Cuando se crea un archivo (solo propiedades)** / *When a file is created (properties only)* (OneDrive para la Empresa)

| Campo | Valor |
|---|---|
| Carpeta | `/OrderApproval/Acciones` |
| Incluir subcarpetas | No |

### Acción 1 · Obtener contenido de archivo
**Obtener contenido de archivo** / *Get file content* → Archivo: *Identificador* (contenido dinámico del desencadenador).

Cambia el nombre de la acción a **`Contenido`** (menú `…` → *Cambiar nombre*).

### Acción 2 · Analizar JSON
**Analizar JSON** / *Parse JSON* → cambia el nombre a **`Accion`**.

- **Contenido:** *Contenido del archivo* (dinámico de `Contenido`).
  Si al probar aparece un error con `$content`, reemplázalo por la expresión `base64ToString(body('Contenido')?['$content'])`.
- **Esquema:**

```json
{
  "type": "object",
  "properties": {
    "tipo": {"type": "string"},
    "version": {"type": "integer"},
    "idAccion": {"type": "string"},
    "accion": {"type": "string"},
    "idCorreo": {"type": "string"},
    "internetMessageId": {"type": "string"},
    "conversationId": {"type": "string"},
    "buzon": {"type": "string"},
    "bo": {"type": "string"},
    "asuntoOriginal": {"type": "string"},
    "remitente": {"type": "string"},
    "resultado": {"type": "string"},
    "bandera": {"type": "string"},
    "carpetaDestino": {"type": "string"},
    "categoria": {"type": "string"},
    "para": {"type": "string"},
    "cc": {"type": "string"},
    "asunto": {"type": "string"},
    "cuerpoTexto": {"type": "string"},
    "cuerpoHtml": {"type": "string"},
    "enviarEn": {"type": "string"},
    "creado": {"type": "string"}
  },
  "required": ["accion", "idCorreo"]
}
```

### Acción 3 · Cambiar (Switch)
**Cambiar** / *Switch* → En: *accion* (dinámico de `Accion`).

#### Caso `responder`

1. **Retrasar hasta** / *Delay until* → Marca de tiempo: *enviarEn*.
   Si la fecha ya pasó, continúa de inmediato. Límite de Power Automate: 30 días.
2. **Obtener metadatos de archivo mediante la ruta de acceso** / *Get file metadata using path*
   Ruta: `/OrderApproval/Acciones/` + *Nombre de archivo con extensión* (dinámico del desencadenador).
   Si la respuesta se canceló en la página, el archivo ya no existe, esta acción falla y el correo **no** se envía.
3. **Enviar un correo electrónico desde un buzón compartido (V2)** / *Send an email from a shared mailbox (V2)*

   | Campo | Valor |
   |---|---|
   | Dirección del buzón original | dirección del buzón compartido (escríbela fija) |
   | Para | *para* |
   | Asunto | *asunto* |
   | Cuerpo | *cuerpoHtml* |
   | Importancia | Normal |

   > **Responder al correo electrónico (V3)** / *Reply to email (V3)* con *Id. de mensaje* = *idCorreo* mantiene la conversación agrupada, pero solo funciona si el buzón es el tuyo y no uno compartido. Para buzones compartidos usa la acción de la tabla.

#### Caso `clasificar`

1. **Marcar con marca de seguimiento el correo electrónico (V2)** / *Flag email (V2)*

   | Campo | Valor |
   |---|---|
   | Id. de mensaje | *idCorreo* |
   | Dirección del buzón original | dirección del buzón compartido |
   | Estado de la marca | *bandera* (valor personalizado; llega como `flagged`, `complete` o `notFlagged`) |

   En Outlook: `flagged` = bandera roja, `complete` = palomita verde.
2. **Cambiar** (dentro del caso) → En: *resultado*
   - Caso `verde` → **Mover correo electrónico (V2)** / *Move email (V2)*: Id. de mensaje *idCorreo*, carpeta `OA Aprobar` (elígela en el selector), buzón compartido.
   - Caso `rojo` → **Mover correo electrónico (V2)** → carpeta `OA Shortage`.
   - Caso `naranja` → **Mover correo electrónico (V2)** → carpeta `OA Revision`.

   > Primero la bandera y después mover: al mover un correo, Outlook le asigna otro Id.

### Acción 4 · Archivar la acción
Después del *Cambiar* (fuera de los casos):

**Mover o cambiar el nombre de un archivo** / *Move or rename a file* (OneDrive para la Empresa)

| Campo | Valor |
|---|---|
| Archivo | *Identificador* (dinámico del desencadenador) |
| Ruta de acceso del archivo de destino | `/OrderApproval/Acciones/Procesadas/` + *Nombre de archivo con extensión* |
| Sobrescribir | Sí |

### Acción 5 · Rama de error
1. Agrega una acción paralela junto a **Acción 4**: **Mover o cambiar el nombre de un archivo** con destino `/OrderApproval/Acciones/Errores/` + *Nombre de archivo con extensión*.
2. En esa acción: `…` → **Configurar ejecución posterior** / *Configure run after* → marca solo **ha fallado** y **ha agotado el tiempo de espera** del *Cambiar*.
3. En la **Acción 4** deja marcado solo **es correcto**.

Si una respuesta se canceló (paso 2 del caso `responder`), el archivo ya no existe: ambas ramas fallan sin enviar nada. Es el comportamiento esperado.

---

## 3. Conectar la página

1. Abre la **V1** en **Microsoft Edge** o **Google Chrome** (la conexión a carpetas no funciona en Firefox ni Safari).
2. **Conectar carpeta** → elige la carpeta sincronizada `OrderApproval` → **Permitir** lectura y escritura.
3. En **Conexión** escribe la dirección del buzón compartido.
4. En **Material OH** carga el archivo de inventario (`.xlsx` o `.csv`, con o sin encabezado).
5. La bandeja se actualiza cada minuto. Al volver a abrir la página, Edge/Chrome pide confirmar el permiso con **Permitir acceso**.

Sin la carpeta sincronizada también funciona con **Abrir archivos**: la página lee los `.json` descargados, y al responder descarga el archivo de la acción para guardarlo a mano en `OrderApproval/Acciones`.

### Instalar como aplicación (PWA)
En Edge o Chrome, con la página publicada: ícono **Instalar** en la barra de direcciones (o menú `…` → *Aplicaciones* → *Instalar este sitio como aplicación*).

---

## 4. Formato de los archivos de acción

Nombre: `AAAAMMDD-HHMM_<accion>_<BO>_<id>.json` (hora UTC de envío). Ejemplo de respuesta programada:

```json
{
  "tipo": "OA-ACCION",
  "version": 1,
  "idAccion": "mu4mhc5fy4sm0p",
  "accion": "responder",
  "idCorreo": "AAMkAGEjemplo0004AAA=",
  "bo": "93950012",
  "resultado": "rojo",
  "bandera": "flagged",
  "carpetaDestino": "OA Shortage",
  "categoria": "OA Rojo",
  "buzon": "dc-mmex-orderapproval@empresa.com",
  "para": "rep@sunbeltcap.example",
  "asunto": "RE: PRDF: RDD 21-SEP-26, … BO# 93950012",
  "cuerpoTexto": "Hello, …",
  "cuerpoHtml": "<div …><p>Hello,</p>…</div>",
  "enviarEn": "2026-09-16T23:38:00.000Z",
  "creado": "2026-09-16T21:38:25.347Z"
}
```

| Campo | Valores |
|---|---|
| `accion` | `responder` · `clasificar` |
| `resultado` | `verde` (Aprobar) · `rojo` (Shortage o sin BO#) · `naranja` (Revisión) · `gris` (sin Material OH) |
| `bandera` | `complete` · `flagged` · `notFlagged` |
| `carpetaDestino` | `OA Aprobar` · `OA Shortage` · `OA Revision` |
| `enviarEn` | fecha y hora UTC en formato ISO 8601 |

---

## 5. Prueba completa

1. Envía al buzón un correo con asunto `PRDF: RDD 30-SEP-26, Event Date N/A, PRUEBA SA, Rep PRUEBA SA, BO# 12345678` y en el cuerpo `Item [1012010774] Qty [1] Description [PRUEBA]`.
2. Espera a que OA-1 cree el `.json` en `Correos/` y a que OneDrive lo sincronice.
3. En la página: **Actualizar** → el correo aparece con bandera según el Material OH.
4. Ábrelo → **Programar respuesta** para dentro de 5 minutos → **Programar**.
5. En `Acciones/` aparece el archivo; OA-2 queda esperando en *Retrasar hasta*.
6. A la hora indicada llega la respuesta y el archivo pasa a `Procesadas/`. En la página la respuesta aparece como **Enviada**.
7. Repite con **Clasificar en Outlook** y verifica la bandera y la carpeta en el buzón.

La carpeta `ejemplos/OrderApproval` de este repositorio tiene 8 correos de prueba en el mismo formato que genera OA-1.

---

## 6. ¿La V2 puede ser funcional sin Graph API?

**Sí**, con flujos de Power Automate. Las acciones de la V2 simulada (responder, programar respuestas, poner banderas y mover a carpetas) existen en los conectores estándar de Outlook, que no requieren registrar una aplicación en Azure ni permisos de Graph. Para lograrlo se necesitan **tres flujos**:

| Flujo | Qué aporta | Instrucciones |
|---|---|---|
| OA-1 Guardar correos | Los correos llegan a la bandeja de la página | Sección 1 |
| OA-2 Ejecutar acciones | Responder, programar, bandera y carpeta en Outlook | Sección 2 |
| OA-3 Clasificar al llegar | Bandera, carpeta y resumen con la comparación **sin abrir la página** | Flujo **OA-A** de [PROPUESTA_SIN_DESARROLLO.md](PROPUESTA_SIN_DESARROLLO.md) |

OA-3 hace la comparación contra el Material OH con fórmulas de Excel, sin código. Con OA-1 + OA-2 + OA-3 se obtiene todo lo de la V2 excepto:

| Función de la V2 simulada | Sin Graph API |
|---|---|
| Categorías de color de Outlook | El conector estándar no tiene acción para categorías. Alternativas: carpetas + banderas (OA-2), o una **regla de Outlook** que asigne la categoría según el asunto del correo resumen de OA-A. |
| Llegada en tiempo real (webhook) | El desencadenador de Outlook revisa el buzón cada pocos minutos. |
| Responder dentro del mismo hilo en buzón compartido | Se envía como correo nuevo con `RE:` en el asunto desde el buzón compartido. |

> Existe la acción **Enviar una solicitud HTTP** del conector Office 365 Outlook, que permite asignar categorías de color, pero internamente llama a Microsoft Graph. Úsala solo si TI lo autoriza.

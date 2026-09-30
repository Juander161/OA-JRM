# Flujo de Power Automate y registro en Excel · Guía paso a paso (Versión 1, sin API)

Esta guía explica, desde cero, cómo dejar funcionando la página **Order Approval (V1)** con el buzón **#DC-MMex Order Approval**. Está escrita para que cualquier compañero pueda replicarlo en su computadora **aunque nunca haya usado Power Automate**.

Tiempo estimado: **20 a 30 minutos** la primera vez.

> ### Alcance actual
> El sistema **solo analiza**: compara los correos **sencillos** contra el **Material OH** y **registra el resultado en un Excel**.
>
> | Sí hace | No hace |
> |---|---|
> | Lee los correos que llegan al buzón (copia guardada por el flujo OA-1). | No responde correos ni programa respuestas. |
> | Compara cada artículo de los correos sencillos contra el Material OH. | No pone banderas, categorías ni colores en Outlook. |
> | Registra el resultado en `Resultados_OrderApproval.xlsx`. | No mueve correos ni crea carpetas en el buzón compartido. |
> | Muestra los correos complejos para que se revisen a mano. | No analiza correos complejos (hilos RE:/FW:, texto libre, adjuntos). |
>
> El buzón compartido **no se modifica de ninguna forma**: el flujo solo **lee** los correos.

## Índice

1. [¿Cómo funciona todo junto?](#1-cómo-funciona-todo-junto)
2. [Vocabulario básico (léelo primero)](#2-vocabulario-básico-léelo-primero)
3. [Requisitos antes de empezar](#3-requisitos-antes-de-empezar)
4. [Preparación: carpetas en OneDrive](#4-preparación-carpetas-en-onedrive)
5. [Cómo moverse dentro de Power Automate](#5-cómo-moverse-dentro-de-power-automate)
6. [Flujo OA-1 · Guardar correos](#6-flujo-oa-1--guardar-correos)
7. [Conectar la página](#7-conectar-la-página)
8. [El Excel de resultados](#8-el-excel-de-resultados)
9. [Prueba completa](#9-prueba-completa)
10. [Problemas comunes y soluciones](#10-problemas-comunes-y-soluciones)
11. [Si varios compañeros lo usan](#11-si-varios-compañeros-lo-usan)
12. [Referencia técnica: formato de los archivos](#12-referencia-técnica-formato-de-los-archivos)
13. [Si ya tenías la versión anterior (OA-2, banderas, respuestas)](#13-si-ya-tenías-la-versión-anterior-oa-2-banderas-respuestas)
14. [Lista de verificación final](#14-lista-de-verificación-final)

---

## 1. ¿Cómo funciona todo junto?

```
  ┌──────────────────────────┐
  │ Buzón #DC-MMex           │
  │ Order Approval (Outlook) │   El buzón solo se LEE. No se modifica nada.
  └──────────┬───────────────┘
             │ 1. Llega un correo
             ▼
  ┌──────────────────────────┐   2. OA-1 guarda una copia del correo
  │ Flujo OA-1 (Power        │ ───► OneDrive / OrderApproval / Correos / *.json
  │ Automate, en la nube)    │                     │
  └──────────────────────────┘                     │ 3. La página lee las copias
                                                   ▼
                                      ┌──────────────────────────┐
             Material OH (.xlsx/.csv) │ Página V1 (Edge/Chrome)  │
             ────────────────────────►│ · detecta si es sencillo │
                                      │ · compara artículo por   │
                                      │   artículo contra el OH  │
                                      └──────────┬───────────────┘
                                                 │ 4. Registra el resultado
                                                 ▼
                         OneDrive / OrderApproval / Resultados / Resultados_OrderApproval.xlsx
```

| Pieza | Qué hace, en palabras simples | ¿Quién la crea? |
|---|---|---|
| **Flujo OA-1 Guardar correos** | Cada vez que llega un correo al buzón, guarda una copia como archivo en tu OneDrive para que la página la pueda leer. | Tú, una sola vez (sección 6). |
| **Página V1** | Lee las copias, separa los correos sencillos de los complejos, compara los sencillos contra el Material OH y escribe el Excel. | Ya existe. Solo se abre en el navegador. |
| **Material OH** | El reporte de inventario (On-Hand) exportado en Excel o CSV. | Lo cargas en la página cada día. |
| **Resultados_OrderApproval.xlsx** | El registro con el resultado de cada correo analizado. | La página lo crea y lo actualiza sola. |

> **¿Por qué archivos y no una conexión directa a Outlook?** Una conexión directa requiere Microsoft Graph API y permisos especiales de TI. Con una copia en OneDrive basta el conector normal de Power Automate que ya viene con Microsoft 365.

### ¿Qué es un correo "sencillo"?

| Tipo | Cómo se reconoce | ¿Se analiza y registra? |
|---|---|---|
| **Sencillo** (Tipo 1) | Asunto `PRDF: RDD …, Event Date …, CLIENTE, Rep …, BO# 12345678` y en el cuerpo líneas `Item [#] Qty [#] Description […]`, sin texto libre. | **Sí** |
| **Complejo** (Tipo 2) | Asunto con `RE:`, `FW:`, `[Ext]` o `thread::`; trae adjuntos; o tiene preguntas o instrucciones en texto libre; o no tiene líneas `Item / Qty`. | **No.** Aparece en la página como *Complejo* para revisión manual. |

### Resultados posibles de un correo sencillo

| Resultado | Significado |
|---|---|
| **Aprobar** | Todos los artículos tienen existencia suficiente en el Material OH. |
| **Shortage** | Al menos un artículo no alcanza, o no aparece en el Material OH. Si la RDD está a 7 días o menos, se marca además como **Crítica**. |
| **Sin BO#** | El correo tiene el formato correcto pero el asunto no trae BO#. Se compara igual, pero hay que identificar la orden a mano. |

---

## 2. Vocabulario básico (léelo primero)

| Término | Qué significa |
|---|---|
| **Flujo** | Una "receta" automática: *cuando pase X, haz Y*. Se ejecuta en la nube de Microsoft, aunque tu computadora esté apagada. |
| **Flujo de nube automatizado** | El tipo de flujo que se ejecuta solo cuando ocurre algo (por ejemplo, llega un correo). Es el que usaremos. |
| **Desencadenador** (*Trigger*) | El primer paso del flujo: el evento que lo pone en marcha. Ejemplo: "Cuando llega un nuevo correo". |
| **Acción** (*Action*) | Cada paso que va después del desencadenador. Ejemplo: "Crear archivo". |
| **Conector** | El servicio al que pertenece una acción: *Office 365 Outlook*, *OneDrive para la Empresa*, etc. Al buscar una acción, fíjate en el ícono y el nombre del conector. |
| **Contenido dinámico** | Datos que salen de un paso anterior (asunto del correo, fecha…). Se insertan desde una lista; **no se escriben a mano**. Aparecen como "fichas" de color dentro del campo. |
| **Expresión** (botón **fx**) | Una pequeña fórmula, parecida a una de Excel, para calcular un valor. Se pega en la pestaña **Expresión** y se confirma con **Agregar** / **Aceptar**. **No se pega directo en el campo**, porque se guardaría como texto. |
| **Buzón compartido** | Un buzón al que acceden varias personas (#DC-MMex Order Approval). |
| **JSON** | Un formato de texto para guardar datos ordenados, del tipo `"subject": "PRDF..."`. No necesitas saber escribirlo. |
| **Material OH** | El reporte de inventario disponible (On-Hand) exportado de Oracle a Excel o CSV. |
| **Historial de ejecuciones** | La lista de cada vez que corrió el flujo, con ✅ si funcionó o ❌ si falló. Es la herramienta principal para encontrar errores. |

---

## 3. Requisitos antes de empezar

Revisa cada punto. Si falta alguno, pídelo a tu líder o a TI antes de continuar.

- [ ] **Cuenta corporativa de Microsoft 365** con acceso a [make.powerautomate.com](https://make.powerautomate.com). Entra con tu correo de trabajo; si ves la página de inicio de Power Automate, tienes acceso.
- [ ] **Acceso para leer el buzón compartido #DC-MMex Order Approval.** Si en Outlook ves el buzón en tu lista de carpetas y puedes abrir sus correos, lo tienes. (Técnicamente es el permiso *Acceso total* / *Full Access*; el flujo solo lo usa para **leer**.)
- [ ] **La dirección de correo del buzón compartido.** Anótala aquí: `______________________________` (ejemplo: `dc-mmex-orderapproval@empresa.com`).
- [ ] **OneDrive para la Empresa sincronizado** en tu computadora (ícono de **nube azul** junto al reloj de Windows).
- [ ] **Microsoft Edge o Google Chrome** para abrir la página. Firefox y Safari no permiten conectar carpetas.
- [ ] **El archivo Material OH** del día (`.xlsx` o `.csv`).

---

## 4. Preparación: carpetas en OneDrive

> Las carpetas se crean **solo en tu OneDrive**. En el buzón compartido **no** se crea nada.

1. Abre el **Explorador de archivos** de Windows (tecla `Windows + E`).
2. En el panel izquierdo haz clic en **OneDrive - \<nombre de la empresa\>** (el de la nube azul, **no** el "OneDrive - Personal").
3. Crea esta estructura (clic derecho → **Nuevo** → **Carpeta**). Respeta las mayúsculas:

```
OrderApproval
└── Correos
```

La carpeta `Resultados` **no** hace falta crearla: la página la crea sola la primera vez que registra un correo.

4. Espera a que las carpetas muestren una **palomita verde** o un ícono de nube: significa que ya están en la nube.
5. Para confirmar, abre OneDrive en el navegador ([office.com](https://www.office.com) → OneDrive) y verifica que `OrderApproval` aparece en **Mis archivos**.

> En tu PC la ruta será algo como `C:\Users\<tu usuario>\OneDrive - <Empresa>\OrderApproval`. Para Power Automate la misma carpeta se escribe **`/OrderApproval`**, con diagonal normal y sin la parte de `C:\Users…`.

---

## 5. Cómo moverse dentro de Power Automate

Si alguna vez no sabes cómo hacer un paso, regresa aquí.

> Power Automate tiene dos diseñadores (el **clásico** y el **nuevo**). Se ven distinto, pero las acciones y los campos son los mismos. Si algo no aparece, prueba el interruptor **Nuevo diseñador** arriba a la derecha. Si los nombres aparecen en inglés, la guía indica ambos: **Español** / *English*.

### 5.1 Crear un flujo nuevo
1. Entra a [make.powerautomate.com](https://make.powerautomate.com).
2. Menú izquierdo → **Crear** → **Flujo de nube automatizado** / *Automated cloud flow*.
3. Escribe el **nombre del flujo**.
4. En *Elegir el desencadenador del flujo*, escribe parte del nombre del desencadenador (ej. `buzón compartido`), selecciónalo y presiona **Crear**.

### 5.2 Agregar una acción
- Debajo del último paso, haz clic en **+ Nuevo paso** (clásico) o en el **+** → **Agregar una acción** (nuevo).
- Escribe el nombre de la acción en el buscador (ej. `crear archivo`) y **elige la del conector correcto** (*OneDrive para la Empresa*, no *OneDrive* personal ni *SharePoint*).

### 5.3 Insertar una expresión
1. Haz clic dentro del campo.
2. Abre el panel y elige la pestaña **Expresión** (o el ícono **fx**).
3. **Pega la expresión en la caja de la pestaña Expresión**, no en el campo.
4. Presiona **Aceptar** / **Agregar**. Debe aparecer una ficha de color con `fx`.

> **Error más común:** pegar la expresión directo en el campo. Si ves el texto de la fórmula tal cual en lugar de una ficha, bórralo y repite este paso.

### 5.4 Guardar, probar y ver errores
- **Guardar**: botón arriba a la derecha.
- **Probar**: **Probar** → **Manualmente** → provoca el evento (enviar un correo al buzón) y espera.
- **Ver qué pasó**: en la página del flujo, sección **Historial de ejecuciones de 28 días**. Haz clic en una ejecución: cada paso muestra ✅ o ❌. Abre el paso con ❌ para leer el mensaje de error.

---

## 6. Flujo OA-1 · Guardar correos

**Qué hace:** cada vez que llega un correo al buzón compartido, crea un archivo `.json` en `OrderApproval/Correos` con el asunto, remitente, fecha y cuerpo. **Solo lee el correo; no lo marca, no lo mueve y no responde.**

**Pasos que tendrá al terminar:**

```
[Desencadenador] Cuando llega un nuevo correo electrónico a un buzón compartido (V2)
        │
[Acción]         Crear archivo (OneDrive para la Empresa)
```

### 6.1 Crear el flujo y el desencadenador

1. Crea un **Flujo de nube automatizado** llamado `OA-1 Guardar correos` (ver 5.1).
2. Desencadenador: **Cuando llega un nuevo correo electrónico a un buzón compartido (V2)** / *When a new email arrives in a shared mailbox (V2)*, del conector **Office 365 Outlook**.
3. Llena los campos (algunos aparecen al hacer clic en **Mostrar opciones avanzadas** / *Show advanced options*):

| Campo | Qué poner | Para qué sirve |
|---|---|---|
| Dirección del buzón original / *Original Mailbox Address* | La dirección del buzón compartido (escríbela) | Indica qué buzón vigilar. |
| Carpeta / *Folder* | `Inbox` / Bandeja de entrada (ícono de carpeta para elegirla) | Solo correos que llegan a la bandeja principal. |
| Importancia / *Importance* | `Cualquiera` / *Any* | No filtrar por importancia. |
| Solo con datos adjuntos / *Only with Attachments* | `No` | Guardar todos, tengan o no adjuntos. |
| Incluir datos adjuntos / *Include Attachments* | `No` | No hace falta descargar adjuntos; la página solo necesita saber si existen. |

> Este desencadenador revisa el buzón cada pocos minutos, así que un correo puede tardar **1 a 5 minutos** en aparecer. Es normal.

### 6.2 Acción · Crear archivo

1. Agrega la acción **Crear archivo** / *Create file* del conector **OneDrive para la Empresa** / *OneDrive for Business*.
2. Llena los campos:

| Campo | Qué poner | Cómo |
|---|---|---|
| Ruta de acceso de la carpeta / *Folder Path* | `/OrderApproval/Correos` | Con el ícono de carpeta navega hasta `OrderApproval` → `Correos` y haz clic en la flecha **>** para entrar. |
| Nombre de archivo / *File Name* | La expresión de abajo | **Expresión** (ver 5.3) |
| Contenido del archivo / *File Content* | `string(triggerBody())` | **Expresión** (ver 5.3) |

**Expresión para el Nombre de archivo** (cópiala completa):

```
concat(formatDateTime(triggerOutputs()?['body/receivedDateTime'],'yyyyMMdd-HHmmss'),'_',guid(),'.json')
```

| Parte | Significado |
|---|---|
| `triggerOutputs()?['body/receivedDateTime']` | La fecha y hora en que llegó el correo. |
| `formatDateTime( … ,'yyyyMMdd-HHmmss')` | La convierte a texto tipo `20260916-134200` (año, mes, día, hora, minuto, segundo). Así los archivos quedan ordenados por fecha. |
| `guid()` | Genera un código aleatorio único, para que dos correos que lleguen en el mismo segundo no se sobrescriban. |
| `concat( … )` | Une todas las piezas: `20260916-134200` + `_` + `3f2a…` + `.json`. |

**Expresión para el Contenido del archivo:**

```
string(triggerBody())
```

| Parte | Significado |
|---|---|
| `triggerBody()` | Todos los datos del correo que entregó el desencadenador (Id, asunto, remitente, cuerpo, fecha…). |
| `string( … )` | Los convierte a texto en formato JSON para guardarlos en el archivo. |

3. **Guarda** el flujo.

### 6.3 Probar OA-1

1. Presiona **Probar** → **Manualmente** → **Probar**.
2. Desde tu correo, envía un correo al buzón compartido con cualquier asunto.
3. Espera de 1 a 5 minutos. El flujo debe mostrar ✅ en ambos pasos.
4. Abre `OrderApproval\Correos` en tu PC: debe aparecer un archivo como `20260916-134200_3f2a….json`.
5. Ábrelo con el Bloc de notas. Debe verse parecido a esto (resumido):

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

Si ves eso, **OA-1 está listo**. A partir de ahora corre solo cada vez que llega un correo, aunque tu computadora esté apagada.

> **¿Ya tienes otro flujo que guarda correos?** Puedes reutilizarlo: la página también lee `.eml`, `.html` y `.txt` en la carpeta `Correos`.

---

## 7. Conectar la página

1. Abre la V1 en **Edge** o **Chrome**: `https://juander161.github.io/OA-JRM/v1/`.
2. Botón **Conectar carpeta** → selecciona la carpeta `OrderApproval` **de tu OneDrive sincronizado** (la carpeta principal, no `Correos`) → **Ver archivos** → **Permitir** / **Guardar cambios** para dar permiso de lectura y escritura.
   > La página necesita escribir para crear `Resultados/Resultados_OrderApproval.xlsx`. No escribe en ningún otro lugar.
3. Botón **Cargar Material OH** → elige el archivo de inventario (`.xlsx` o `.csv`, con o sin encabezado). En la vista **Material OH** puedes revisar que las columnas *Artículo* y *Cantidad OH* sean las correctas.
4. Listo. La página:
   - lee la carpeta `Correos` cada minuto (o al presionar **Actualizar**);
   - analiza cada correo sencillo nuevo contra el Material OH cargado;
   - lo agrega al Excel automáticamente.
5. Cada vez que vuelvas a abrir la página, el navegador pedirá confirmar el permiso: presiona **Permitir acceso**.

**Instalar como aplicación (opcional):** en Edge o Chrome, ícono **Instalar** en la barra de direcciones (o menú `…` → *Aplicaciones* → *Instalar este sitio como aplicación*). Queda como un programa en el menú Inicio.

**Sin OneDrive sincronizado:** usa **Abrir archivos** y elige los `.json` descargados. El registro se guarda en el navegador y el Excel se obtiene con **Registro Excel → Descargar copia**.

### Qué se ve en la página

| Sección | Qué muestra |
|---|---|
| **Bandeja de entrada** | Todos los correos, con su resultado: *Aprobar*, *Shortage*, *Sin BO#*, *Complejo* o *Sin validar* (falta Material OH). Los ya registrados llevan la etiqueta **En Excel**. |
| **Al abrir un correo** | BO#, RDD, cliente y la tabla artículo por artículo: cantidad pedida, existencia OH, diferencia y estado. Arriba indica si ya está registrado y con qué Material OH. |
| **Registro Excel** | Resumen del registro, botón **Guardar Excel** y botón **Descargar copia**. |
| **Material OH** | El archivo cargado, las columnas usadas y un buscador de artículos. |
| **Conexión** | Estado de la carpeta y cantidad de correos leídos y registrados. |

> Las banderas y colores que se ven **dentro de la página** son solo visuales. No cambian nada en Outlook.

---

## 8. El Excel de resultados

**Ubicación:** `OrderApproval/Resultados/Resultados_OrderApproval.xlsx` (en tu OneDrive).

### 8.1 Hojas y columnas

**Hoja `Resumen`** · un renglón por correo:

| Columna | Contenido |
|---|---|
| Fecha correo | Cuándo llegó el correo al buzón. |
| Fecha análisis | Cuándo lo comparó la página. |
| BO# · RDD · Días para RDD · Event Date | Datos del asunto. *Días para RDD* se calcula el día del análisis. |
| Cliente · Rep · Remitente | Quién pide la orden. |
| Artículos · Con faltante | Cuántos artículos trae la solicitud y cuántos no alcanzan o no están en el OH. |
| Resultado | **Aprobar** (verde), **Shortage** o **Sin BO#** (rojo). |
| Crítica | `Sí` si hay faltante y la RDD está a 7 días o menos. |
| Detalle | Explicación corta del resultado. |
| Material OH · OH cargado | Archivo de inventario usado y cuándo se cargó. Sirve para auditar. |
| Asunto | Asunto completo del correo. |

**Hoja `Detalle`** · un renglón por artículo:

| Columna | Contenido |
|---|---|
| Fecha correo · BO# · RDD · Cliente | Para saber a qué orden pertenece el artículo. |
| Artículo · Descripción | Número de artículo y descripción. |
| Cantidad pedida · OH disponible · Diferencia | La comparación. Diferencia negativa = faltan piezas. |
| Estado artículo | **Disponible** (verde), **Faltan n** o **No está en OH** (rojo). |
| Resultado del correo · Material OH | Resultado general de la orden y archivo usado. |

Ambas hojas tienen el **encabezado fijo** y **filtros** activados: usa la flecha de cada encabezado para ver, por ejemplo, solo los `Shortage` o solo un BO#.

### 8.2 Reglas del registro

1. **Solo correos sencillos.** Los complejos nunca entran al Excel.
2. **Sin Material OH no se registra nada.** Los correos esperan como *Sin validar* hasta que cargues el OH.
3. **Cada correo se registra una sola vez**, con el Material OH que estaba cargado en ese momento. Si después cargas un OH nuevo, **el renglón no cambia** (así el Excel sirve como historial). Al abrir el correo, la página avisa si con el OH actual el resultado sería distinto.
4. **Volver a analizar:** al abrir un correo registrado, el botón **Volver a analizar** reemplaza su renglón usando el Material OH actual.
5. **El Excel se reescribe completo** cada vez que se registra un correo nuevo. Si quieres anotar algo, hazlo en **una copia** del archivo: lo que escribas en el original se pierde en la siguiente actualización.
6. **Si el Excel está abierto** en Excel de escritorio, la página no puede actualizarlo. Los datos **no se pierden**: cierra el archivo y presiona **Guardar Excel**.
7. Junto al Excel está `registro.json`. Es la copia de respaldo del registro que usa la página. **No lo borres ni lo edites.**

> **Recomendación diaria:** al iniciar el turno, carga el Material OH del día **antes** de conectar o actualizar la carpeta, para que los correos nuevos se comparen contra el inventario más reciente.

---

## 9. Prueba completa

1. Envía al buzón compartido un correo con:
   - **Asunto:** `PRDF: RDD 30-OCT-26, Event Date N/A, PRUEBA SA, Rep PRUEBA SA, BO# 12345678`
   - **Cuerpo:** `Item [1012010774] Qty [1] Description [PRUEBA]` (usa un artículo que exista en tu Material OH)
2. Espera a que OA-1 cree el `.json` en `Correos` (1 a 5 min) y a que OneDrive lo sincronice a tu PC.
3. En la página: carga el Material OH y presiona **Actualizar**. El correo aparece con resultado *Aprobar* o *Shortage* y la etiqueta **En Excel**.
4. Abre `OrderApproval\Resultados\Resultados_OrderApproval.xlsx`: el BO# `12345678` aparece en **Resumen** y su artículo en **Detalle**. **Cierra el Excel** al terminar.
5. Envía un segundo correo con asunto `RE: ` + el mismo asunto y un texto libre. Debe aparecer como **Complejo** y **no** entrar al Excel.
6. Revisa en Outlook que ninguno de los dos correos cambió (sin banderas, en la Bandeja de entrada).

> Para practicar sin flujo ni buzón: **Conexión → Cargar ejemplos**. Los ejemplos **nunca** se registran en el Excel.

---

## 10. Problemas comunes y soluciones

| Síntoma | Causa probable | Solución |
|---|---|---|
| OA-1 nunca se ejecuta | Dirección del buzón mal escrita, o no tienes acceso al buzón | Revisa la dirección. Pide a TI acceso de lectura (*Full Access*). |
| OA-1 falla con *"Forbidden"* o *"Access denied"* | Faltan permisos sobre el buzón compartido | Pide el permiso a TI. Después elimina y vuelve a crear la conexión de Outlook en el flujo. |
| Los archivos se crean en otro lugar | Se eligió *OneDrive* personal o *SharePoint* en lugar de *OneDrive para la Empresa* | Borra la acción y agrégala de nuevo desde el conector correcto. |
| El nombre del archivo quedó como el texto `concat(...)` | La expresión se pegó directo en el campo | Bórrala y pégala en la pestaña **Expresión** (ver 5.3). |
| El `.json` está en OneDrive web pero no en la PC | OneDrive no está sincronizando | Clic en la nube azul → revisa que no esté en pausa ni con errores. |
| La página no muestra correos | Se conectó `Correos` en vez de `OrderApproval`, o no se dio permiso | Vuelve a **Conectar carpeta** eligiendo `OrderApproval` y presiona **Permitir**. |
| "Conectar carpeta" no aparece o no hace nada | Navegador no compatible | Usa Edge o Chrome actualizados. |
| Todos los correos salen *Sin validar* | No hay Material OH cargado | **Cargar Material OH**. |
| Un artículo sale *No está en OH* pero sí existe | Columnas mal detectadas o formato distinto del número | Vista **Material OH** → revisa que *Artículo* y *Cantidad OH* apunten a las columnas correctas; busca el artículo en el buscador. Después usa **Volver a analizar** en el correo. |
| Un correo sencillo sale como *Complejo* | Trae adjunto (a veces el logo de la firma), texto con preguntas, o el asunto tiene `RE:`/`FW:` | Es lo esperado: se revisa a mano. El motivo aparece al abrir el correo. |
| Aviso "No se pudo actualizar Resultados_OrderApproval.xlsx" | El Excel está abierto | Ciérralo y presiona **Guardar Excel**. |
| No aparece la carpeta `Resultados` | Aún no se registra ningún correo, o falta permiso de escritura | Carga el Material OH y verifica **Conexión → Permiso: Lectura y escritura**. |
| El Excel perdió notas que escribí | El archivo se reescribe en cada actualización | Trabaja sobre una copia (ver 8.2, regla 5). |

---

## 11. Si varios compañeros lo usan

Cada persona que quiera usarlo en su computadora necesita **su propia copia**:

| Elemento | ¿Uno por persona o compartido? |
|---|---|
| Carpeta `OrderApproval` en OneDrive | **Uno por persona** (cada quien en su OneDrive). |
| Flujo OA-1 | **Uno por persona** (guarda los correos en el OneDrive de quien lo creó). |
| Excel de resultados | **Uno por persona** (lo escribe la página en la carpeta de cada quien). |
| Material OH | Cada quien lo carga en su página. |

Como nadie modifica el buzón, **no hay choques** entre compañeros: cada uno solo lee.

> **Si quieren un solo Excel para todo el equipo:** que una sola persona tenga el flujo y la página, y comparta la carpeta `OrderApproval/Resultados` en OneDrive **con permiso de solo lectura**. Así nadie edita el archivo mientras la página lo actualiza.

**Opción rápida para replicar el flujo:** quien ya lo tiene puede exportarlo: [make.powerautomate.com](https://make.powerautomate.com) → **Mis flujos** → `…` del flujo → **Exportar** → **Paquete (.zip)**. El compañero lo importa con **Importar** → **Importar paquete (heredado)**, elige **Crear como nuevo** y selecciona **sus propias conexiones** de Outlook y OneDrive. Después solo revisa que la ruta (`/OrderApproval/Correos`) y la dirección del buzón sean correctas.

---

## 12. Referencia técnica: formato de los archivos

### 12.1 Archivos de correo (los crea OA-1)

Además de los campos del ejemplo de la sección 6.3, la página acepta estas claves opcionales: `fromName` (nombre del remitente), `internetMessageId`, `conversationId`.

### 12.2 `Resultados/registro.json` (lo crea la página)

Lista con un objeto por correo registrado; el Excel se genera a partir de este archivo.

```json
{
  "id": "AAMkAGEjemplo0001AAA=",
  "analizado": "2026-09-30T17:15:02.000Z",
  "recibido": "2026-09-16T13:42:00.000Z",
  "bo": "93938905", "rdd": "07-OCT-26", "dias": 7, "evento": "15-NOV-26",
  "cliente": "NORTHRIDGE GRAD SUPPLY LLC", "rep": "NORTHRIDGE GRAD SUPPLY LLC",
  "remitente": "Northridge Grad Supply", "remitenteCorreo": "orders@northridge-grad.example",
  "asunto": "PRDF: RDD 07-OCT-26, … BO# 93938905",
  "estado": "verde", "resultado": "Aprobar", "critico": false,
  "motivo": "Existencia suficiente en todos los artículos.",
  "oh": {"archivo": "Material OH.xlsx", "cargado": "2026-09-30T14:00:00.000Z"},
  "lineas": [{"item": "1012010774", "desc": "PRODUCT PACKAGE…", "qty": 1, "oh": 25, "diff": 24, "st": "ok"}]
}
```

| Campo | Valores |
|---|---|
| `estado` | `verde` (Aprobar) · `rojo` (Shortage o Sin BO#) |
| `lineas[].st` | `ok` (disponible) · `short` (faltante) · `nf` (no está en el Material OH) |

---

## 13. Si ya tenías la versión anterior (OA-2, banderas, respuestas)

La versión anterior también respondía correos y ponía banderas o movía correos en Outlook. **Eso ya no forma parte del alcance.** Si lo configuraste:

1. En [make.powerautomate.com](https://make.powerautomate.com) → **Mis flujos**, **desactiva** (o elimina) `OA-2 Ejecutar acciones`.
2. La carpeta `OrderApproval/Acciones` (y sus subcarpetas) ya no se usa; puedes borrarla.
3. `OA-1 Guardar correos` **se queda igual**.
4. Si alguien creó carpetas `OA Aprobar`, `OA Shortage` u `OA Revision` en el buzón compartido, pueden eliminarse.

---

## 14. Lista de verificación final

- [ ] Puedo ver y abrir el buzón compartido en Outlook.
- [ ] Existe `OrderApproval/Correos` en **mi** OneDrive para la Empresa y está sincronizada.
- [ ] OA-1 creado, activado y probado: aparece un `.json` en `Correos` al llegar un correo.
- [ ] La página está conectada a `OrderApproval` con permiso de **lectura y escritura**.
- [ ] El Material OH del día está cargado y las columnas *Artículo* y *Cantidad OH* son correctas.
- [ ] Un correo sencillo de prueba aparece en `Resultados/Resultados_OrderApproval.xlsx` (hojas Resumen y Detalle).
- [ ] Un correo complejo de prueba aparece como *Complejo* y **no** está en el Excel.
- [ ] En Outlook ningún correo fue marcado, movido ni respondido.

# Order Approval · Propuesta sin desarrollo de software

Solución armada solo con herramientas de Microsoft 365: **Excel**, **Power Automate**, **Outlook** y **OneDrive**. No hay código, ni API, ni acceso a Oracle. El inventario se toma del archivo **Material OH**.

| Pieza | Herramienta | Qué hace |
|---|---|---|
| Libro `OrderApproval.xlsx` | Excel | Guarda el Material OH, lee cada correo con fórmulas, compara contra la existencia y arma la tabla de comparación |
| Flujo **OA-A Clasificar correos** | Power Automate | Registra cada correo en Excel, pone bandera, lo mueve de carpeta y envía un resumen con la comparación |
| Flujo **OA-B Programar respuesta** | Power Automate | Envía a la hora indicada una respuesta armada en Excel |
| Reglas y categorías | Outlook | Colorea los resúmenes (verde, rojo, naranja) como categorías |
| Plantillas y envío programado | Outlook | Respuestas rápidas sin flujo |

Resultado en Outlook:

- **Buzón compartido:** cada correo queda con **palomita verde** (se puede aprobar) o **bandera roja** (shortage o revisión) y se mueve a `OA Aprobar`, `OA Shortage` u `OA Revision`.
- **Correo del operador:** llega un resumen por pedido, con categoría de color, y al abrirlo muestra la **tabla de comparación** (artículo, cantidad pedida, existencia OH y estado).

---

## Índice

1. [Carpetas y buzón](#1-carpetas-y-buzón)
2. [Libro de Excel](#2-libro-de-excel)
3. [Cargar el Material OH (con o sin encabezado)](#3-cargar-el-material-oh-con-o-sin-encabezado)
4. [Hoja de búsquedas](#4-hoja-de-búsquedas)
5. [Flujo OA-A · Clasificar correos](#5-flujo-oa-a--clasificar-correos)
6. [Categorías de color y reglas de Outlook](#6-categorías-de-color-y-reglas-de-outlook)
7. [Respuestas rápidas](#7-respuestas-rápidas)
8. [Flujo OA-B · Programar respuesta](#8-flujo-oa-b--programar-respuesta)
9. [Pruebas](#9-pruebas)
10. [Límites conocidos](#10-límites-conocidos)
11. [Fórmulas en Excel en español](#11-fórmulas-en-excel-en-español)

---

## 1. Carpetas y buzón

1. En **OneDrive para la Empresa** crea la carpeta `OrderApproval`.
2. En el buzón compartido **#DC-MMex Order Approval**, dentro de *Bandeja de entrada*, crea las carpetas `OA Aprobar`, `OA Shortage` y `OA Revision`.
3. En tu buzón personal (el del operador) crea la carpeta `OA Resultados`.

---

## 2. Libro de Excel

Crea en `OrderApproval` un libro llamado **`OrderApproval.xlsx`** con cinco hojas. Cada rango se convierte en tabla con **Insertar → Tabla** (marca *La tabla tiene encabezados*) y se nombra en **Diseño de tabla → Nombre de la tabla**.

> Las fórmulas están en inglés. Si tu Excel está en español, copia las de la [sección 11](#11-fórmulas-en-excel-en-español).
> Para escribir una fórmula en una columna de tabla, pégala en la primera celda de datos de esa columna: Excel la copia sola a toda la columna.

### 2.1 Hoja `MaterialOH` · tabla `tblOH`

| Articulo | Descripcion | OH |
|---|---|---|

Formato: `Articulo` como **Texto**, `OH` como **Número**. Se llena en la [sección 3](#3-cargar-el-material-oh-con-o-sin-encabezado).

### 2.2 Hoja `Correos` · tabla `tblCorreos`

Escribe estos 16 encabezados en la fila 1 (A1 a P1) y conviértelos en tabla:

| Columna | Encabezado | Contenido |
|---|---|---|
| A | `IdCorreo` | Lo llena el flujo |
| B | `Recibido` | Lo llena el flujo |
| C | `Remitente` | Lo llena el flujo |
| D | `Asunto` | Lo llena el flujo |
| E | `Cuerpo` | Lo llena el flujo |
| F | `Adjuntos` | Lo llena el flujo |
| G | `BO` | Fórmula |
| H | `RDD` | Fórmula |
| I | `DiasRDD` | Fórmula (formato **Número**, sin decimales) |
| J | `Tipo` | Fórmula |
| K | `Articulos` | Fórmula |
| L | `Faltantes` | Fórmula |
| M | `Resultado` | Fórmula |
| N | `Prioridad` | Fórmula |
| O | `Detalle` | Fórmula |
| P | `Etiqueta` | Fórmula |

Para que las fórmulas se puedan capturar, escribe una fila de prueba en A2:F2 (por ejemplo `prueba`, la fecha de hoy, `rep@cliente.com`, el asunto y el cuerpo de un correo real, `FALSE`) y pega cada fórmula en la fila 2. Al terminar, borra la fila de prueba con clic derecho → **Eliminar → Filas de la tabla**. Las fórmulas se quedan en la tabla.

**G · BO** (número de orden del asunto)
```
=LET(t,TEXTAFTER([@Asunto],"BO#",,,,""),IF(t="","",TEXTBEFORE(TRIM(t)&" "," ")))
```

**H · RDD** (fecha requerida, texto `12-MAR-26`)
```
=LET(t,TEXTAFTER([@Asunto],"RDD ",,,,""),IF(t="","",TRIM(TEXTBEFORE(t&",",","))))
```

**I · DiasRDD** (días que faltan para la RDD)
```
=IF([@RDD]="","",LET(p,TEXTSPLIT([@RDD],"-"),y,VALUE(INDEX(p,1,3)),f,DATE(IF(y<100,2000+y,y),(SEARCH(INDEX(p,1,2),"JANFEBMARAPRMAYJUNJULAUGSEPOCTNOVDEC")+2)/3,VALUE(INDEX(p,1,1))),f-TODAY()))
```

**J · Tipo** (`ESTANDAR` o `COMPLEJO`)
```
=IF(OR(LEFT(TRIM([@Asunto]),3)="RE:",LEFT(TRIM([@Asunto]),3)="FW:",LEFT(TRIM([@Asunto]),4)="FWD:",ISNUMBER(SEARCH("[Ext]",[@Asunto])),ISNUMBER(SEARCH("thread::",[@Asunto])),[@Adjuntos]=TRUE,[@Adjuntos]="true",NOT(ISNUMBER(SEARCH("Item [",[@Cuerpo])))),"COMPLEJO","ESTANDAR")
```

**K · Articulos** (líneas `Item [` en el cuerpo)
```
=(LEN([@Cuerpo])-LEN(SUBSTITUTE([@Cuerpo],"Item [","")))/6
```

**L · Faltantes** (artículos sin existencia suficiente; `-1` = formato no reconocido)
```
=IF(OR([@Articulos]=0,[@Tipo]="COMPLEJO"),0,IFERROR(LET(partes,DROP(TEXTSPLIT([@Cuerpo],"Item ["),,1),art,TRIM(TEXTBEFORE(partes,"]")),cant,VALUE(TRIM(TEXTBEFORE(TEXTAFTER(partes,"Qty ["),"]"))),inv,SUMIFS(tblOH[OH],tblOH[Articulo],art),SUM(--(inv<cant))),-1))
```

**M · Resultado** (`VERDE`, `ROJO` o `NARANJA`)
```
=IF([@BO]="","ROJO",IF(OR([@Tipo]="COMPLEJO",[@Faltantes]<0),"NARANJA",IF([@Faltantes]>0,"ROJO","VERDE")))
```

**N · Prioridad**
```
=IF(AND([@Resultado]="ROJO",ISNUMBER([@DiasRDD])),IF([@DiasRDD]<=7,"CRITICA","NORMAL"),"NORMAL")
```

**O · Detalle** (tabla HTML con la comparación)
```
=IF(OR([@Articulos]=0,[@Tipo]="COMPLEJO"),"<p>Correo complejo: revisión manual.</p>",IFERROR(LET(partes,DROP(TEXTSPLIT([@Cuerpo],"Item ["),,1),art,TRIM(TEXTBEFORE(partes,"]")),cant,VALUE(TRIM(TEXTBEFORE(TEXTAFTER(partes,"Qty ["),"]"))),inv,SUMIFS(tblOH[OH],tblOH[Articulo],art),filas,"<tr><td>"&art&"</td><td align=right>"&cant&"</td><td align=right>"&inv&"</td><td>"&IF(inv>=cant,"OK","FALTAN "&(cant-inv))&"</td></tr>","<table border=1 cellpadding=4 cellspacing=0><tr><th>Artículo</th><th>Pide</th><th>OH</th><th>Estado</th></tr>"&TEXTJOIN("",TRUE,filas)&"</table>"),"<p>Formato no reconocido.</p>"))
```

**P · Etiqueta** (asunto del resumen)
```
="["&[@Resultado]&"] BO# "&IF([@BO]="","SIN BO#",[@BO])&IF([@Prioridad]="CRITICA"," · CRITICA","")&" · "&[@Asunto]
```

### 2.3 Hoja `Plantillas` · tabla `tblPlantillas`

| Nombre | Cuerpo |
|---|---|
| Aprobada | `Hello,` ↵ ↵ `BO# {BO} has been reviewed. All requested items are available on hand and the order will be released.` ↵ ↵ `{DETALLE}` ↵ ↵ `Regards,` ↵ `Order Approval Team` |
| Shortage | `Hello,` ↵ ↵ `We reviewed BO# {BO}. Some items do not have enough on-hand inventory:` ↵ ↵ `{DETALLE}` ↵ ↵ `Please let us know if we should hold the order, ship partial, or substitute the items.` ↵ ↵ `Regards,` ↵ `Order Approval Team` |
| En revisión | `Hello,` ↵ ↵ `We received your message about BO# {BO}. It is under review and we will follow up shortly.` ↵ ↵ `Regards,` ↵ `Order Approval Team` |

↵ = salto de línea dentro de la celda (**Alt + Enter**). `{BO}` y `{DETALLE}` se reemplazan solos.

### 2.4 Hoja `Respuestas` · tabla `tblRespuestas`

| Columna | Encabezado | Contenido |
|---|---|---|
| A | `Folio` | Fórmula |
| B | `BO` | Se escribe (o lista desplegable, ver abajo) |
| C | `Plantilla` | Lista desplegable |
| D | `EnviarEl` | Fecha y hora local, formato `dd/mm/aaaa hh:mm` |
| E | `EnviarUTC` | Fórmula, mismo formato |
| F | `Para` | Fórmula |
| G | `Asunto` | Fórmula |
| H | `Cuerpo` | Fórmula |
| I | `Estado` | Lista desplegable: `Borrador`, `Programada`, `Enviada`, `Cancelada` |

**A · Folio**
```
=ROW()-ROW(tblRespuestas[[#Headers],[Folio]])
```
**E · EnviarUTC** (`Config!B2` = horas de diferencia con UTC; 6 para Ciudad de México, Monterrey y Guadalajara)
```
=IF([@EnviarEl]="","",[@EnviarEl]+Config!$B$2/24)
```
**F · Para**
```
=XLOOKUP([@BO],tblCorreos[BO],tblCorreos[Remitente],"",0,-1)
```
**G · Asunto**
```
="RE: "&XLOOKUP([@BO],tblCorreos[BO],tblCorreos[Asunto],"",0,-1)
```
**H · Cuerpo**
```
=LET(p,XLOOKUP([@Plantilla],tblPlantillas[Nombre],tblPlantillas[Cuerpo],""),d,XLOOKUP([@BO],tblCorreos[BO],tblCorreos[Detalle],"",0,-1),SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(p,CHAR(10),"<br>"),"{BO}",[@BO]),"{DETALLE}",d))
```

Listas desplegables: selecciona la columna → **Datos → Validación de datos → Permitir: Lista**:
- `Plantilla` → Origen: `=INDIRECT("tblPlantillas[Nombre]")`
- `Estado` → Origen: `Borrador,Programada,Enviada,Cancelada`
- `BO` (opcional) → Origen: `=INDIRECT("tblCorreos[BO]")`

### 2.5 Hoja `Config`

| | A | B |
|---|---|---|
| 1 | Parámetro | Valor |
| 2 | Horas UTC | 6 |
| 3 | Operador | `operador@empresa.com` |

---

## 3. Cargar el Material OH (con o sin encabezado)

Elige **una** de las dos opciones.

### Opción A · Copiar y pegar (diario, 2 minutos)

1. Abre el archivo Material OH.
2. Identifica las tres columnas que se necesitan: **artículo**, **descripción** y **existencia (On Hand)**.
3. En `OrderApproval.xlsx` → hoja `MaterialOH`: selecciona las filas de datos de `tblOH` → clic derecho → **Eliminar → Filas de la tabla**.
4. Copia la columna de artículos del Material OH:
   - **Con encabezado:** empieza a copiar desde la **segunda** fila.
   - **Sin encabezado:** empieza desde la **primera** fila.
5. Pégala en la primera celda de datos de `Articulo` con **Pegado especial → Valores**. Repite con descripción → `Descripcion` y existencia → `OH`.
6. Si un artículo aparece en varias filas (varios almacenes o ubicaciones), déjalas todas: las fórmulas suman la existencia.

### Opción B · Power Query (se configura una vez y cada día solo se actualiza)

En **Excel de escritorio**:

1. **Datos → Obtener datos → Desde un archivo → Desde un libro** (o **Desde texto/CSV** si el Material OH es CSV) → elige el archivo Material OH dentro de la carpeta sincronizada de OneDrive.
2. Elige la hoja → **Transformar datos**.
3. Encabezados:
   - **Con encabezado:** revisa que en *Pasos aplicados* exista **Encabezados promovidos**. Si no aparece: **Inicio → Usar la primera fila como encabezado**.
   - **Sin encabezado:** si aparece **Encabezados promovidos**, bórralo con la **X**. Las columnas quedan como `Column1`, `Column2`…
   - **Con filas de título antes del encabezado:** **Inicio → Quitar filas → Quitar filas superiores** con el número de filas de título, y después **Usar la primera fila como encabezado**.
4. Con **Ctrl + clic** selecciona las columnas de artículo, descripción y existencia → clic derecho → **Quitar otras columnas**.
5. Cambia el nombre con doble clic en cada encabezado: `Articulo`, `Descripcion`, `OH`.
6. Tipos: clic en el ícono junto al encabezado → `Articulo` = **Texto**, `OH` = **Número decimal**.
7. (Opcional) **Inicio → Agrupar por** → *Avanzado* → agrupar por `Articulo` y `Descripcion` → nueva columna `OH` = **Suma** de `OH`.
8. **Inicio → Cerrar y cargar en… → Tabla → Hoja de cálculo existente** → `MaterialOH!$A$1`.
9. Borra la tabla `tblOH` vacía de la sección 2.1 si quedó duplicada, y en **Diseño de tabla** cambia el nombre de la tabla cargada a **`tblOH`**.

Cada día: reemplaza el archivo Material OH con el nuevo (mismo nombre y carpeta) → abre `OrderApproval.xlsx` → **Datos → Actualizar todo** → **Guardar** → cierra Excel de escritorio.

> Cierra Excel de escritorio al terminar: con el libro abierto en escritorio, Power Automate puede marcar el archivo como bloqueado durante unos minutos.

---

## 4. Hoja de búsquedas

Hoja `Buscar`:

| Celda | Contenido |
|---|---|
| A2 | `Buscar` |
| B2 | Texto a buscar (artículo o palabras de la descripción) |
| A3 | `Modo` |
| B3 | Lista desplegable con **Datos → Validación de datos → Lista**: `Artículo,Contiene,Descripción` |
| D2 | `Total OH` |
| E2 | Fórmula de total |
| A5 | Fórmula de resultados (se expande sola hacia abajo) |
| G4 | `Lista de artículos` |
| G5 | `Artículo` · H5 `OH` · I5 `Estado` |
| G6:G200 | Pega aquí varios artículos, uno por fila |

**A5 · Resultados** (búsqueda exacta, parcial o por descripción)
```
=LET(q,TRIM($B$2),modo,$B$3,art,tblOH[Articulo]&"",m,IF(modo="Artículo",art=q,IF(modo="Contiene",ISNUMBER(SEARCH(q,art)),ISNUMBER(SEARCH(q,tblOH[Descripcion])))),IF(q="","",FILTER(tblOH,m,"Sin resultados")))
```
En modo **Descripción** usa `*` entre palabras para buscar varias en cualquier parte: `gown*navy`.

**E2 · Total OH del artículo**
```
=IF($B$2="","",SUMIFS(tblOH[OH],tblOH[Articulo],TRIM($B$2)))
```

**H6 · OH de la lista** (cópiala hacia abajo hasta H200)
```
=IF(G6="","",SUMIFS(tblOH[OH],tblOH[Articulo],G6))
```

**I6 · Estado de la lista** (cópiala hacia abajo hasta I200)
```
=IF(G6="","",IF(COUNTIFS(tblOH[Articulo],G6)=0,"NO EXISTE","OK"))
```

---

## 5. Flujo OA-A · Clasificar correos

[make.powerautomate.com](https://make.powerautomate.com) → **Crear → Flujo de nube automatizado** → nombre `OA-A Clasificar correos`.

Todos los valores en *cursiva* se eligen del panel **Contenido dinámico** (ícono ⚡ o `/`). No se escriben expresiones.

### 5.1 Desencadenador
**Cuando llega un nuevo correo electrónico a un buzón compartido (V2)**

| Campo | Valor |
|---|---|
| Dirección del buzón original | buzón compartido |
| Carpeta | Bandeja de entrada |
| Incluir datos adjuntos | No |

### 5.2 Html a texto
**Conversión de contenido → Html a texto** → Contenido: *Cuerpo*.

### 5.3 Registrar el correo
**Excel Online (Business) → Agregar una fila a una tabla** → cambia el nombre a `Registrar`.

| Campo | Valor |
|---|---|
| Ubicación | OneDrive for Business |
| Biblioteca de documentos | OneDrive |
| Archivo | `/OrderApproval/OrderApproval.xlsx` |
| Tabla | `tblCorreos` |
| IdCorreo | *Id. de mensaje* |
| Recibido | *Hora de recepción* |
| Remitente | *De* |
| Asunto | *Asunto* |
| Cuerpo | *Contenido de texto sin formato* (de Html a texto) |
| Adjuntos | *Tiene datos adjuntos* |

### 5.4 Registro corto (hilos muy largos)
Una celda de Excel admite hasta 32,767 caracteres. Si un hilo largo no cabe, se registra con la vista previa:

1. Agrega debajo otra **Agregar una fila a una tabla** → nombre `Registrar corto` → mismos campos, pero **Cuerpo** = *Vista previa del cuerpo*.
2. En `Registrar corto`: `…` → **Configuración de ejecución posterior** → marca solo **ha fallado** (de `Registrar`).

### 5.5 Esperar el cálculo
**Programación → Retraso** → 10 segundos → `…` → **Configuración de ejecución posterior** → marca **es correcto** y **se ha omitido** (de `Registrar corto`).

### 5.6 Leer el resultado
**Excel Online (Business) → Obtener una fila** → nombre `Resultado`.

| Campo | Valor |
|---|---|
| Archivo / Tabla | `OrderApproval.xlsx` / `tblCorreos` |
| Columna de clave | `IdCorreo` |
| Valor de clave | *Id. de mensaje* (del desencadenador) |

### 5.7 Bandera y carpeta
**Control → Cambiar** → En: *Resultado* (de la acción `Resultado`).

| Caso (igual a) | Acción 1: **Marcar con marca de seguimiento el correo electrónico (V2)** | Acción 2: **Mover correo electrónico (V2)** |
|---|---|---|
| `VERDE` | Estado: **Completado** | Carpeta: `OA Aprobar` |
| `ROJO` | Estado: **Marcado** | Carpeta: `OA Shortage` |
| `NARANJA` | Estado: **Marcado** | Carpeta: `OA Revision` |

En ambas acciones: **Id. de mensaje** = *Id. de mensaje* (del desencadenador) y **Dirección del buzón original** = buzón compartido. Primero la bandera y después mover.

### 5.8 Resumen para el operador
Debajo del **Cambiar**: **Office 365 Outlook → Enviar un correo electrónico (V2)**.

| Campo | Valor |
|---|---|
| Para | correo personal del operador (**no** el buzón compartido, para no volver a disparar el flujo) |
| Asunto | *Etiqueta* (de `Resultado`) |
| Cuerpo | `De:` *Remitente* · `RDD:` *RDD* · `Días:` *DiasRDD* · salto de línea · *Detalle* |
| Importancia | Normal |

Guarda el flujo.

---

## 6. Categorías de color y reglas de Outlook

En el buzón **del operador**, con Outlook en la web o el nuevo Outlook:

1. **Configuración → Cuentas → Categorías** (o **General → Categorías**) → crea:
   - `OA Verde` (verde)
   - `OA Rojo` (rojo)
   - `OA Naranja` (naranja)
2. **Configuración → Correo → Reglas → Agregar nueva regla**, una por color:

   | Nombre | Condición: *El asunto incluye* | Acción 1: *Categorizar* | Acción 2: *Mover a* |
   |---|---|---|---|
   | OA Verde | `[VERDE]` | `OA Verde` | `OA Resultados` |
   | OA Rojo | `[ROJO]` | `OA Rojo` | `OA Resultados` |
   | OA Naranja | `[NARANJA]` | `OA Naranja` | `OA Resultados` |

3. (Opcional) En la carpeta `OA Resultados`: **Filtro → Categoría** para ver solo un color, u **Organizar por → Categorías**.
4. (Opcional, Outlook clásico) **Vista → Configuración de vista → Formato condicional → Agregar** → condición *El asunto contiene* `CRITICA` → fuente roja en negritas.

Así la carpeta `OA Resultados` funciona como bandeja: cada pedido aparece con su color antes de abrirlo, y al abrirlo se ve la tabla de comparación.

---

## 7. Respuestas rápidas

### 7.1 Plantillas de Outlook (sin flujo)

**Outlook en la web / nuevo Outlook**
1. Mensaje nuevo o **Responder** → menú `…` → **Mis plantillas** → **+ Plantilla**.
2. Crea `Aprobada`, `Shortage`, `Falta información` y `En revisión` con el texto de la [sección 2.3](#23-hoja-plantillas--tabla-tblplantillas).
3. Para usarla: **Responder** → `…` → **Mis plantillas** → clic en la plantilla.

**Outlook clásico: Pasos rápidos**
1. **Inicio → Pasos rápidos → Crear nuevo**.
2. Nombre `OA Shortage` → acción **Responder** → **Mostrar opciones** → escribe el texto → agrega la acción **Marcar como completado**.
3. Asigna un atajo (**Ctrl + Mayús + 1**). Queda como un botón de un clic.

### 7.2 Programar el envío (sin flujo)

- **Outlook en la web / nuevo Outlook:** flecha junto a **Enviar** → **Programar envío** → fecha y hora.
- **Outlook clásico:** **Opciones → Retrasar entrega** → *No entregar antes de* → fecha y hora → **Cerrar → Enviar**. Outlook clásico debe quedar abierto hasta esa hora.

---

## 8. Flujo OA-B · Programar respuesta

Envía desde el buzón compartido una respuesta preparada en la hoja `Respuestas`, a la hora indicada, aunque Outlook esté cerrado.

**Crear → Flujo de nube instantáneo** → nombre `OA-B Programar respuesta` → **Omitir** → desencadenador **Excel Online (Business) → Para una fila seleccionada**.

| Campo | Valor |
|---|---|
| Ubicación / Biblioteca | OneDrive for Business / OneDrive |
| Archivo | `/OrderApproval/OrderApproval.xlsx` |
| Tabla | `tblRespuestas` |

1. **Obtener una fila** → nombre `Fila` → tabla `tblRespuestas` → Columna de clave `Folio` → Valor *Folio* (del desencadenador) → **Mostrar todo** → **Formato DateTime: ISO 8601**.
2. **Actualizar una fila** → misma tabla y clave → `Estado` = `Programada`.
3. **Programación → Retrasar hasta** → Marca de tiempo = *EnviarUTC* (de `Fila`).
4. **Obtener una fila** → nombre `Revisar` → mismos datos que el paso 1.
5. **Control → Condición** → *Estado* (de `Revisar`) **es igual a** `Programada`.
   - **Si es verdadero:**
     1. **Enviar un correo electrónico desde un buzón compartido (V2)** → Buzón = buzón compartido · Para = *Para* · Asunto = *Asunto* · Cuerpo = *Cuerpo* (de `Revisar`).
     2. **Actualizar una fila** → `Estado` = `Enviada`.
   - **Si es falso:** nada. La respuesta fue cancelada.

**Usarlo:**
1. Abre `OrderApproval.xlsx` en **Excel para la web** → hoja `Respuestas` → nueva fila: `BO`, `Plantilla`, `EnviarEl`, `Estado` = `Borrador`. Revisa `Para`, `Asunto` y `Cuerpo`.
2. Selecciona una celda de esa fila → pestaña **Automatizar** → **Power Automate** (o **Complementos → Power Automate**) → **OA-B Programar respuesta** → **Ejecutar**.
3. Para cancelar antes de la hora: cambia `Estado` a `Cancelada`.

> **Retrasar hasta** admite hasta 30 días.

---

## 9. Pruebas

| # | Correo de prueba al buzón compartido | Resultado esperado |
|---|---|---|
| 1 | Asunto `PRDF: RDD <fecha +20 días>, Event Date N/A, PRUEBA SA, Rep PRUEBA SA, BO# 11111111` · cuerpo con artículos que **sí** tienen existencia | Fila `VERDE` en Excel · palomita verde · carpeta `OA Aprobar` · resumen `[VERDE]` verde |
| 2 | Igual, con `Qty` mayor a la existencia y RDD en 3 días | `ROJO` · `CRITICA` · bandera roja · `OA Shortage` · resumen rojo con `FALTAN n` |
| 3 | Igual, sin `BO#` en el asunto | `ROJO` · resumen `[ROJO] BO# SIN BO#` |
| 4 | `RE: ` + asunto de la prueba 1 con texto libre | `NARANJA` · `OA Revision` · resumen naranja |
| 5 | Con un artículo que no existe en el Material OH | `ROJO` (existencia 0) |
| 6 | Fila en `Respuestas` programada a +5 min y ejecutar OA-B | Llega la respuesta y `Estado` = `Enviada` |
| 7 | Igual que 6, pero cambiar `Estado` a `Cancelada` antes de la hora | No se envía nada |

---

## 10. Límites conocidos

| Límite | Efecto | Qué hacer |
|---|---|---|
| El Material OH es una foto del día | Si el inventario cambió después de exportarlo, la bandera puede no coincidir con la existencia real | Cargar el Material OH al inicio de cada turno |
| Correos complejos (hilos, adjuntos, texto libre) | Siempre quedan en naranja para revisión humana | Esperado |
| Categorías de color en el buzón compartido | El conector estándar de Outlook no asigna categorías | Banderas y carpetas en el buzón compartido; categorías en el resumen del operador |
| Buzón compartido | La respuesta sale como correo nuevo con `RE:` en el asunto, no dentro del mismo hilo | Esperado |
| Desencadenadores de Outlook | Revisan el buzón cada pocos minutos, no al instante | Esperado |
| Libro abierto en Excel de escritorio | El flujo puede fallar por archivo bloqueado | Cerrar Excel de escritorio después de actualizar |
| Formato distinto de `Item [#] Qty [#]` | `Faltantes` = -1 → `NARANJA` | Revisión manual |
| **Obtener una fila** marca error con el valor de clave | Algunos Id. de mensaje traen caracteres que Excel Online no acepta como clave | Agrega en `tblCorreos` la columna `Fila` = `=ROW()-ROW(tblCorreos[[#Headers],[IdCorreo]])` · en el desencadenador **Configuración → Control de simultaneidad → Grado de paralelismo 1** · cambia 5.6 por **Enumerar filas presentes en una tabla** con *Ordenar por* `Fila desc` y *Número superior* `1` |

---

## 11. Fórmulas en Excel en español

En Excel configurado para México el separador es la coma (`,`). Si Excel marca error de sintaxis, cambia las comas que separan argumentos por punto y coma (`;`).

**tblCorreos**

| Columna | Fórmula |
|---|---|
| BO | `=LET(t,TEXTODESPUES([@Asunto],"BO#",,,,""),SI(t="","",TEXTOANTES(ESPACIOS(t)&" "," ")))` |
| RDD | `=LET(t,TEXTODESPUES([@Asunto],"RDD ",,,,""),SI(t="","",ESPACIOS(TEXTOANTES(t&",",","))))` |
| DiasRDD | `=SI([@RDD]="","",LET(p,DIVIDIRTEXTO([@RDD],"-"),y,VALOR(INDICE(p,1,3)),f,FECHA(SI(y<100,2000+y,y),(HALLAR(INDICE(p,1,2),"JANFEBMARAPRMAYJUNJULAUGSEPOCTNOVDEC")+2)/3,VALOR(INDICE(p,1,1))),f-HOY()))` |
| Tipo | `=SI(O(IZQUIERDA(ESPACIOS([@Asunto]),3)="RE:",IZQUIERDA(ESPACIOS([@Asunto]),3)="FW:",IZQUIERDA(ESPACIOS([@Asunto]),4)="FWD:",ESNUMERO(HALLAR("[Ext]",[@Asunto])),ESNUMERO(HALLAR("thread::",[@Asunto])),[@Adjuntos]=VERDADERO,[@Adjuntos]="true",NO(ESNUMERO(HALLAR("Item [",[@Cuerpo])))),"COMPLEJO","ESTANDAR")` |
| Articulos | `=(LARGO([@Cuerpo])-LARGO(SUSTITUIR([@Cuerpo],"Item [","")))/6` |
| Faltantes | `=SI(O([@Articulos]=0,[@Tipo]="COMPLEJO"),0,SI.ERROR(LET(partes,EXCLUIR(DIVIDIRTEXTO([@Cuerpo],"Item ["),,1),art,ESPACIOS(TEXTOANTES(partes,"]")),cant,VALOR(ESPACIOS(TEXTOANTES(TEXTODESPUES(partes,"Qty ["),"]"))),inv,SUMAR.SI.CONJUNTO(tblOH[OH],tblOH[Articulo],art),SUMA(--(inv<cant))),-1))` |
| Resultado | `=SI([@BO]="","ROJO",SI(O([@Tipo]="COMPLEJO",[@Faltantes]<0),"NARANJA",SI([@Faltantes]>0,"ROJO","VERDE")))` |
| Prioridad | `=SI(Y([@Resultado]="ROJO",ESNUMERO([@DiasRDD])),SI([@DiasRDD]<=7,"CRITICA","NORMAL"),"NORMAL")` |
| Detalle | `=SI(O([@Articulos]=0,[@Tipo]="COMPLEJO"),"<p>Correo complejo: revisión manual.</p>",SI.ERROR(LET(partes,EXCLUIR(DIVIDIRTEXTO([@Cuerpo],"Item ["),,1),art,ESPACIOS(TEXTOANTES(partes,"]")),cant,VALOR(ESPACIOS(TEXTOANTES(TEXTODESPUES(partes,"Qty ["),"]"))),inv,SUMAR.SI.CONJUNTO(tblOH[OH],tblOH[Articulo],art),filas,"<tr><td>"&art&"</td><td align=right>"&cant&"</td><td align=right>"&inv&"</td><td>"&SI(inv>=cant,"OK","FALTAN "&(cant-inv))&"</td></tr>","<table border=1 cellpadding=4 cellspacing=0><tr><th>Artículo</th><th>Pide</th><th>OH</th><th>Estado</th></tr>"&UNIRCADENAS("",VERDADERO,filas)&"</table>"),"<p>Formato no reconocido.</p>"))` |
| Etiqueta | `="["&[@Resultado]&"] BO# "&SI([@BO]="","SIN BO#",[@BO])&SI([@Prioridad]="CRITICA"," · CRITICA","")&" · "&[@Asunto]` |

**tblRespuestas**

| Columna | Fórmula |
|---|---|
| Folio | `=FILA()-FILA(tblRespuestas[[#Encabezados],[Folio]])` |
| EnviarUTC | `=SI([@EnviarEl]="","",[@EnviarEl]+Config!$B$2/24)` |
| Para | `=BUSCARX([@BO],tblCorreos[BO],tblCorreos[Remitente],"",0,-1)` |
| Asunto | `="RE: "&BUSCARX([@BO],tblCorreos[BO],tblCorreos[Asunto],"",0,-1)` |
| Cuerpo | `=LET(p,BUSCARX([@Plantilla],tblPlantillas[Nombre],tblPlantillas[Cuerpo],""),d,BUSCARX([@BO],tblCorreos[BO],tblCorreos[Detalle],"",0,-1),SUSTITUIR(SUSTITUIR(SUSTITUIR(p,CARACTER(10),"<br>"),"{BO}",[@BO]),"{DETALLE}",d))` |

**Buscar**

| Celda | Fórmula |
|---|---|
| A5 | `=LET(q,ESPACIOS($B$2),modo,$B$3,art,tblOH[Articulo]&"",m,SI(modo="Artículo",art=q,SI(modo="Contiene",ESNUMERO(HALLAR(q,art)),ESNUMERO(HALLAR(q,tblOH[Descripcion])))),SI(q="","",FILTRAR(tblOH,m,"Sin resultados")))` |
| E2 | `=SI($B$2="","",SUMAR.SI.CONJUNTO(tblOH[OH],tblOH[Articulo],ESPACIOS($B$2)))` |
| H6 | `=SI(G6="","",SUMAR.SI.CONJUNTO(tblOH[OH],tblOH[Articulo],G6))` |
| I6 | `=SI(G6="","",SI(CONTAR.SI.CONJUNTO(tblOH[Articulo],G6)=0,"NO EXISTE","OK"))` |

Validación de datos en español: `=INDIRECTO("tblPlantillas[Nombre]")` y `=INDIRECTO("tblCorreos[BO]")`.

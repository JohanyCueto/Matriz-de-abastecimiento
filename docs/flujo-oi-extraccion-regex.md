# Flujo "Extraer OI PDF a Excel" — patrones de expresión regular

Este documento diseña los patrones de regex para el nuevo flujo de Power
Automate Desktop que procesa **Órdenes de Importación (OI)**, siguiendo la
estrategia ya acordada: duplicar el flujo "Extraer OC PDF a Excel", apuntarlo
a la carpeta de OI, y cambiar solo la extracción (regex) — mismo Excel
destino (`tbl_IngresosProgramados.xlsx`, hoja `ProgramacionOC`), mismas
columnas, mismo "Pendiente revisión" como estado de carga.

Está basado en un solo PDF de ejemplo (OI 2600002272, proveedor EMPACANDO
S.A.S., 1 ítem con 1 entrega). Donde el diseño depende de algo que ese PDF
no muestra (varios ítems, varias entregas por ítem), lo marco como
**pendiente de confirmar** — ver la sección final.

## Estructura del documento OI (según el ejemplo)

```
Orden de Importacion Nro. :  2600002272        Fec.Emision 31/07/2026
Proveedor: EMPACANDO S.A.S.
Cond. de Pago : CREDITO 60 DIAS                Comprador JOHANY STHEFANI CUETO MALPARTI
Nº Requerimiento: 2600002186,

It  Codigo      Descripción                        U/M  Cantidad        Valor Unit.  Total US$
01  140209005   ALVEOLOS PREFORM. GINO-FUNGISTAT... und  450,000.00000  0.03860      17,370.00
    C.C.: - 90220  Rubro: - 020031    1ra.Entrega  28/08/2026  450000.00000  und

Almacen Destino: AME CUARENTENA ALMACEN M+I DE GRAN VOLUMEN
...
EXW  US$  17,370.00
```

Cada ítem trae su fila de código/cantidad/precio, y debajo una o más líneas
de entrega ("1ra.Entrega", "2da.Entrega", ...) con fecha y cantidad de esa
entrega puntual.

## Patrones a nivel de cabecera (una sola vez por PDF)

Todos en sintaxis .NET (la que usa Power Automate Desktop en "Extraer texto
mediante expresión regular" / "Text - Parse text"), con grupos con nombre.

| Campo | Patrón | Columna en `ProgramacionOC` |
|---|---|---|
| N° de OI | `Orden de Importacion Nro\.\s*:\s*(?<numeroOI>\d+)` | **OC** (ver decisión abajo) |
| Fecha de emisión | `Fec\.\s*Emision\s*(?<fechaEmision>\d{2}/\d{2}/\d{4})` | Fecha emisión OC |
| Proveedor | `Proveedor\s*:\s*(?<proveedor>[^\r\n]+)` | Proveedor |
| Comprador | `Comprador\s+(?<comprador>.+?)(?=\r?\n\|Cond\.\|R\.U\.C\.\|$)` | Comprador |
| Condición de pago | `Cond\.\s*de\s*Pago\s*:\s*(?<condicionPago>.+?)(?=\r?\n\|Pais\|F\.\s*de\s*Pago\|$)` | Condición de pago |
| Almacén destino | `Almacen\s*Destino\s*:\s*(?<almacenDestino>[^\r\n]+)` | Almacén destino |
| Moneda (símbolo) | `(?<simboloMoneda>US\$\|S/\.?)` | Moneda *(traducir símbolo → texto: "US$"→"USD", "S/"→"PEN", con un If-Else después del regex, igual que probablemente ya hace el flujo de OC)* |

Notas:

- `\s*` en .NET ya matchea saltos de línea, así que estos patrones funcionan
  tanto si el valor está pegado a la etiqueta en la misma línea como si el
  extractor de texto lo deja en la línea siguiente (pasa seguido con PDFs
  generados desde formularios).
- **Proveedor** y **Comprador** hay que probarlos contra el texto real que
  entrega la acción "Leer texto de PDF" de PAD antes de darlos por buenos:
  en el PDF de ejemplo cada uno queda en su propia línea, pero si el
  extractor de PAD llega a pegar dos etiquetas en una sola línea de texto
  (pasa con PDFs de formulario donde el layout se aplana), el lookahead
  `(?=\r?\n|...)` evita que la captura se coma la etiqueta siguiente.
- **Nº Requerimiento** y **Solicitante** aparecen en el PDF pero no tienen
  columna equivalente en `ProgramacionOC`. Los dejo fuera del mapeo; si
  Johany los quiere guardar, la opción más simple es meterlos en
  "Observaciones" al crear la fila.

## Patrón por ítem (se repite, uno por SKU dentro del PDF)

```
(?m)^\s*(?<it>\d{1,3})\s+(?<sku>\d{5,10})\s+(?<descripcion>.+?)\s+(?<um>[A-Za-zÁÉÍÓÚáéíóúñÑ./]+)\s+(?<cantidad>[\d,]+\.\d+)\s+(?<precioUnitario>[\d,]+\.\d+)\s+(?<totalItem>[\d,]+\.\d+)\s*$
```

Usar con la opción "Multilínea" activada y con la acción que devuelve
**todas las coincidencias** (loop de matches), igual que para los ítems de
la OC.

Mapeo:

- `sku` → **SKU**
- `descripcion` → **Descripción**
- `precioUnitario` → **Precio unitario**
- `cantidad` (cantidad total del ítem en la OI) — **no** es directamente
  "Cant. Programada": esa columna es por entrega, no por ítem. Ver el
  patrón de entrega abajo.

Ojo con `descripcion`: en el ejemplo la descripción trae pegada la palabra
"Ovulo" (forma farmacéutica) antes del U/M "und" — el `.+?` no greedy más el
ancla en el U/M seguido de los tres números al final de línea resuelve eso,
pero si algún ítem tiene una descripción que ocupe dos líneas (pasa en
otros ERPs cuando el nombre del producto es largo), este patrón no la va a
capturar completa. Con un solo ítem de ejemplo no hay forma de saberlo.

## Patrón por entrega (se repite, uno por cada "N.Entrega" bajo un ítem)

```
(?m)^\s*(?<ordinal>\d+)[a-zA-Zº°]{0,3}\.?\s*Entrega\s+(?<fechaEntrega>\d{2}/\d{2}/\d{4})\s+(?<cantidadEntrega>[\d,]+\.\d+)\s+(?<umEntrega>\w+)
```

Cubre "1ra.Entrega", "2da.Entrega", "3ra.Entrega", etc. (el sufijo en
español varía y `[a-zA-Zº°]{0,3}` lo absorbe sin tener que enumerar cada
caso).

Mapeo:

- `ordinal` → **N° entrega** (formatear como en OC, ej. `"E" & Text(ordinal, "00")` → "E01") y también → **Orden entrega**
- `fechaEntrega` → **Fecha programada de ingreso**
- `cantidadEntrega` → **Cant. Programada**
- `cantidadEntrega * precioUnitario` (calculado, no regex) → **Valor entrega**

Como cada línea de entrega va inmediatamente debajo de su ítem, en el flujo
conviene recortar el texto en bloques por ítem primero (desde una
coincidencia de "código de ítem" hasta la siguiente, o hasta "Almacen
Destino:") y correr el patrón de entrega solo dentro de ese bloque — así
cada entrega queda asociada al ítem correcto aunque haya varios ítems con
varias entregas cada uno.

## Decisiones a confirmar con Johany antes de dejarlo en producción

1. **¿El número de OI va en la columna "OC"?** Es la forma más simple de
   reusar el mismo flujo de cálculo (`programacion_oc` cruza por `oc` +
   `sku` contra `ingresos_sistema`), y no hay problema de tamaño de dato
   (la columna es `bigint` en Supabase, así que 2,600,002,272 entra sin
   problema). Pero mezcla en una sola columna dos numeraciones distintas
   (OC y OI). Si Johany prefiere distinguirlas a simple vista en el Excel,
   la alternativa es agregar una columna "Tipo documento" (OC/OI) — pero
   eso sí requiere tocar `PROGRAMACION_COLUMNS` en `app/src/lib/schema.js`
   y el esquema de Supabase, no es solo cambio de regex.
2. **Composición del "ID entrega".** Es la llave con la que la app hace
   `upsert` (`app/src/lib/importer.js`), así que un choque entre un ID de
   OC y un ID de OI pisaría datos. Recomiendo usar el mismo formato que ya
   usa el flujo de OC pero con un prefijo que marque el origen, ej.
   `"OI-" & numeroOI & "-" & sku & "-E" & Text(ordinal, "00")`. Hace falta
   revisar cómo arma el ID el flujo de OC actual para calcar el mismo
   formato (separadores, ceros a la izquierda) y solo cambiar el prefijo.
3. **PDF de ejemplo con un solo ítem y una sola entrega.** Los patrones de
   ítem y entrega están escritos para repetirse (loop de matches), pero
   nunca se probaron contra un OI real con más de un SKU o con un SKU que
   tenga varias entregas (E01, E02...). Antes de correr el flujo en
   producción conviene probarlo con un PDF así — si Johany tiene uno a
   mano, compartirlo permite ajustar los patrones con un caso real en vez
   de una suposición.
4. **Moneda.** El PDF de ejemplo está en dólares (US$). No se sabe si
   existen OI de este proveedor en soles u otra moneda; el patrón de
   moneda cubre "US$" y "S/", pero convendría confirmar si el flujo de OC
   ya maneja esto con lógica fija (ej. "todas las OC son en USD") para
   copiar el mismo criterio.

## Cómo enchufarlo en Power Automate Desktop

1. Duplicar el flujo "Extraer OC PDF a Excel" → renombrarlo (ej. "Extraer
   OI PDF a Excel").
2. Cambiar la carpeta de origen (ej. `01_OI_PDF_Pendientes`) y la de
   destino tras procesar (ej. `02_OI_Procesadas`) — mismo patrón de
   carpetas que OC, para no romper la costumbre.
3. Reemplazar cada acción de regex por las de este documento, manteniendo
   la misma hoja (`ProgramacionOC`) y el mismo "Estado carga" =
   "Pendiente revisión".
4. Dejar "Archivo origen" con el nombre del PDF de OI (igual que OC), para
   poder rastrear de qué documento salió cada fila.
5. Probar con el PDF de ejemplo primero, verificar fila por fila contra lo
   que muestra el PDF, y recién después soltarlo sobre la carpeta real.

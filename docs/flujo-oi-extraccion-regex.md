# Flujo "Extraer OI PDF a Excel" — patrones de expresión regular

Este documento diseña los patrones de regex para el nuevo flujo de Power
Automate Desktop que procesa **Órdenes de Importación (OI)**, siguiendo la
estrategia ya acordada: duplicar el flujo "Extraer OC PDF a Excel", apuntarlo
a la carpeta de OI, y cambiar solo la extracción (regex) — mismo Excel
destino (`tbl_IngresosProgramados.xlsx`, hoja `ProgramacionOC`), mismas
columnas, mismo "Pendiente revisión" como estado de carga.

Está basado en un solo PDF de ejemplo (OI 2600002272, proveedor EMPACANDO
S.A.S., 1 ítem con 1 entrega), pero Johany confirmó que una OI sí puede
traer varios ítems/SKU (el ejemplo solo muestra uno porque esa OI puntual
tenía uno). Todas las decisiones de diseño quedaron confirmadas — ver
"Decisiones confirmadas" al final.

**Actualizado tras ver el flujo real de OC en Power Automate Desktop**
(capturas de pantalla de las 48 acciones): esto confirmó varias cosas y
corrigió otras que este documento había asumido sin verlo. Los cambios más
importantes:

- El flujo de OC **no arma "ID entrega" con una acción de Power Automate**
  — esa columna (y "Valor entrega") son fórmulas que ya existen en el
  Excel, calculadas solas a partir de lo que el flujo sí escribe (OC, SKU,
  N° entrega). El flujo de OI no necesita ninguna acción para esto: solo
  tiene que escribir en las mismas columnas B, J y O, y la fórmula hace el
  resto. Ver la sección "ID entrega y Valor entrega" más abajo.
- El número de OC se extrae con el patrón `(26|27)\d{8}` — el mismo formato
  de 10 dígitos que tiene el número de OI (2600002272). Johany confirmó que
  la numeración de documentos en su ERP es global (nunca se repite el mismo
  número entre una OC y una OI), así que no hace falta ningún prefijo ni
  tocar la fórmula de "ID entrega": el número solo ya es único.
- El flujo de OC deja "Comprador" y "Almacén destino" en blanco (se
  completan a mano en la revisión). Johany pidió que el flujo de OI sí los
  capture automáticamente, ya que su PDF los trae limpios y etiquetados —
  quedan agregados al mapeo de cabecera.

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
de entrega ("1ra.Entrega", "2da.Entrega", ...) con fecha y cantidad. Lo
normal en una OI es que sea una sola entrega por ítem, pero Johany aclaró
que ocasionalmente puede venir partida en varias — así que el patrón sigue
siendo el mismo loop repetible que usa la OC, no uno que asuma una sola
entrega.

## Patrones a nivel de cabecera (una sola vez por PDF)

Todos en sintaxis .NET (la que usa Power Automate Desktop en "Extraer texto
mediante expresión regular" / "Text - Parse text"), con grupos con nombre.

| Campo | Patrón | Columna en `ProgramacionOC` |
|---|---|---|
| N° de OI | `Orden de Importacion Nro\.\s*:\s*(?<numeroOI>\d+)` | **B — OC** (confirmado: la OI va en la misma columna, numeración global, sin riesgo de choque) |
| Fecha de emisión | `Fec\.\s*Emision\s*(?<fechaEmision>\d{2}/\d{2}/\d{4})` | **A** — Fecha emisión OC |
| Proveedor | `Proveedor\s*:\s*(?<proveedor>[^\r\n]+)` | **C** — Proveedor |
| Comprador | `Comprador\s+(?<comprador>.+?)(?=\r?\n\|Cond\.\|R\.U\.C\.\|$)` | **D** — Comprador *(OC lo deja en blanco; Johany pidió capturarlo para OI)* |
| Condición de pago | `Cond\.\s*de\s*Pago\s*:\s*(?<condicionPagoTexto>.+?)(?=\r?\n\|Pais\|F\.\s*de\s*Pago\|$)`, y sobre ese resultado un segundo análisis con `(CREDITO\s+\d+\s+DIAS\|CRÉDITO\s+\d+\s+DÍAS\|CONTADO)` para quedarse con la forma estructurada — igual que hace el flujo de OC, en vez de guardar el texto crudo | **F** — Condición de pago |
| Almacén destino | `Almacen\s*Destino\s*:\s*(?<almacenDestino>[^\r\n]+)` | **T** — Almacén destino *(OC lo deja en blanco; Johany pidió capturarlo para OI)* |
| Moneda (símbolo) | `(?<simboloMoneda>US\$\|S/\.?\|€\|EUR)` | **E** — Moneda *(traducir símbolo → texto: "US$"→"USD", "S/"→"PEN", "€"/"EUR"→"EUR", con un If-Else después del regex — mismo criterio que usa OC, que también traduce el símbolo antes de escribirlo)* |

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
- **Moneda:** Johany confirmó que las OI casi siempre vienen en dólares, y
  rara vez en euros — nunca en soles. El patrón incluye "S/" solo por si
  algún proveedor extranjero llegara a facturar así, pero en la práctica
  solo debería activarse "US$" o "€"/"EUR".

## Patrón por ítem (se repite, uno por SKU dentro del PDF)

```
(?m)^\s*(?<it>\d{1,3})\s+(?<sku>\d{5,10})\s+(?<descripcion>.+?)\s+(?<um>[A-Za-zÁÉÍÓÚáéíóúñÑ./]+)\s+(?<cantidad>[\d,]+\.\d+)\s+(?<precioUnitario>[\d,]+\.\d+)\s+(?<totalItem>[\d,]+\.\d+)\s*$
```

Usar con la opción "Multilínea" activada y con la acción que devuelve
**todas las coincidencias** (loop de matches), igual que para los ítems de
la OC.

Mapeo:

- `sku` → **J — SKU**
- `descripcion` → **K — Descripción**
- `precioUnitario` → **L — Precio unitario**
- `cantidad` (cantidad total del ítem en la OI) — **no** es directamente
  "Cant. Programada": esa columna es por entrega, no por ítem. Ver el
  patrón de entrega abajo. *(Confirmado contra el flujo de OC: ahí también
  "Cant. Programada" sale de la línea de entrega, no de la línea del
  ítem.)*

Ojo con `descripcion`: en el ejemplo la descripción trae pegada la palabra
"Ovulo" (forma farmacéutica) antes del U/M "und" — el `.+?` no greedy más el
ancla en el U/M seguido de los tres números al final de línea resuelve eso,
pero si algún ítem tiene una descripción que ocupe dos líneas (pasa en
otros ERPs cuando el nombre del producto es largo), este patrón no la va a
capturar completa. Con un solo ítem de ejemplo no hay forma de saberlo.

## Patrón de entrega (se repite, uno por cada "N.Entrega" bajo un ítem)

Lo normal es una sola entrega por ítem, pero Johany avisó que **igual
podría presentarse el caso de una OI partida en varias entregas**, así que
el patrón se mantiene como loop de "todas las coincidencias" — igual que en
la OC — en vez de asumir un único E01. Cuando solo hay una entrega, el loop
simplemente encuentra una sola coincidencia y se comporta igual que si
estuviera "hardcodeado"; la diferencia es que no se rompe el día que
aparezca una OI con dos o tres.

```
(?m)^\s*(?<ordinal>\d+)[a-zA-Zº°]{0,3}\.?\s*Entrega\s+(?<fechaEntrega>\d{2}/\d{2}/\d{4})\s+(?<cantidadEntrega>[\d,]+\.\d+)\s+(?<umEntrega>\w+)
```

Cubre "1ra.Entrega", "2da.Entrega", "3ra.Entrega", etc. (el sufijo en
español varía y `[a-zA-Zº°]{0,3}` lo absorbe sin tener que enumerar cada
caso).

Mapeo:

- `"E" & Text(ordinal, "00")` → **O — N° entrega** (ej. "E01", "E02") —
  igual que OC, que también escribe el código de entrega ya formateado
  como "E01" en esta columna (aunque en el PDF de OC aparece literal como
  "(E01)" y en el de OI hay que armarlo a partir del ordinal de "1ra.",
  "2da.", etc.)
- `fechaEntrega` → **Q — Fecha programada de ingreso**
- `cantidadEntrega` → **M — Cant. Programada**
- **Orden entrega (W)** y **Valor entrega (N)** — el flujo de OC no las
  escribe (ver la sección siguiente); OI hace lo mismo, por consistencia.

Como cada línea de entrega va inmediatamente debajo de su ítem, en el flujo
conviene recortar el texto en bloques por ítem primero (desde una
coincidencia de "código de ítem" hasta la siguiente, o hasta "Almacen
Destino:") y correr el patrón de entrega solo dentro de ese bloque — así
cada entrega queda asociada al ítem correcto si la OI trae varios SKU.
*(Esto es exactamente lo que hace el flujo de OC: recorta el texto con
`(?m)^\d{2}\s\d{9}.*?(?=^\d{2}\s\d{9}|Almacen Destino:)` y corre el patrón
de entrega dentro de cada bloque.)*

## ID entrega y Valor entrega: no los escribe Power Automate

Revisando las 48 acciones del flujo de OC, las columnas **P (ID entrega)**
y **N (Valor entrega)** nunca aparecen en ninguna acción "Escribir en la
hoja de cálculo de Excel". Son **fórmulas que ya existen en el Excel**
(`tbl_IngresosProgramados.xlsx`), calculadas a partir de las columnas que
sí llena el flujo — probablemente algo como `=B&"-"&J&"-"&O` para el ID y
`=L*M` para el valor.

Esto simplifica el flujo de OI: no hace falta ninguna acción de
"Establecer variable" ni concatenación para armar el ID. Basta con escribir
en las columnas B (OC/OI), J (SKU) y O (N° entrega) igual que hace OC, y la
fórmula de la hoja arma el ID sola.

Johany confirmó que la numeración de documentos en el ERP es **global**
(un número de OC y uno de OI nunca coinciden), así que no hace falta tocar
la fórmula ni agregar ningún prefijo "OI-" — el número del documento ya es
único por sí solo, sea OC o OI.

## Decisiones confirmadas por Johany

1. **El número de OI va en la columna "OC".** Reusa el mismo cruce que ya
   hace `programacion_oc` (por `oc` + `sku` contra `ingresos_sistema`), y no
   hay problema de tamaño de dato: la columna es `bigint` en Supabase, así
   que 2,600,002,272 entra sin problema.
2. **"ID entrega" y "Valor entrega" no se calculan en Power Automate — son
   fórmulas del Excel.** Al revisar el flujo real de OC se confirmó que
   esas dos columnas nunca se escriben desde PAD; se recalculan solas a
   partir de OC/SKU/N° entrega. Johany confirmó que la numeración de
   documentos del ERP es global (una OC y una OI nunca comparten número),
   así que no hace falta ningún prefijo "OI-" ni tocar la fórmula — queda
   sin cambios, ver la sección "ID entrega y Valor entrega" más arriba.
3. **Lo normal es una sola entrega por ítem, pero ocasionalmente puede venir
   partida en varias** (Johany lo confirmó explícitamente). El patrón de
   entrega no asume una única "1ra.Entrega": queda como loop repetible
   igual que en OC, así que si algún día aparece una OI con "1ra." y "2da."
   para el mismo SKU, se procesa sin cambios.
4. **Moneda: casi siempre dólares, rara vez euros, nunca soles.** El patrón
   de moneda ya cubre "US$" y "€"/"EUR".
5. **Una OI sí puede traer varios ítems/SKU**, no solo el caso de un ítem
   del PDF de ejemplo. Esto confirma que el patrón de ítem tiene que
   quedarse como loop de "todas las coincidencias" (ya estaba escrito así)
   y, más importante, que el recorte del texto en bloques por ítem antes de
   buscar las entregas (mencionado al final de la sección anterior) no es
   opcional: sin eso, una OI con 2+ ítems mezclaría las entregas del
   ítem equivocado.
6. **El flujo de OI sí debe capturar "Comprador" y "Almacén destino"**,
   aunque el flujo de OC los deje en blanco. Johany prefirió aprovechar que
   el PDF de OI los trae limpios y etiquetados en vez de mantener paridad
   estricta con OC en este punto — quedan en el mapeo de cabecera con sus
   propios patrones.

### Qué falta para probarlo con confianza

El diseño ya cubre el caso general (varios ítems, cada uno con una o más
entregas), pero sigue basado en un solo PDF real que tenía un ítem y una
entrega. Antes de soltar el flujo en producción, lo más seguro es probarlo
contra un PDF real con varios ítems (y, si es posible, alguno con más de
una entrega) para confirmar que el recorte por bloques y los patrones no
se rompen con separaciones o formatos que el ejemplo actual no muestra. Si
Johany tiene uno a mano, compartirlo ayuda a cerrar esto con un caso real
en vez de una suposición.

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
5. Incluir desde el inicio el ajuste de "carpeta de cotizaciones por
   documento" (crear una carpeta con el nombre del PDF y mover el PDF
   adentro, en vez de dejarlo suelto en `02_OI_Procesadas`) — ver
   `docs/carpeta-cotizaciones-oc-oi.md` para el detalle de las acciones.
   Se aplica primero al flujo de OC y, cuando esté probado ahí, se copia
   igual al de OI.
6. Probar con el PDF de ejemplo primero, verificar fila por fila contra lo
   que muestra el PDF, y recién después soltarlo sobre la carpeta real.

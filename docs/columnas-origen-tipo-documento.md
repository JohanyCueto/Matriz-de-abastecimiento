# Columnas "Origen" y "Tipo documento" (OC/OI)

Cambio pedido por Johany para poder mezclar OC y OI en el mismo Excel
(`tbl_IngresosProgramados.xlsx`, hoja `ProgramacionOC`) y distinguirlas a
simple vista.

## Qué cambió

- La columna **"OC"** pasó a llamarse **"OC/OI"** (mismo dato: el número de
  documento, sea OC u OI — sin cambios de tipo, sigue siendo el mismo
  campo `oc`).
- Se agregó la columna **"Origen"**, justo al lado de "OC/OI": vale
  **"Local"** cuando el documento es una OC, **"Importado"** cuando es una
  OI.
- Al revisar el Excel real que Johany ya usa, apareció una columna
  **"Tipo documento"** (con valores literales "OC"/"OI") que no estaba
  contemplada en el código — el importador esperaba ahí "Estado carga" y
  la ignoraba silenciosamente. Como "Origen" se calcula a partir de esta
  columna, se aprovechó para que la app también la reconozca y la guarde
  (campo `tipo_documento`), en vez de seguir descartándola.

## Por qué "Origen" quedó como valor fijo y no como fórmula de Excel

En el archivo que Johany ya usa, "Origen" se calculó una vez a partir de
"Tipo documento" (Local/Importado según el valor de esa fila) y se dejó
como texto plano, no como fórmula `=SI(...)`. Dos razones:

1. El entorno usado para editar el archivo no pudo recalcular fórmulas de
   Excel de forma confiable (LibreOffice se colgaba incluso con el archivo
   original sin tocar), y una fórmula sin valor todavía calculado corre el
   riesgo de que el importador de la app (que lee con SheetJS) la lea como
   texto de fórmula en vez del resultado, si el archivo se importa antes
   de abrirse alguna vez en Excel de verdad.
2. Hacia adelante, tanto el flujo de OC como el de OI en Power Automate
   van a escribir "Tipo documento" y "Origen" directamente como texto fijo
   (igual que ya hacen con "Estado carga" = "Pendiente revisión"), no como
   fórmula — así que una fórmula en el Excel hoy no aporta nada que no
   vaya a venir ya resuelto del flujo mañana.

## Archivos de código modificados

- `app/src/lib/schema.js` — `PROGRAMACION_COLUMNS` y `EXPORT_COLUMNS`:
  cabecera `OC` → `OC/OI`, se agregan `Origen` (`origen`) y
  `Tipo documento` (`tipo_documento`).
- `app/src/App.jsx` — la tabla del dashboard ahora muestra "OC/OI" en vez
  de "OC", con una columna "Origen" al lado (etiqueta azul si es
  "Importado", gris si es "Local"). También se actualizó el placeholder
  del buscador.
- `supabase/schema.sql` — se agregaron las columnas `origen` y
  `tipo_documento` (`text`, nullable) a la definición de `programacion_oc`.

## Pendiente: correr esto en Supabase

`schema.sql` solo define cómo se crea la tabla **desde cero** — no altera
una tabla que ya existe. Como la tabla `programacion_oc` de Johany ya está
en producción con datos, hay que agregar las columnas a mano, una sola vez,
desde el SQL Editor de Supabase:

```sql
alter table programacion_oc add column if not exists origen text;
alter table programacion_oc add column if not exists tipo_documento text;
```

Es una operación aditiva (no borra ni modifica nada existente), pero debe
ejecutarse antes de volver a importar el Excel actualizado — si no, el
importador va a fallar al intentar guardar esas dos columnas nuevas en una
tabla que todavía no las tiene.

## El Excel que Johany subió

Se migró un ejemplo real: `tbl_IngresosProgramados.xlsx` (592 filas), con
el resultado verificado:

- Encabezado "OC" → "OC/OI" (columna B)
- Nueva columna "Origen" insertada justo al lado (columna C), con 578
  filas "Local" y 14 "Importado" — coincide exactamente con la
  distribución de "Tipo documento" (columna J tras el corrimiento) que ya
  traía el archivo.
- La tabla estructurada de Excel (`ProgramacionOC`, con autofiltro) se
  reconstruyó para incluir la columna nueva sin romperse.

Nota aparte: este archivo de ejemplo no traía la hoja `IngresosSistema`
que el importador de la app también espera — si es el archivo real que se
va a subir, hay que confirmar que sí la tenga (puede que se haya
recortado solo para compartirlo).

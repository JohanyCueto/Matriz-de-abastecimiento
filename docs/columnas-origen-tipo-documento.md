# Columna "Origen" (Local / Importado)

Johany ya tiene una columna **"Tipo documento"** en su Excel
(`tbl_IngresosProgramados.xlsx`, hoja `ProgramacionOC`) con valores "OC" u
"OI". Pidió una forma de ver también "Local"/"Importado" sin tener que
tocar ni mantener su Excel a mano.

## Cómo funciona

**No hace falta cambiar nada en el Excel de Johany.** El importador
(`app/src/lib/importer.js`) ahora:

1. Lee la columna "Tipo documento" que ya existe en el Excel (antes no
   estaba mapeada en `PROGRAMACION_COLUMNS`, así que se ignoraba).
2. Calcula sola la columna `origen` a partir de ese valor: "OC" → "Local",
   "OI" → "Importado". Esto pasa en código, en cada importación — no es
   una columna que Johany tenga que llenar ni una fórmula de Excel.

El dashboard (`app/src/App.jsx`) ahora muestra "Origen" como columna junto
a "OC", con una etiqueta azul si es "Importado" y gris si es "Local".

## Archivos modificados

- `app/src/lib/schema.js` — se agrega `Tipo documento` a
  `PROGRAMACION_COLUMNS` (para que el importador la lea del Excel) y
  `Tipo documento` / `Origen` a `EXPORT_COLUMNS` (para que el botón
  Exportar Excel también las incluya).
- `app/src/lib/importer.js` — calcula `origen` a partir de
  `tipo_documento` al preparar cada entrega.
- `app/src/App.jsx` — nueva columna "Origen" en la tabla del dashboard.
- `supabase/schema.sql` — nuevas columnas `tipo_documento` y `origen`
  (`text`, nullable) en `programacion_oc`.

## Pendiente: correr esto en Supabase

`schema.sql` solo define cómo se crea la tabla **desde cero** — no altera
una tabla que ya existe. Como `programacion_oc` ya está en producción con
datos, hay que agregar las columnas una sola vez desde el SQL Editor de
Supabase, antes de volver a importar:

```sql
alter table programacion_oc add column if not exists tipo_documento text;
alter table programacion_oc add column if not exists origen text;
```

Es aditivo — no borra ni modifica ninguna fila existente. Si se importa el
Excel antes de correr esto, la importación va a fallar al intentar guardar
esas dos columnas nuevas en una tabla que todavía no las tiene.

## Nota sobre la hoja "IngresosSistema"

Confirmado con Johany: solo se sube la hoja `ProgramacionOC` por el botón
**Importar Excel** — los ingresos van aparte, por el botón **Importar
Ingresos** (`ImportIngresosButton.jsx` / `importarIngresos` en
`importer.js`). Esto ya está soportado desde el commit `35880b1`
("Importar Excel acepta archivos sin la hoja IngresosSistema") — no hace
falta ningún cambio adicional para este flujo.

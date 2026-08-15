# Seguimiento de materiales de empaque

Aplicación interna de Roxfarma para el seguimiento de OC de materiales de
empaque. La usan compras, planeamiento y almacén.

## Decisiones fijas del proyecto

- **Sin login.** Cualquiera con el link puede leer y editar. Fue decisión
  explícita de Johany: simplicidad por encima de control de acceso.
- **Todo gratis**: Supabase (base de datos) y Vercel (hosting), ambos en su
  capa gratuita.
- El código de la aplicación vive en `app/` (React + Vite). No usa Tailwind,
  el estilo está en `app/src/App.css`, heredado del prototipo original.
- El esquema de la base de datos vive en `supabase/schema.sql`.

## Cómo se actualizan los datos

Los datos "de verdad" viven en Supabase, no en el Excel. El Excel de Johany
(`ProgramacionOC` + `IngresosSistema`) se sube desde el botón **Importar
Excel** de la app (`app/src/lib/importer.js`), y:

- `programacion_oc` se actualiza por `upsert`, usando la columna **ID
  entrega** como llave. Los campos de gestión (`estado_gestion`,
  `motivo_demora`, `responsable_accion`, `criticidad`, `observaciones`,
  `cierre_manual`, `motivo_cierre`) **no se pisan** en filas que ya
  existían: esos los maneja la gente desde la app, no el Excel.
- `fecha_programada_ingreso` también queda protegida una vez que la fila ya
  existe: solo cambia si alguien reprograma desde la app (que además deja
  historial). Si no fuera así, resubir un Excel viejo podría borrar una
  reprogramación ya hecha por el equipo.
- `ingresos_sistema` solo agrega filas nuevas (dedup por `numero_analisis`),
  nunca se borran ni se pisan las anteriores.
- Cada importación recalcula `cant_ingresada`, `saldo_pendiente`,
  `pct_ingreso`, `estado_ingreso`, `fecha_real_ingreso` y `dias_atraso` en
  `programacion_oc`, cruzando por OC + SKU contra todos los eventos de
  `ingresos_sistema` acumulados hasta la fecha. El reparto es en orden: la
  entrega más antigua (según `orden_entrega`, ej. E01) se llena primero,
  porque así entregan los proveedores.
- `dias_atraso` nunca es negativo: si llega antes de lo programado, queda en
  0 (así lo calcula también el Excel original de Johany).
- El Excel de Johany a veces trae la misma entrega duplicada (mismo OC +
  SKU + N° de entrega, cargada desde dos archivos de origen). El importador
  deduplica por `ID entrega` antes de calcular, quedándose con una copia.
  Lo mismo pasa con `ingresos_sistema`: deduplica por `numero_analisis`.
- El botón **Exportar Excel** de la app (`app/src/lib/exporter.js`) genera
  una copia nueva de `programacion_oc` en el mismo formato del Excel
  original, con los datos y el seguimiento más al día. Es de un solo
  sentido (base de datos → Excel): el archivo de Johany no se actualiza
  solo, porque vive en su computadora y no en la nube.

## Sin login: qué implica

Como no hay autenticación, las reglas de acceso (RLS) de Supabase están
abiertas a cualquiera (`using (true)`). No agregar login sin conversarlo
antes con Johany: fue una decisión explícita, no un descuido.

## Piezas del arnés que faltan (a propósito)

No tiene ambiente de prueba ni pruebas automáticas todavía. Se dejaron fuera
del primer alcance porque el proyecto es un experimento interno de bajo
riesgo. Si se agregan más adelante, van en `app/` sin tocar la estructura
actual.

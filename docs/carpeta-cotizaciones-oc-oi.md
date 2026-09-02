# Carpeta de cotizaciones por documento procesado (OC y OI)

Ajuste para que, al procesar cada PDF (OC u OI), Power Automate Desktop
cree una carpeta con el mismo nombre del documento y mueva el PDF adentro
de esa carpeta — en vez de dejarlo suelto en la carpeta de "Procesadas".
Esto le da a Johany un lugar listo, sin crear nada a mano, donde después
agrega las cotizaciones relacionadas a esa OC/OI.

Aplica primero al flujo actual de OC. Cuando se arme el flujo de OI
(duplicado del de OC), este mismo ajuste va incluido desde el inicio.

## Estructura resultante

```
02_OC_Procesadas/                              (o 02_OI_Procesadas/ en el flujo de OI)
  2600002476 - ABC GOTUPLAS/                    ← carpeta nueva, nombre = PDF sin extensión
    2600002476 - ABC GOTUPLAS.pdf               ← el PDF procesado, movido aquí
    (cotización 1.pdf, cotización 2.pdf...)     ← Johany las agrega a mano después
```

## Acciones a agregar/modificar en Power Automate Desktop

Dentro del mismo `For each` que recorre los PDF (donde ya está la acción
"Mover archivo(s)"), agregar dos acciones nuevas antes de esa, y modificar
la acción de mover que ya existe:

1. **Archivo → Obtener el nombre de archivo especial** (el nombre exacto de
   la acción varía según la versión de PAD; a veces aparece como "Obtener
   parte especial de un nombre de ruta")
   - Archivo: `CurrentItem.FullName`
   - Incluir extensión de archivo: **No**
   - Guardar el resultado en una variable, ej. `NombreCarpeta`

2. **Carpeta → Crear carpeta**
   - Crear carpeta en: la carpeta de "Procesadas" del flujo (`...\02_OC_Procesadas` en OC, `...\02_OI_Procesadas` en OI)
   - Nombre de la nueva carpeta: `NombreCarpeta`
   - Si ya existe: **No hacer nada** — necesario porque a veces se
     reprocesa el mismo documento (ej. una OC con cantidades actualizadas),
     y la carpeta ya existiría con cotizaciones adentro. Sin esto, la
     acción fallaría y rompería el flujo.
   - Esta acción normalmente devuelve la ruta completa de la carpeta
     (creada o ya existente) en una variable de salida, ej. `CarpetaDoc` —
     se usa en el paso siguiente.

3. **Modificar la acción "Mover archivo(s)" que ya existe en el flujo**:
   - Cambiar el destino de la carpeta general de "Procesadas" a la
     variable `CarpetaDoc` del paso anterior (la carpeta específica del
     documento).
   - Revisar la opción "Si el archivo ya existe" de esa misma acción y
     ponerla en **Sobrescribir**. Así, si se reprocesa el mismo documento,
     el PDF viejo dentro de esa carpeta se reemplaza por el nuevo sin
     romper el flujo ni tocar las cotizaciones que ya se hayan agregado
     ahí a mano.

## Por qué "no hacer nada" / "sobrescribir" y no dejar los valores por defecto

Johany confirmó que a veces reprocesa el mismo documento (por ejemplo, una
OC con cantidades o fechas corregidas por el proveedor). Sin estos dos
ajustes, la segunda vez que se procese el mismo PDF:

- "Crear carpeta" fallaría porque la carpeta ya existe (rompiendo el flujo
  antes de llegar siquiera a mover el archivo).
- "Mover archivo(s)" fallaría porque ya hay un PDF con ese mismo nombre
  dentro de la carpeta.

Con "No hacer nada" y "Sobrescribir" el reproceso funciona sin
intervención manual, y las cotizaciones que Johany ya haya puesto en esa
carpeta quedan intactas (solo se reemplaza el PDF, nada más).

## Nota sobre cantidades y fechas al reprocesar

Este ajuste es solo sobre carpetas/archivos, no cambia cómo se actualizan
los datos en la base. Recordatorio de lo ya confirmado:

- **Cantidades**: se actualizan solas al reimportar el Excel desde la app
  — no hace falta ningún cambio adicional.
- **Fechas programadas de ingreso**: quedan protegidas una vez que la fila
  ya existe (decisión a propósito, documentada en `CLAUDE.md`, para que un
  Excel viejo no borre una reprogramación ya hecha desde la app). Para
  cambiar una fecha de entrega ya cargada hay que hacerlo desde la app, no
  resubiendo el PDF/Excel.

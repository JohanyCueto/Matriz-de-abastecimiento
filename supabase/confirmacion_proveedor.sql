-- Agrega la fecha que el proveedor confirma para cada entrega.
-- El estado de confirmacion (Pendiente / Confirmada / Reprogramada por proveedor)
-- se calcula en la app comparando fecha_confirmada con fecha_programada_ingreso.

alter table programacion_oc add column if not exists fecha_confirmada date;

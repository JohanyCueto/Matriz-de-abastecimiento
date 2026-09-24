-- Fecha en que se le comunico a almacen una entrega, congelada en ese
-- momento. Mientras sea null, la entrega no aparece en el Cuadro Almacen
-- (todavia no se le aviso a almacen). Una vez puesta, no se vuelve a
-- mover aunque la entrega se reprograme despues: para eso esta la fecha
-- vigente normal (fecha_programada_ingreso), que el Cuadro Almacen
-- muestra aparte como "Nueva fecha programada" cuando difiere de esta.
alter table programacion_oc
  add column if not exists fecha_comunicada_almacen date;

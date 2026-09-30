-- Ajuste excepcional de cantidad programada (ej. ruptura de stock).
-- El total programado efectivo = cant_programada + ajuste_cantidad.
-- El campo original del Excel no se modifica.

alter table programacion_oc add column if not exists ajuste_cantidad numeric not null default 0;
alter table programacion_oc add column if not exists motivo_ajuste text;

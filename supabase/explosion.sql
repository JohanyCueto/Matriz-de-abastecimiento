-- Fase 2 del agente de abastecimiento: guarda cada explosion de materiales
-- que Johany sube, para poder comparar la de hoy contra la anterior y
-- detectar materiales nuevos, cantidades que subieron/bajaron, o
-- materiales que ya no aparecen -- sin que ella tenga que revisarlo linea
-- por linea.

create table if not exists explosion_snapshots (
  id bigint generated always as identity primary key,
  archivo text not null,
  -- Fecha real del archivo (parseada de su nombre, ej. "...2026.08.27.xlsx"),
  -- no la fecha en que se subio -- para que "anterior vs. actual" no se
  -- invierta si algun dia hay que volver a subir un archivo viejo.
  fecha_corte date,
  creado_por uuid references auth.users(id) default auth.uid(),
  creado_en timestamptz not null default now()
);

-- Una fila por material x mes x snapshot. Solo materiales tipo ME (igual
-- que el resto del app). Stock/disponible/cuarentena/cliente/grupo se
-- repiten en las 5 filas de mes del mismo material -- se acepta la
-- redundancia para no tener que hacer join en las consultas del dashboard.
create table if not exists explosion_materiales (
  id bigint generated always as identity primary key,
  snapshot_id bigint not null references explosion_snapshots(id) on delete cascade,
  codigo text not null,
  descripcion text,
  cliente text,
  grupo int,
  stock numeric,
  disponible numeric,
  cuarentena numeric,
  mes date not null,
  consumo_proyectado numeric,
  consumo_firme numeric,
  -- Version(es) del material impreso (columnas AQ/AR/AS de "explosion").
  -- Se guardan tal cual vienen, solo para mostrarlas -- la app no decide
  -- sola si se puede combinar stock entre versiones, eso lo revisa Johany.
  version1 text,
  version2 text,
  version3 text,
  -- Resumen calculado desde EXPLOSION_DETALLADA al importar (no se
  -- guardan las filas crudas del detalle, serian ~11,200 por snapshot).
  mes_fabricacion_proximo date,
  fecha_requerida_ingreso date
);

create index if not exists idx_explosion_materiales_snapshot on explosion_materiales (snapshot_id);
create index if not exists idx_explosion_materiales_codigo on explosion_materiales (codigo, mes);

-- Antes se adivinaba cual snapshot era "anterior" y cual "actual" por la
-- fecha en el nombre del archivo (fragil: si Johany sube un archivo con
-- otro nombre, o vuelve a subir uno viejo, se puede invertir el orden o
-- comparar contra el snapshot equivocado). Ahora ella misma lo dice al
-- subir: "Cargar explosión nueva" (pasa lo que era 'actual' a 'anterior' y
-- guarda el nuevo como 'actual') o "Corregir explosión anterior" (solo
-- reemplaza el 'anterior', sin tocar el 'actual'). Solo puede haber un
-- snapshot con cada rol a la vez; el resto de snapshots viejos se quedan
-- en la base sin rol, como historial.
alter table explosion_snapshots add column if not exists rol text check (rol in ('anterior', 'actual'));
create unique index if not exists idx_explosion_snapshots_rol_unico on explosion_snapshots (rol) where rol is not null;

alter table explosion_snapshots enable row level security;
alter table explosion_materiales enable row level security;

create policy "usuarios logueados leen explosion_snapshots" on explosion_snapshots
  for select using (auth.uid() is not null);
create policy "editores registran explosion_snapshots" on explosion_snapshots
  for insert with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));
create policy "editores actualizan explosion_snapshots" on explosion_snapshots
  for update using (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'))
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));

create policy "usuarios logueados leen explosion_materiales" on explosion_materiales
  for select using (auth.uid() is not null);
create policy "editores registran explosion_materiales" on explosion_materiales
  for insert with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));

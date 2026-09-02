-- Fase 2 del agente de abastecimiento: guarda cada explosion de materiales
-- que Johany sube, para poder comparar la de hoy contra la anterior y
-- detectar materiales nuevos, cantidades que subieron/bajaron, o
-- materiales que ya no aparecen -- sin que ella tenga que revisarlo linea
-- por linea.

create table if not exists explosion_snapshots (
  id bigint generated always as identity primary key,
  archivo text not null,
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
  consumo_firme numeric
);

create index if not exists idx_explosion_materiales_snapshot on explosion_materiales (snapshot_id);
create index if not exists idx_explosion_materiales_codigo on explosion_materiales (codigo, mes);

alter table explosion_snapshots enable row level security;
alter table explosion_materiales enable row level security;

create policy "usuarios logueados leen explosion_snapshots" on explosion_snapshots
  for select using (auth.uid() is not null);
create policy "editores registran explosion_snapshots" on explosion_snapshots
  for insert with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));

create policy "usuarios logueados leen explosion_materiales" on explosion_materiales
  for select using (auth.uid() is not null);
create policy "editores registran explosion_materiales" on explosion_materiales
  for insert with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));

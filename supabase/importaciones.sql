-- Registro de cada archivo importado (Excel de programacion o de ingresos),
-- para mostrar en la pantalla que archivo se subio por ultima vez y cuando.
create table if not exists importaciones (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('programacion', 'ingresos')),
  archivo text not null,
  filas int,
  creado_por uuid references auth.users(id) default auth.uid(),
  creado_en timestamptz not null default now()
);

alter table importaciones enable row level security;

create policy "usuarios logueados leen importaciones" on importaciones
  for select using (auth.uid() is not null);
create policy "editores registran importaciones" on importaciones
  for insert with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));

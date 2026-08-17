-- Tabla de perfiles: guarda el nombre y el rol de cada persona que puede
-- entrar a la aplicacion. "editor" puede ver y editar; "lector" solo ve.
create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nombre text,
  rol text not null default 'lector' check (rol in ('editor', 'lector')),
  created_at timestamptz not null default now()
);

alter table perfiles enable row level security;
create policy "cada quien lee su propio perfil" on perfiles
  for select using (auth.uid() = id);

-- Se reemplazan las reglas publicas anteriores: ahora hay que estar
-- logueado para leer, y ser "editor" para escribir.
drop policy if exists "lectura publica programacion_oc" on programacion_oc;
drop policy if exists "escritura publica programacion_oc" on programacion_oc;
drop policy if exists "edicion publica programacion_oc" on programacion_oc;
drop policy if exists "lectura publica ingresos_sistema" on ingresos_sistema;
drop policy if exists "escritura publica ingresos_sistema" on ingresos_sistema;

create policy "usuarios logueados leen programacion_oc" on programacion_oc
  for select using (auth.uid() is not null);
create policy "editores crean filas en programacion_oc" on programacion_oc
  for insert with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));
create policy "editores actualizan programacion_oc" on programacion_oc
  for update using (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'))
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));

create policy "usuarios logueados leen ingresos_sistema" on ingresos_sistema
  for select using (auth.uid() is not null);
create policy "editores crean filas en ingresos_sistema" on ingresos_sistema
  for insert with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));

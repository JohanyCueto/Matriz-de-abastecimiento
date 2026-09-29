-- Contactos de proveedores para envio de recordatorios por correo.
-- El campo "nombre" debe coincidir exactamente con el valor de la columna
-- "proveedor" en programacion_oc, que es como la app cruza las entregas
-- con su contacto.

create table if not exists proveedores_contacto (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  correo text,
  correo_cc text,
  telefono text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Cada vez que se envia un recordatorio queda registrado aca, para saber
-- cuando fue la ultima vez que se le escribio a cada proveedor y no
-- mandarle dos correos el mismo dia.
create table if not exists recordatorios_enviados (
  id bigint generated always as identity primary key,
  proveedor text not null,
  correo_destino text not null,
  tipo text not null default 'manual',
  entregas_incluidas int not null default 0,
  enviado_en timestamptz not null default now(),
  enviado_por uuid references auth.users(id) default auth.uid()
);

alter table proveedores_contacto enable row level security;
alter table recordatorios_enviados enable row level security;

create policy "lectura proveedores_contacto" on proveedores_contacto
  for select using (auth.uid() is not null);
create policy "insert proveedores_contacto" on proveedores_contacto
  for insert with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));
create policy "update proveedores_contacto" on proveedores_contacto
  for update using (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'))
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));
create policy "delete proveedores_contacto" on proveedores_contacto
  for delete using (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));

create policy "lectura recordatorios_enviados" on recordatorios_enviados
  for select using (auth.uid() is not null);
create policy "insert recordatorios_enviados" on recordatorios_enviados
  for insert with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));

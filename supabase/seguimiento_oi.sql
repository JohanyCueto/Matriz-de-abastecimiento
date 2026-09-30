-- Seguimiento de ordenes de importacion (OI) a traves de 8 etapas.
-- Solo aplica a entregas con tipo_documento = 'OI'.
-- Los datos de seguimiento los llena la gente a mano desde la app.

create table if not exists seguimiento_oi (
  id_entrega text primary key references programacion_oc(id_entrega),

  incoterm text check (incoterm in ('EXW','CIF','CFR','FOB','DDP','DAP')),

  -- 1. Confirmacion de culminacion
  cantidad_lista numeric,
  fecha_disponibilidad date,
  docs_preliminares boolean not null default false,
  docs_preliminares_detalle text,

  -- 2. Coordinacion segun Incoterm (solo EXW)
  fecha_recojo date,
  horario_carga text,
  direccion_recojo text,

  -- 3. Despacho internacional
  etd date,
  eta date,
  bl_awb text,
  medio_transporte text check (medio_transporte in ('Maritimo','Aereo','Terrestre')),
  confirmacion_salida boolean not null default false,
  naviera_aerolinea text,
  agente_carga text,

  -- 4. Documentos para nacionalizacion
  doc_factura_comercial boolean not null default false,
  doc_packing_list boolean not null default false,
  doc_bl_awb boolean not null default false,
  doc_certificado_origen boolean not null default false,
  doc_seguro boolean not null default false,
  doc_ficha_tecnica boolean not null default false,

  -- 5. Numeracion y preliquidacion
  numero_dua text,
  fecha_numeracion date,
  monto_preliquidacion numeric,
  aprobacion_interna boolean not null default false,

  -- 6. Pago de derechos
  fecha_pago_derechos date,
  constancia_pago text,
  confirmacion_agente boolean not null default false,

  -- 7. Desaduanaje
  fecha_levante date,
  volante_enviado boolean not null default false,
  carga_liberada boolean not null default false,
  fecha_liberacion date,

  -- 8. Ingreso a almacen
  fecha_ingreso_almacen date,
  observaciones_ingreso text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table seguimiento_oi enable row level security;

create policy "usuarios logueados leen seguimiento_oi" on seguimiento_oi
  for select using (auth.uid() is not null);
create policy "editores crean seguimiento_oi" on seguimiento_oi
  for insert with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));
create policy "editores actualizan seguimiento_oi" on seguimiento_oi
  for update using (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'))
  with check (exists (select 1 from perfiles where id = auth.uid() and rol = 'editor'));

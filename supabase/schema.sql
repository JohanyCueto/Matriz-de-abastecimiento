-- Tabla principal: una fila por cada entrega programada de una OC.
create table if not exists programacion_oc (
  id_entrega text primary key,
  fecha_emision_oc date,
  oc bigint not null, -- numero de OC (compras locales) u OI (importaciones)
  origen text, -- 'Local' (OC) o 'Importado' (OI), derivado de tipo_documento
  tipo_documento text, -- 'OC' u 'OI', segun el flujo que proceso el PDF
  proveedor text,
  comprador text,
  moneda text,
  condicion_pago text,
  archivo_origen text,
  fecha_carga_automatica timestamptz,
  estado_carga text,
  sku text not null,
  descripcion text,
  precio_unitario numeric,
  cant_programada numeric,
  valor_entrega numeric,
  n_entrega text,
  fecha_programada_ingreso date,
  mes_consumo text,
  semana_ingreso int,
  almacen_destino text,
  cantidad_bultos numeric,
  requiere_almacen_externo text,
  orden_entrega int,
  programado_anterior numeric,
  fecha_requerida_planeamiento date,
  prioridad_produccion text,
  producto_op_relacionada text,
  riesgo_produccion text,

  -- Estos los llena el Excel solo la primera vez; después los maneja la gente en la app.
  estado_gestion text,
  motivo_demora text,
  responsable_accion text,
  criticidad text,
  observaciones text,
  cierre_manual text,
  motivo_cierre text,

  -- Estos los calcula sola la app cada vez que llega un ingreso nuevo.
  cant_ingresada numeric default 0,
  saldo_pendiente numeric,
  pct_ingreso numeric default 0,
  estado_ingreso text,
  fecha_real_ingreso date,
  dias_atraso int,
  valor_ingresado numeric default 0,
  valor_pendiente numeric,

  -- Estos solo existen en la app, no vienen del Excel.
  reabierta boolean not null default false,
  historial jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_programacion_oc_sku on programacion_oc (oc, sku);

-- Registro de lo que realmente entró a almacén según el sistema.
create table if not exists ingresos_sistema (
  numero_analisis text primary key,
  archivo_origen_ingreso text,
  fecha_ingreso date,
  oc bigint not null,
  codigo text not null,
  descripcion text,
  proveedor text,
  cantidad_ingresada numeric,
  moneda text,
  precio numeric,
  lote text,
  fecha_oc date,
  estado_ingreso_sistema text,
  ingreso_acumulado numeric,
  created_at timestamptz not null default now()
);

create index if not exists idx_ingresos_sistema_sku on ingresos_sistema (oc, codigo);

-- Sin login: cualquiera con el link puede leer y escribir. Hay que dejarlo
-- explícito, porque por defecto Supabase bloquea todo.
alter table programacion_oc enable row level security;
alter table ingresos_sistema enable row level security;

create policy "lectura publica programacion_oc" on programacion_oc for select using (true);
create policy "escritura publica programacion_oc" on programacion_oc for insert with check (true);
create policy "edicion publica programacion_oc" on programacion_oc for update using (true) with check (true);

create policy "lectura publica ingresos_sistema" on ingresos_sistema for select using (true);
create policy "escritura publica ingresos_sistema" on ingresos_sistema for insert with check (true);

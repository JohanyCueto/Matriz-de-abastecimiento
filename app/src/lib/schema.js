// Mapea las columnas del Excel de Johany a los nombres de columna en Supabase.
// "editable" = el importador NO pisa este campo si la fila ya existe (lo dejó alguien en la app).
// "computed" = lo recalcula el importador a partir de ingresos_sistema, no viene directo del Excel.

export const PROGRAMACION_COLUMNS = [
  { header: 'Fecha emisión OC', field: 'fecha_emision_oc', type: 'date' },
  { header: 'OC', field: 'oc', type: 'int' },
  { header: 'Proveedor', field: 'proveedor', type: 'text' },
  { header: 'Comprador', field: 'comprador', type: 'text' },
  { header: 'Moneda', field: 'moneda', type: 'text' },
  { header: 'Condición de pago', field: 'condicion_pago', type: 'text' },
  { header: 'Archivo origen', field: 'archivo_origen', type: 'text' },
  { header: 'Fecha carga automática', field: 'fecha_carga_automatica', type: 'date' },
  { header: 'Estado carga', field: 'estado_carga', type: 'text' },
  { header: 'SKU', field: 'sku', type: 'text' },
  { header: 'Descripción', field: 'descripcion', type: 'text' },
  { header: 'Precio unitario', field: 'precio_unitario', type: 'number' },
  { header: 'Cant. Programada', field: 'cant_programada', type: 'number' },
  { header: 'Valor entrega', field: 'valor_entrega', type: 'number' },
  { header: 'N° entrega', field: 'n_entrega', type: 'text' },
  { header: 'ID entrega', field: 'id_entrega', type: 'text' },
  { header: 'Fecha programada de ingreso', field: 'fecha_programada_ingreso', type: 'date' },
  { header: 'Mes de consumo', field: 'mes_consumo', type: 'text' },
  { header: 'Semana de ingreso', field: 'semana_ingreso', type: 'int' },
  { header: 'Almacén destino', field: 'almacen_destino', type: 'text' },
  { header: 'Cantidad de bultos', field: 'cantidad_bultos', type: 'number' },
  { header: 'Requiere almacén externo', field: 'requiere_almacen_externo', type: 'text' },
  { header: 'Orden entrega', field: 'orden_entrega', type: 'int' },
  { header: 'Programado anterior', field: 'programado_anterior', type: 'number' },
  { header: 'Fecha requerida Planeamiento', field: 'fecha_requerida_planeamiento', type: 'date' },
  { header: 'Prioridad producción', field: 'prioridad_produccion', type: 'text' },
  { header: 'Producto / OP relacionada', field: 'producto_op_relacionada', type: 'text' },
  { header: 'Riesgo producción', field: 'riesgo_produccion', type: 'text' },
]

// Campos que llegan del Excel pero solo se toman en cuenta la primera vez
// que se crea la fila. Después los maneja la gente desde la app.
export const EDITABLE_ON_APP = [
  { header: 'Estado gestión', field: 'estado_gestion', type: 'text' },
  { header: 'Motivo demora', field: 'motivo_demora', type: 'text' },
  { header: 'Responsable acción', field: 'responsable_accion', type: 'text' },
  { header: 'Criticidad', field: 'criticidad', type: 'text' },
  { header: 'Observaciones', field: 'observaciones', type: 'text' },
  { header: 'Cierre manual', field: 'cierre_manual', type: 'text' },
  { header: 'Motivo cierre', field: 'motivo_cierre', type: 'text' },
]

// Campos que la app recalcula sola cada vez que entra un ingreso nuevo.
export const COMPUTED_FIELDS = [
  'cant_ingresada', 'saldo_pendiente', 'pct_ingreso',
  'estado_ingreso', 'fecha_real_ingreso', 'dias_atraso',
  'valor_ingresado', 'valor_pendiente',
]

// Orden completo de columnas para exportar, igual al Excel original de
// Johany, mezclando las que vienen del Excel con las que calcula la app.
export const EXPORT_COLUMNS = [
  { header: 'Fecha emisión OC', field: 'fecha_emision_oc', type: 'date' },
  { header: 'OC', field: 'oc' },
  { header: 'Proveedor', field: 'proveedor' },
  { header: 'Comprador', field: 'comprador' },
  { header: 'Moneda', field: 'moneda' },
  { header: 'Condición de pago', field: 'condicion_pago' },
  { header: 'Archivo origen', field: 'archivo_origen' },
  { header: 'Fecha carga automática', field: 'fecha_carga_automatica', type: 'date' },
  { header: 'Estado carga', field: 'estado_carga' },
  { header: 'SKU', field: 'sku' },
  { header: 'Descripción', field: 'descripcion' },
  { header: 'Precio unitario', field: 'precio_unitario' },
  { header: 'Cant. Programada', field: 'cant_programada' },
  { header: 'Valor entrega', field: 'valor_entrega' },
  { header: 'N° entrega', field: 'n_entrega' },
  { header: 'ID entrega', field: 'id_entrega' },
  { header: 'Fecha programada de ingreso', field: 'fecha_programada_ingreso', type: 'date' },
  { header: 'Mes de consumo', field: 'mes_consumo' },
  { header: 'Semana de ingreso', field: 'semana_ingreso' },
  { header: 'Almacén destino', field: 'almacen_destino' },
  { header: 'Cantidad de bultos', field: 'cantidad_bultos' },
  { header: 'Requiere almacén externo', field: 'requiere_almacen_externo' },
  { header: 'Cant. Ingresada', field: 'cant_ingresada' },
  { header: 'Saldo pendiente', field: 'saldo_pendiente' },
  { header: '% ingreso', field: 'pct_ingreso' },
  { header: 'Estado ingreso', field: 'estado_ingreso' },
  { header: 'Cierre manual', field: 'cierre_manual' },
  { header: 'Motivo cierre', field: 'motivo_cierre' },
  { header: 'Fecha real ingreso', field: 'fecha_real_ingreso', type: 'date' },
  { header: 'Días atraso', field: 'dias_atraso' },
  { header: 'Estado gestión', field: 'estado_gestion' },
  { header: 'Motivo demora', field: 'motivo_demora' },
  { header: 'Responsable acción', field: 'responsable_accion' },
  { header: 'Criticidad', field: 'criticidad' },
  { header: 'Fecha requerida Planeamiento', field: 'fecha_requerida_planeamiento', type: 'date' },
  { header: 'Prioridad producción', field: 'prioridad_produccion' },
  { header: 'Producto / OP relacionada', field: 'producto_op_relacionada' },
  { header: 'Riesgo producción', field: 'riesgo_produccion' },
  { header: 'Observaciones', field: 'observaciones' },
  { header: 'Orden entrega', field: 'orden_entrega' },
  { header: 'Programado anterior', field: 'programado_anterior' },
  { header: 'Valor ingresado', field: 'valor_ingresado' },
  { header: 'Valor pendiente', field: 'valor_pendiente' },
]

export const INGRESOS_COLUMNS = [
  { header: 'Archivo origen ingreso', field: 'archivo_origen_ingreso', type: 'text' },
  { header: 'Fecha ingreso', field: 'fecha_ingreso', type: 'date' },
  { header: 'OC', field: 'oc', type: 'int' },
  { header: 'Código', field: 'codigo', type: 'text' },
  { header: 'Descripción', field: 'descripcion', type: 'text' },
  { header: 'Proveedor', field: 'proveedor', type: 'text' },
  { header: 'Cantidad ingresada', field: 'cantidad_ingresada', type: 'number' },
  { header: 'Moneda', field: 'moneda', type: 'text' },
  { header: 'Precio', field: 'precio', type: 'number' },
  { header: 'Número análisis', field: 'numero_analisis', type: 'text' },
  { header: 'Lote', field: 'lote', type: 'text' },
  { header: 'Fecha OC', field: 'fecha_oc', type: 'date' },
  { header: 'Estado ingreso sistema', field: 'estado_ingreso_sistema', type: 'text' },
  { header: 'Ingreso acumulado', field: 'ingreso_acumulado', type: 'number' },
]

// Opciones fijas, sacadas de la hoja "info" del Excel. No son datos, son catálogo.
export const OPCIONES = {
  estado_gestion: [
    { valor: 'Programado', ayuda: 'Ya tienes fecha tentativa de ingreso, pero aún no está 100% validada' },
    { valor: 'Confirmado', ayuda: 'El proveedor confirmó entrega/despacho en fecha' },
    { valor: 'Reprogramado', ayuda: 'Cambió la fecha inicialmente programada' },
    { valor: 'En riesgo', ayuda: 'No hay confirmación, hay demora o puede afectar producción' },
  ],
  requiere_almacen_externo: ['Si', 'No', 'Por evaluar'],
  responsable_accion: ['Compras', 'Proveedor', 'Planeamiento', 'Almacén', 'Calidad'],
  prioridad_produccion: ['Alta', 'Media', 'Baja'],
  riesgo_produccion: ['Sin riesgo', 'En seguimiento', 'En riesgo'],
  motivo_demora: [
    'Falta de stock proveedor',
    'Demora producción proveedor',
    'Demora logística / despacho',
    'Ingreso parcial',
    'Reprogramación interna',
  ],
}

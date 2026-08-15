import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { fmt, fdate, enrich, withEntregas, SEM, EST_TAG, GES_TAG } from './lib/derive'
import Panel from './Panel'
import ImportButton from './ImportButton'
import './App.css'

const CAT_EST = ['Pendiente', 'Parcial', 'Completo']
const CAT_GES = ['En seguimiento', 'Reprogramado', 'Atrasado', 'Cerrado']

const COLS = [
  { k: 'sem2', l: '', w: '30px' },
  { k: 'oc', l: 'OC' },
  { k: 'sku', l: 'SKU' },
  { k: 'entN', l: 'Entrega', w: '86px' },
  { k: 'descripcion', l: 'Material' },
  { k: 'proveedor', l: 'Proveedor' },
  { k: 'comprador', l: 'Comprador', w: '104px' },
  { k: 'cant_programada', l: 'Programado', n: 1 },
  { k: 'cant_ingresada', l: 'Ingresado', n: 1 },
  { k: 'saldo_pendiente', l: 'Saldo', n: 1 },
  { k: 'avance', l: 'Avance', w: '126px' },
  { k: 'fecha_programada_ingreso', l: 'F. programada' },
  { k: 'dd', l: 'Dias', n: 1 },
  { k: 'desv', l: 'Tolerancia', w: '92px' },
  { k: 'estado_ingreso', l: 'Ingreso' },
  { k: 'estado_gestion', l: 'Gestion' },
]

export default function App() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [selectedId, setSelectedId] = useState(null)

  const [q, setQ] = useState('')
  const [fEst, setFEst] = useState('')
  const [fGes, setFGes] = useState('')
  const [fProv, setFProv] = useState('')
  const [fComp, setFComp] = useState('')
  const [quick, setQuick] = useState('')
  const [soloTol, setSoloTol] = useState(false)
  const [sortK, setSortK] = useState('sem2')
  const [sortD, setSortD] = useState(1)

  async function cargar() {
    setLoading(true)
    setErr(null)
    const { data, error } = await supabase.from('programacion_oc').select('*')
    if (error) { setErr(error.message); setLoading(false); return }
    setRows(withEntregas(data.map(enrich)))
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  function actualizarFila(id, patch) {
    setRows(prev => withEntregas(prev.map(r => r.id_entrega === id ? enrich({ ...r, ...patch }) : r).map(r => ({ ...r }))))
  }

  const proveedores = useMemo(() => [...new Set(rows.map(r => r.proveedor).filter(Boolean))].sort(), [rows])
  const compradores = useMemo(() => [...new Set(rows.map(r => r.comprador).filter(Boolean))].sort(), [rows])

  const kpis = useMemo(() => {
    const ab = rows.filter(r => r.abierto)
    const at = ab.filter(r => r.sem2 === 'atrasado')
    const pl = ab.filter(r => r.sem2 === 'porllegar')
    const vs = ab.filter(r => r.moneda === 'SOLES').reduce((a, r) => a + (r.valor_pendiente || 0), 0)
    const vd = ab.filter(r => r.moneda !== 'SOLES').reduce((a, r) => a + (r.valor_pendiente || 0), 0)
    const rp = rows.filter(r => r.hist.length).length
    const tl = rows.filter(r => r.tol).length
    const cc = rows.length - ab.length - tl
    return [
      { id: '', lb: 'Lineas totales', vl: rows.length, ft: 'entregas programadas', cl: '' },
      { id: 'abierto', lb: 'Abiertas', vl: ab.length, ft: 'con saldo pendiente', cl: '' },
      { id: 'atrasado', lb: 'Atrasadas', vl: at.length, ft: 'pasaron su fecha', cl: 'r' },
      { id: 'porllegar', lb: 'Llegan en 7 dias', vl: pl.length, ft: 'ventana inmediata', cl: 'a' },
      { id: 'repro', lb: 'Reprogramadas', vl: rp, ft: 'con fecha movida', cl: 'a' },
      { id: 'cerrado', lb: 'Cerradas', vl: cc + tl, ft: `${fmt(cc)} exactas, ${fmt(tl)} en tolerancia`, cl: 'g' },
      { id: 'valor', lb: 'Valor pendiente', vl: `S/ ${fmt(vs)}`, ft: `mas US$ ${fmt(vd)}`, cl: '' },
    ]
  }, [rows])

  const filtradas = useMemo(() => {
    const qq = q.trim().toLowerCase()
    let out = rows.filter(r => {
      if (qq) {
        const busca = `${r.oc} ${r.sku} ${r.descripcion || ''} ${r.proveedor || ''} ${r.comprador || ''}`.toLowerCase()
        if (!busca.includes(qq)) return false
      }
      if (fEst && r.estado_ingreso !== fEst) return false
      if (fGes && r.estado_gestion !== fGes) return false
      if (fProv && r.proveedor !== fProv) return false
      if (fComp && r.comprador !== fComp) return false
      if (quick === 'abierto' && !r.abierto) return false
      if (quick === 'cerrado' && r.abierto) return false
      if (quick === 'atrasado' && r.sem2 !== 'atrasado') return false
      if (quick === 'porllegar' && r.sem2 !== 'porllegar') return false
      if (quick === 'repro' && !r.hist.length) return false
      if (soloTol && !r.tol) return false
      return true
    })
    const ord = { atrasado: 0, porllegar: 1, enfecha: 2, tolerancia: 3, cerrado: 4 }
    out.sort((a, b) => {
      if (sortK === 'sem2') return (ord[a.sem2] - ord[b.sem2]) * sortD
      let x = a[sortK], y = b[sortK]
      if (x == null) x = ''
      if (y == null) y = ''
      return (x > y ? 1 : x < y ? -1 : 0) * sortD
    })
    return out
  }, [rows, q, fEst, fGes, fProv, fComp, quick, soloTol, sortK, sortD])

  const selected = filtradas.find(r => r.id_entrega === selectedId) || rows.find(r => r.id_entrega === selectedId)

  function toggleSort(k) {
    if (sortK === k) setSortD(d => -d)
    else { setSortK(k); setSortD(1) }
  }

  function limpiar() {
    setQ(''); setFEst(''); setFGes(''); setFProv(''); setFComp('')
    setQuick(''); setSoloTol(false)
  }

  function celda(r, k) {
    switch (k) {
      case 'sem2': return <span className="dot" style={{ background: SEM[r.sem2].c }} />
      case 'oc': return <span className="mono">{r.oc}</span>
      case 'sku': return <span className="mono">{r.sku}</span>
      case 'entN': return r.entTot > 1 ? <span className="tag t-blu">{r.entN} de {r.entTot}</span> : <span className="dim">unica</span>
      case 'descripcion': return <div className="dsc">{r.descripcion || ''}</div>
      case 'proveedor': return <div className="prov">{r.proveedor || ''}</div>
      case 'comprador': return <span className={`nw ${!r.comprador ? 'dim' : ''}`}>{r.comprador || 'Sin asignar'}</span>
      case 'cant_programada': return fmt(r.cant_programada)
      case 'cant_ingresada': return fmt(r.cant_ingresada)
      case 'saldo_pendiente': return r.saldo_pendiente > 0 ? <b style={{ fontWeight: 500 }}>{fmt(r.saldo_pendiente)}</b> : <span className="dim">0</span>
      case 'avance': return <><span className="pbar"><i style={{ width: `${(r.avance * 100).toFixed(0)}%` }} /></span><span className="pct">{(r.avance * 100).toFixed(0)}%</span></>
      case 'fecha_programada_ingreso': return <>
        <span className="mono">{fdate(r.fecha_programada_ingreso)}</span>
        {r.hist.length > 0 && <span className="rep" title={`Reprogramada ${r.hist.length} ${r.hist.length === 1 ? 'vez' : 'veces'}. Fecha original ${fdate(r.fprog0)}`}>R{r.hist.length > 1 ? r.hist.length : ''}</span>}
      </>
      case 'dd':
        if (r.tol) return <span className="dim">tolerancia</span>
        if (!r.abierto) return <span className="dim">{r.dias_atraso ? '+' + fmt(r.dias_atraso) : '0'}</span>
        if (r.dd < 0) return <span style={{ color: 'var(--red)', fontWeight: 500 }}>{-r.dd} atraso</span>
        return <span className="dim">faltan {r.dd}</span>
      case 'desv': {
        if (!r.tol) return <span className="dim">-</span>
        const pc = r.desv * 100
        return <span className="tag t-grn" title={`Cerrada con ${pc > 0 ? 'exceso' : 'faltante'} de ${Math.abs(pc).toFixed(1)}% frente a lo programado`}>{pc > 0 ? '+' : ''}{pc.toFixed(1)}%</span>
      }
      case 'estado_ingreso': return <span className={`tag ${EST_TAG[r.estado_ingreso] || 't-gry'}`}>{r.estado_ingreso}</span>
      case 'estado_gestion': return <>
        <span className={`tag ${GES_TAG[r.estado_gestion] || 't-gry'}`}>{r.estado_gestion || ''}</span>
        {r.tol && <span className="rep tolm" title="Cierre dentro de tolerancia">T</span>}
      </>
      default: return null
    }
  }

  return (
    <div className="wrap">
      <header>
        <div>
          <h1>Seguimiento de materiales de empaque</h1>
          <div className="sub">Ordenes de compra programadas y su estado real de ingreso a almacen</div>
        </div>
        <div className="corte">
          Fecha de corte
          <b>{new Date().toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' })}</b>
        </div>
      </header>

      {err && <div className="empty">No se pudo cargar la base: {err}</div>}
      {loading ? <div className="empty">Cargando...</div> : (
        <>
          <div className="kpis">
            {kpis.map(k => (
              <div key={k.lb} className={`kpi ${k.cl} ${quick === k.id && k.id ? 'on' : ''}`}
                onClick={() => { if (!k.id || k.id === 'valor') return; setQuick(q => q === k.id ? '' : k.id) }}>
                <div className="lb">{k.lb}</div>
                <div className="vl">{typeof k.vl === 'number' ? fmt(k.vl) : k.vl}</div>
                <div className="ft">{k.ft}</div>
              </div>
            ))}
          </div>

          <div className="bar">
            <input type="text" placeholder="Buscar por OC, SKU, descripcion o proveedor" value={q} onChange={e => setQ(e.target.value)} />
            <select value={fEst} onChange={e => setFEst(e.target.value)}>
              <option value="">Todos los estados</option>
              {CAT_EST.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={fGes} onChange={e => setFGes(e.target.value)}>
              <option value="">Toda gestion</option>
              {CAT_GES.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={fProv} onChange={e => setFProv(e.target.value)}>
              <option value="">Todos los proveedores</option>
              {proveedores.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select value={fComp} onChange={e => setFComp(e.target.value)}>
              <option value="">Todos los compradores</option>
              {compradores.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <button className={`btn ${soloTol ? 'act' : ''}`} onClick={() => setSoloTol(v => !v)}>Solo tolerancia</button>
            <button className="btn" onClick={limpiar}>Limpiar</button>
            <ImportButton onDone={cargar} />
            <span className="count">{fmt(filtradas.length)} lineas | {fmt(filtradas.filter(r => r.abierto).length)} abiertas</span>
          </div>

          <div className="tw">
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    {COLS.map(c => (
                      <th key={c.k} className={c.n ? 'num' : ''} style={c.w ? { width: c.w } : undefined} onClick={() => toggleSort(c.k)}>
                        {c.l}{sortK === c.k && <span className="ar">{sortD > 0 ? '▲' : '▼'}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(r => (
                    <tr key={r.id_entrega} className={selectedId === r.id_entrega ? 'sel' : ''} onClick={() => setSelectedId(r.id_entrega)}>
                      {COLS.map(c => <td key={c.k} className={c.n ? 'num' : ''}>{celda(r, c.k)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtradas.length === 0 && <div className="empty">No hay entregas con estos filtros.</div>}
            </div>
          </div>
        </>
      )}

      {selected && (
        <Panel row={selected} onClose={() => setSelectedId(null)} onSaved={patch => actualizarFila(selected.id_entrega, patch)} />
      )}
    </div>
  )
}

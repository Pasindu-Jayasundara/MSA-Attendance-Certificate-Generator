import { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { jsPDF } from 'jspdf'
import './App.css'
import template01 from './assets/certificate-templates/Template 01.jpg'
import template02 from './assets/certificate-templates/Template 02.jpg'
import template03 from './assets/certificate-templates/Template 03.jpg'
import template04 from './assets/certificate-templates/Template 04.jpg'

const templates = [template01, template02, template03, template04]
const initialPeople = ['Avery Johnson', 'Jordan Lee', 'Taylor Morgan']

const fitScale = (text, maxCharacters) => Math.min(1, maxCharacters / Math.max(text.length, maxCharacters))

function parseCsv(text, requestedColumn) {
  const rows = []
  let row = [], value = '', quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"' && quoted && text[i + 1] === '"') { value += '"'; i += 1 }
    else if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) { row.push(value.trim()); value = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(value.trim()); if (row.some(Boolean)) rows.push(row)
      row = []; value = ''
    } else value += char
  }
  row.push(value.trim()); if (row.some(Boolean)) rows.push(row)
  if (!rows.length) return { names: [], headers: [] }
  const requestedIndex = requestedColumn ? rows[0].findIndex(cell => cell.trim().toLowerCase() === requestedColumn.trim().toLowerCase()) : -1
  const headerIndex = requestedColumn ? requestedIndex : rows[0].findIndex(cell => /^(name|certificate name|participant|participant name|full name)$/i.test(cell))
  if (requestedColumn && headerIndex < 0) return { names: [], headers: rows[0] }
  const col = headerIndex >= 0 ? headerIndex : 0
  const data = headerIndex >= 0 ? rows.slice(1) : rows
  return { names: data.map(r => r[col]).filter(Boolean), headers: headerIndex >= 0 ? rows[0] : [] }
}

function App() {
  const [people, setPeople] = useState(initialPeople)
  const [selected, setSelected] = useState(0)
  const [session, setSession] = useState('Community workshop')
  const [presenter, setPresenter] = useState('Your name')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [columnName, setColumnName] = useState('Name')
  const [notice, setNotice] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const fileRef = useRef(null)
  const certificateRef = useRef(null)
  const [nameFontSize, setNameFontSize] = useState('40px')
  const previewName = people[selected] || 'Participant name'
  const prettyDate = useMemo(() => date ? new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Date', [date])

  useEffect(() => {
    const certificate = certificateRef.current
    if (!certificate) return undefined
    const measureName = () => {
      const width = certificate.clientWidth
      const baseSize = Math.min(width * .058, 40)
      const context = document.createElement('canvas').getContext('2d')
      context.font = `700 ${baseSize}px Arial`
      const measuredWidth = context.measureText(previewName).width
      const availableWidth = width * .62
      setNameFontSize(`${Math.max(6, baseSize * Math.min(1, availableWidth / measuredWidth))}px`)
    }
    measureName()
    const observer = new ResizeObserver(measureName)
    observer.observe(certificate)
    return () => observer.disconnect()
  }, [previewName])

  const onFile = async event => {
    const file = event.target.files?.[0]
    if (!file) return
    const parsed = parseCsv(await file.text(), columnName)
    if (!parsed.names.length) setNotice(`Column “${columnName}” was not found or contains no names.`)
    else { setPeople(parsed.names); setSelected(0); setNotice(`${parsed.names.length} participant${parsed.names.length === 1 ? '' : 's'} imported from ${file.name}`) }
    event.target.value = ''
  }

  const makeCertificate = name => new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      const w = canvas.width, h = canvas.height
      // Preserve the certificate artwork and replace only its editable fields.
      ctx.textAlign = 'center'; ctx.fillStyle = '#f4f4f6'
      ctx.fillRect(w * .17, h * .354, w * .66, h * .09)
      ctx.fillRect(w * .285, h * .606, w * .43, h * .007)
      ctx.fillRect(w * .285, h * .613, w * .43, h * .043)
      ctx.fillRect(w * .08, h * .74, w * .55, h * .057)
      ctx.fillRect(w * .12, h * .785, w * .45, h * .04)
      ctx.fillStyle = '#000'; ctx.textBaseline = 'middle'
      ctx.font = `700 ${w * .058}px Arial`
      const measuredNameWidth = ctx.measureText(name).width
      ctx.font = `700 ${Math.min(w * .058, w * .058 * w * .62 / measuredNameWidth)}px Arial`
      ctx.fillText(name, w / 2, h * .399, w * .62)
      const certificateSession = session || 'Session name'
      const certificatePresenter = `Presented by: ${presenter || 'Presenter'}`
      const certificateDate = `Date: ${prettyDate}`
      ctx.font = `700 ${Math.min(w * .023, w * .42 / Math.max(certificateSession.length, 18))}px Arial`; ctx.fillText(certificateSession, w / 2, h * .634, w * .42)
      ctx.textAlign = 'left'; ctx.font = `${Math.min(w * .017, w * .45 / Math.max(certificatePresenter.length, 30))}px Arial`; ctx.fillText(certificatePresenter, w * .126, h * .761, w * .45)
      ctx.font = `${Math.min(w * .017, w * .45 / Math.max(certificateDate.length, 30))}px Arial`; ctx.fillText(certificateDate, w * .126, h * .806, w * .45)
      resolve(canvas)
    }
    img.onerror = () => resolve(null)
    img.src = templates[templateIndex]
  })
  const [templateIndex, setTemplateIndex] = useState(0)
  const downloadAll = async () => {
    if (!people.length || isDownloading) return
    setIsDownloading(true)
    setDownloadProgress(0)
    setNotice(`Preparing ${people.length} certificates…`)
    try {
      const zip = new JSZip()
      const pageWidth = 841.89
      let exported = 0
      for (const [index, name] of people.entries()) {
        const canvas = await makeCertificate(name)
        if (canvas) {
          const pageHeight = pageWidth * canvas.height / canvas.width
          const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [pageWidth, pageHeight], compress: true })
          pdf.addImage(canvas.toDataURL('image/jpeg', .92), 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST')
          zip.file(`${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-certificate.pdf`, pdf.output('blob'))
          exported += 1
        }
        setDownloadProgress(Math.round(((index + 1) / people.length) * 90))
      }
      const archive = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }, metadata => setDownloadProgress(90 + Math.round(metadata.percent / 10)))
      setDownloadProgress(100)
      const link = document.createElement('a')
      link.href = URL.createObjectURL(archive)
      link.download = `${(session || 'certificates').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-certificates.zip`
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 1500)
      setNotice(`Downloaded ${exported} certificate${exported === 1 ? '' : 's'} in one ZIP file`)
    } catch {
      setNotice('Download could not be completed. Please try again.')
    } finally {
      setTimeout(() => {
        setIsDownloading(false)
        setDownloadProgress(0)
      }, 450)
    }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#top"><span className="brand-mark">c</span><span>cert<span className="brand-accent">craft</span></span></a>
      <div className="side-label">WORKSPACE</div>
      <a className="side-link active" href="#builder"><span>▧</span> Certificate studio</a>
      <a className="side-link" href="#participants"><span>♙</span> Participants <span className="side-count">{people.length}</span></a>
      <div className="profile"><div className="avatar">{(presenter || 'Y').slice(0, 1).toUpperCase()}</div><div><b>{presenter || 'Your account'}</b><small>Workspace owner</small></div><span className="dots">···</span></div>
      <div className="developer-credit">Developed by <a href="https://www.linkedin.com/in/pasindu-jayasundara" target="_blank" rel="noreferrer">Pasindu Jayasundara ↗</a></div>
    </aside>
    <main id="top" className="main-area">
      <div className="content" id="builder">
        <div className="workspace-grid">
          <section className="builder-column">
            <div className="panel participant-panel" id="participants"><div className="panel-heading"><div className="number">01</div><div><h2>Your people</h2><p>Bring in a list or add names yourself.</p></div><span className="pill">{people.length} ADDED</span></div>
              <button className="upload-zone" onClick={() => fileRef.current?.click()}><span className="upload-icon">↑</span><span><b>Drop your CSV here, or <u>browse</u></b><small>One participant name per row · .csv</small></span><span className="upload-tag">CSV</span></button><input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile}/>
              {notice && <div className="notice">{notice}</div>}
              <label className="field-label csv-column-label" htmlFor="csv-column">Participant name column</label><input className="text-input csv-column-input" id="csv-column" value={columnName} onChange={e => setColumnName(e.target.value)} placeholder="e.g. Full Name"/>
              <div className="participant-summary"><span className="summary-check">✓</span><span><b>{people.length} participant{people.length === 1 ? '' : 's'} ready</b><small>Names will be used from the “{columnName || 'Name'}” CSV column.</small></span></div>
            </div>
            <div className="panel details-panel"><div className="panel-heading"><div className="number">02</div><div><h2>Certificate details</h2><p>Make every certificate personal.</p></div></div>
              <label className="field-label" htmlFor="session">Session name</label><input className="text-input" id="session" value={session} onChange={e => setSession(e.target.value)} placeholder="e.g. Intro to design thinking"/>
              <div className="field-row"><div><label className="field-label" htmlFor="presenter">Presented by</label><input className="text-input" id="presenter" value={presenter} onChange={e => setPresenter(e.target.value)} placeholder="Your name"/></div><div><label className="field-label" htmlFor="date">Date presented</label><input className="text-input" type="date" id="date" value={date} onChange={e => setDate(e.target.value)}/></div></div>
            </div>
            <div className="panel template-panel"><div className="panel-heading"><div className="number">03</div><div><h2>Choose a template</h2><p>Pick a look that fits the moment.</p></div></div><div className="template-options">{templates.map((template, i) => <button key={template} className={`template-option ${templateIndex === i ? 'chosen' : ''}`} onClick={() => setTemplateIndex(i)}><img src={template} alt={`Certificate template ${i + 1}`}/><span className="template-check">✓</span></button>)}</div></div>
          </section>
          <aside className="preview-column"><div className="preview-top"><div><span className="preview-label">LIVE PREVIEW</span><span className="live-dot"/></div><button className="expand-button" aria-label="Preview selected certificate">⤢</button></div><div className="certificate-frame"><div ref={certificateRef} className="certificate-art" style={{backgroundImage: `url("${templates[templateIndex]}")`}}><span className="cert-name" style={{'--fit-font-size': nameFontSize}}>{previewName}</span><span className="cert-session-cover" aria-hidden="true"/><span className="cert-session" style={{'--fit-font-size': `clamp(8px,${1.45 * fitScale(session || 'Session name', 30)}vw,${17 * fitScale(session || 'Session name', 30)}px)`}}>{session || 'Session name'}</span><span className="cert-footer-top-cover" aria-hidden="true"/><span className="cert-presenter" style={{'--fit-font-size': `clamp(6px,${1.05 * fitScale(`Presented by: ${presenter || 'Presenter'}`, 42)}vw,${12 * fitScale(`Presented by: ${presenter || 'Presenter'}`, 42)}px)`}}>Presented by: {presenter || 'Presenter'}</span><span className="cert-date" style={{'--fit-font-size': `clamp(6px,${1.05 * fitScale(`Date: ${prettyDate}`, 42)}vw,${12 * fitScale(`Date: ${prettyDate}`, 42)}px)`}}>Date: {prettyDate}</span></div></div><div className="preview-caption"><span>Previewing <b>{previewName}</b></span><span>↗ &nbsp;Landscape · HD</span></div><div className="export-card"><div className="export-icon">↓</div><div><b>Ready to share?</b><small>Download certificates as high-quality PNGs.</small></div><button className="export-button" onClick={downloadAll} disabled={!people.length}>Download all <span>↓</span></button></div></aside>
        </div>
        <div className="footer-note"><span>✦</span> Every certificate is generated in high resolution, ready to print or share.</div>
      </div>
    </main>
    {isDownloading && <div className="download-overlay" role="status" aria-live="polite"><div className="download-dialog"><span className="download-spinner" aria-hidden="true"/><b>Preparing your certificates</b><p>{downloadProgress}% complete</p><div className="download-progress"><span style={{width: `${downloadProgress}%`}}/></div><small>Please keep this window open until the ZIP is ready.</small></div></div>}
  </div>
}

export default App

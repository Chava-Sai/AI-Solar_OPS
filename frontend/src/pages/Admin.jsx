import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  ArrowLeft,
  CheckCircle2,
  Database,
  File,
  FileSpreadsheet,
  FileText,
  FolderUp,
  Loader2,
  RefreshCw,
  Shield,
  Trash2,
  UploadCloud,
  Users,
  XCircle,
  Zap,
} from 'lucide-react'
import { chatAPI, docsAPI } from '../api/client'

function formatReset(seconds) {
  if (seconds == null) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `Resets in ${h} hr ${m} min` : `Resets in ${m} min`
}

function timeAgo(iso) {
  if (!iso) return 'Never'
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (secs < 60) return 'Just now'
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)} hr ago`
  return new Date(iso).toLocaleDateString()
}

function UsageBar({ percent, exhausted }) {
  const tone = exhausted || percent >= 100 ? 'limit' : percent >= 75 ? 'warn' : 'ok'
  return (
    <div className="usage-bar">
      <div className={`usage-bar-fill ${tone}`} style={{ width: `${Math.min(100, percent)}%` }} />
    </div>
  )
}

const CATEGORIES = ['General', 'Case Creation', 'Alerts', 'Aerial', 'Scheduling', 'Ops Review', 'Reports', 'PV Technical', 'BESS', 'Escalation', 'OEM Manual', 'RCA']

function fileIcon(filename) {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (['xlsx', 'xls'].includes(ext)) return <FileSpreadsheet size={18} />
  if (['docx', 'doc', 'txt', 'pdf'].includes(ext)) return <FileText size={18} />
  return <File size={18} />
}

function statusIcon(status) {
  if (status === 'success') return <CheckCircle2 size={16} />
  if (status === 'error') return <XCircle size={16} />
  return <Loader2 size={16} className="spin" />
}

export default function Admin() {
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('astra_user') || '{}')
  const fileRef = useRef()

  const [docs, setDocs] = useState([])
  const [stats, setStats] = useState({ total_documents: 0, total_chunks: 0 })
  const [uploads, setUploads] = useState([])
  const [category, setCategory] = useState('General')
  const [client, setClient] = useState('All Clients')
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState('docs') // 'docs' | 'usage'
  const [teamUsage, setTeamUsage] = useState(null)

  useEffect(() => {
    loadDocs()
  }, [])

  useEffect(() => {
    if (view !== 'usage') return
    loadTeamUsage()
    const t = setInterval(loadTeamUsage, 30000) // live refresh every 30s
    return () => clearInterval(t)
  }, [view])

  async function loadTeamUsage() {
    try {
      const { data } = await chatAPI.adminUsage()
      setTeamUsage(data)
    } catch {
      setTeamUsage(null)
    }
  }

  async function loadDocs() {
    setLoading(true)
    try {
      const { data } = await docsAPI.list()
      setDocs(data.documents || [])
      setStats({
        total_documents: data.total_documents || 0,
        total_chunks: data.total_chunks || 0,
      })
    } catch {
      setDocs([])
      setStats({ total_documents: 0, total_chunks: 0 })
    } finally {
      setLoading(false)
    }
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFiles(Array.from(e.dataTransfer.files))
  }

  function handleFiles(files) {
    const allowed = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.txt']
    const valid = files.filter((f) => allowed.some((ext) => f.name.toLowerCase().endsWith(ext)))
    if (!valid.length) return alert('No supported files selected.')
    valid.forEach((f) => uploadFile(f))
  }

  async function uploadFile(file) {
    const entry = { name: file.name, category, client, status: 'ingesting', message: 'Uploading file...' }
    setUploads((p) => [entry, ...p])

    try {
      const { data } = await docsAPI.upload(file, category, client)
      setUploads((p) => p.map((u) => (u.name === file.name ? { ...u, message: 'Creating vector chunks...' } : u)))
      pollStatus(data.job_id, file.name)
    } catch (err) {
      const msg = err.response?.data?.detail || 'Upload failed'
      setUploads((p) => p.map((u) => (u.name === file.name ? { ...u, status: 'error', message: msg } : u)))
    }
  }

  async function pollStatus(jobId, filename) {
    const interval = setInterval(async () => {
      try {
        const { data } = await docsAPI.status(jobId)
        if (data.status !== 'ingesting') {
          clearInterval(interval)
          setUploads((p) => p.map((u) => (
            u.name === filename
              ? {
                  ...u,
                  status: data.status,
                  message: data.status === 'success' ? `${data.chunks_created} chunks created` : data.message,
                }
              : u
          )))
          if (data.status === 'success') loadDocs()
        }
      } catch {
        clearInterval(interval)
      }
    }, 1500)
  }

  async function handleDelete(filename) {
    if (!confirm(`Delete "${filename}" from the knowledge base?`)) return
    try {
      await docsAPI.delete(filename)
      loadDocs()
    } catch {
      alert('Delete failed')
    }
  }

  return (
    <div className="admin-layout">
      <aside className="admin-rail">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Zap size={21} />
          </div>
          <div>
            <p className="brand-name">Astra AI</p>
            <p className="brand-sub">Admin console</p>
          </div>
        </div>

        <button className={`rail-link ${view === 'docs' ? 'active' : ''}`} onClick={() => setView('docs')}>
          <Database size={17} />
          Knowledge base
        </button>
        <button className={`rail-link ${view === 'usage' ? 'active' : ''}`} onClick={() => setView('usage')}>
          <Activity size={17} />
          Usage dashboard
        </button>
        <button className="rail-link" onClick={() => navigate('/')}>
          <ArrowLeft size={17} />
          Back to chat
        </button>

        <div className="rail-stats">
          <div>
            <strong>{stats.total_documents}</strong>
            <span>Documents</span>
          </div>
          <div>
            <strong>{stats.total_chunks}</strong>
            <span>Chunks</span>
          </div>
        </div>

        <div className="rail-user">
          <div className="avatar">{user.name?.[0]?.toUpperCase() || 'A'}</div>
          <div>
            <strong>{user.name || 'Astra User'}</strong>
            <span>{user.role?.replace('_', ' ') || 'admin'}</span>
          </div>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-header">
          <div>
            <p className="eyebrow">{view === 'docs' ? 'Document operations' : 'Model consumption'}</p>
            <h1>{view === 'docs' ? 'Knowledge Base Management' : 'Usage Dashboard'}</h1>
            <span>
              {view === 'docs'
                ? 'Upload SOPs, monitor ingestion, and control what the assistant can retrieve.'
                : 'Live view of Groq free-tier budgets, per-user consumption, and FAQ savings.'}
            </span>
          </div>
          <button className="subtle-button" onClick={view === 'docs' ? loadDocs : loadTeamUsage} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
            Refresh
          </button>
        </header>

        {view === 'usage' && (
          <section className="usage-dashboard">
            {!teamUsage ? (
              <div className="empty-state">
                <Activity size={30} />
                <strong>Loading team usage…</strong>
              </div>
            ) : (
              <>
                <div className="usage-summary-strip">
                  <div className="ops-card summary-tile">
                    <Users size={18} />
                    <strong>{teamUsage.active_users}</strong>
                    <span>Users active today</span>
                  </div>
                  <div className="ops-card summary-tile">
                    <Zap size={18} />
                    <strong>{teamUsage.faq_hits_total}</strong>
                    <span>FAQ answers served (0 tokens)</span>
                  </div>
                  <div className="ops-card summary-tile">
                    <Activity size={18} />
                    <strong>{formatReset(teamUsage.resets_in_seconds)}</strong>
                    <span>Daily limits · {teamUsage.date}</span>
                  </div>
                </div>

                <div className="ops-card">
                  <div className="card-heading">
                    <div className="card-icon"><Activity size={20} /></div>
                    <div>
                      <h2>Groq free-tier budget · team total</h2>
                      <p>Each model has its own daily pool: 200,000 tokens · 1,000 requests.</p>
                    </div>
                  </div>
                  <div className="global-model-grid">
                    {teamUsage.model_order.map((key) => {
                      const m = teamUsage.models[key]
                      return (
                        <div key={key} className="global-model-block">
                          <div className="usage-row-top">
                            <span>{m.label}</span>
                            <strong>{m.tokens_percent}% tokens</strong>
                          </div>
                          <UsageBar percent={m.tokens_percent} />
                          <small>{m.tokens_used.toLocaleString()} / {m.tokens_limit.toLocaleString()} tokens</small>
                          <div className="usage-row-top second">
                            <span>Requests</span>
                            <strong>{m.requests_percent}%</strong>
                          </div>
                          <UsageBar percent={m.requests_percent} />
                          <small>{m.requests_used.toLocaleString()} / {m.requests_limit.toLocaleString()} requests</small>
                          {m.groq_live ? (
                            <div className="groq-live-line" title={`Captured ${timeAgo(m.groq_live.captured_at)} from Groq API rate-limit headers`}>
                              <span className="live-dot" />
                              Groq live: <strong>{m.groq_live.requests_remaining.toLocaleString()}</strong>/
                              {m.groq_live.requests_limit.toLocaleString()} requests left today ·
                              TPM window {m.groq_live.tpm_remaining.toLocaleString()}/{m.groq_live.tpm_limit.toLocaleString()}
                            </div>
                          ) : (
                            <div className="groq-live-line idle">
                              <span className="live-dot idle" />
                              Groq live: syncs on the next AI call
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="ops-card">
                  <div className="card-heading">
                    <div className="card-icon"><Users size={20} /></div>
                    <div>
                      <h2>Per-user consumption</h2>
                      <p>
                        Daily budgets per user:{' '}
                        {teamUsage.model_order
                          .map((k) => `${teamUsage.per_user_limits[k].label} ${(teamUsage.per_user_limits[k].tokens / 1000).toFixed(1)}k`)
                          .join(' · ')}{' '}
                        tokens — spent best-model-first.
                      </p>
                    </div>
                  </div>
                  {teamUsage.users.length === 0 ? (
                    <div className="empty-state">
                      <Users size={26} />
                      <strong>No activity yet today</strong>
                    </div>
                  ) : (
                    <div className="user-usage-table">
                      <div className="user-usage-head">
                        <span>User</span>
                        {teamUsage.model_order.map((k) => (
                          <span key={k}>{teamUsage.models[k].label}</span>
                        ))}
                        <span>FAQ</span>
                        <span>Logins</span>
                        <span>Last active</span>
                      </div>
                      {teamUsage.users.map((u) => (
                        <div key={u.email} className="user-usage-row">
                          <div className="user-cell">
                            <div className="avatar small">{(u.name || u.email)[0]?.toUpperCase()}</div>
                            <div>
                              <strong>{u.name}</strong>
                              <span>{u.email}</span>
                            </div>
                          </div>
                          {teamUsage.model_order.map((key) => {
                            const m = u.models[key]
                            return (
                              <div key={key} className="model-cell">
                                <div className="usage-row-top">
                                  <strong>{m.exhausted ? 'Limit' : `${m.percent_used}%`}</strong>
                                </div>
                                <UsageBar percent={m.percent_used} exhausted={m.exhausted} />
                                <small>{m.tokens_used.toLocaleString()} tok · {m.requests_used} req</small>
                              </div>
                            )
                          })}
                          <span className="faq-cell">{u.faq_hits}</span>
                          <span>{u.logins}</span>
                          <span className="muted-cell">{timeAgo(u.last_active)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {view === 'docs' && (
        <section className="admin-grid">
          <div className="ops-card upload-card">
            <div className="card-heading">
              <div className="card-icon">
                <FolderUp size={20} />
              </div>
              <div>
                <h2>Upload documents</h2>
                <p>PDF, Word, Excel, PowerPoint, and TXT files are parsed into retrievable chunks.</p>
              </div>
            </div>

            <div className="form-grid">
              <label>
                <span>SOP category</span>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label>
                <span>Client / plant</span>
                <input value={client} onChange={(e) => setClient(e.target.value)} placeholder="All Clients" />
              </label>
            </div>

            <div
              className={`drop-zone ${dragging ? 'dragging' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current.click()}
            >
              <UploadCloud size={34} />
              <strong>Drop SOP files here or browse</strong>
              <span>Supported: PDF, DOCX, XLSX, PPTX, TXT</span>
              <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.txt"
                onChange={(e) => handleFiles(Array.from(e.target.files))}
              />
            </div>

            {uploads.length > 0 && (
              <div className="upload-queue">
                <p className="section-kicker">Upload queue</p>
                {uploads.map((u, i) => (
                  <div key={`${u.name}-${i}`} className={`upload-job ${u.status}`}>
                    <div className="file-glyph">{fileIcon(u.name)}</div>
                    <div>
                      <strong>{u.name}</strong>
                      <span>{u.category} · {u.client}</span>
                    </div>
                    <small>
                      {statusIcon(u.status)}
                      {u.message}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ops-card health-card">
            <div className="card-heading">
              <div className="card-icon">
                <Shield size={20} />
              </div>
              <div>
                <h2>Index health</h2>
                <p>Current retrieval inventory for the SolarOps assistant.</p>
              </div>
            </div>
            <div className="health-list">
              <div>
                <span>Documents indexed</span>
                <strong>{stats.total_documents}</strong>
              </div>
              <div>
                <span>Vector chunks</span>
                <strong>{stats.total_chunks}</strong>
              </div>
              <div>
                <span>Manager delete access</span>
                <strong>{user.role === 'manager' ? 'Enabled' : 'Restricted'}</strong>
              </div>
            </div>
          </div>
        </section>
        )}

        {view === 'docs' && (
        <section className="ops-card documents-card">
          <div className="documents-card-header">
            <div>
              <h2>Documents in knowledge base</h2>
              <p>{stats.total_documents} documents · {stats.total_chunks} chunks indexed</p>
            </div>
          </div>

          {docs.length === 0 ? (
            <div className="empty-state">
              <Database size={30} />
              <strong>No documents ingested yet</strong>
              <span>Upload SOP files above to build the assistant knowledge base.</span>
            </div>
          ) : (
            <div className="doc-table">
              <div className="doc-table-head">
                <span>Document</span>
                <span>Category</span>
                <span>Client</span>
                <span>Chunks</span>
                <span />
              </div>
              {docs.map((d, i) => (
                <div key={`${d.filename}-${i}`} className="doc-row">
                  <span className="doc-name">
                    <span className="file-glyph">{fileIcon(d.filename)}</span>
                    {d.filename}
                  </span>
                  <span className="tag">{d.category}</span>
                  <span>{d.client}</span>
                  <strong>{d.total_chunks}</strong>
                  {user.role === 'manager' ? (
                    <button className="danger-icon" onClick={() => handleDelete(d.filename)} title="Delete document" aria-label={`Delete ${d.filename}`}>
                      <Trash2 size={16} />
                    </button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
        )}
      </main>
    </div>
  )
}

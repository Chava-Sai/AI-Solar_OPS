import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import {
  ArrowUp,
  Bot,
  Check,
  ChevronRight,
  Clipboard,
  Clock3,
  Database,
  History,
  LogOut,
  MessageSquarePlus,
  PanelLeftClose,
  Pencil,
  Search,
  Settings,
  Sparkles,
  Square,
  Star,
  Trash2,
  Zap,
} from 'lucide-react'
import { chatAPI, streamChat } from '../api/client'
import agsLogo from '../assets/ags-logo-hero-dark.png'

function formatReset(seconds) {
  if (seconds == null) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `Resets in ${h} hr ${m} min` : `Resets in ${m} min`
}

/** Build the model choice list dynamically from the usage snapshot. */
function modelChoices(usage) {
  const base = [{ key: null, label: 'Auto', short: 'Auto', hint: 'Best available model first' }]
  if (!usage?.model_order) return base
  return base.concat(usage.model_order.map((key) => {
    const m = usage.models[key]
    return {
      key,
      label: m.label,
      short: m.label.split(' ').pop(), // "GPT-OSS 120B" → "120B", "Llama 3.1 8B" → "8B"
      hint: `${m.tokens_limit.toLocaleString()} tokens/day`,
    }
  }))
}

/** Clickable daily-quota ring → Claude-style per-model usage panel. */
function UsageRing({ usage, modelPref, onPickModel }) {
  const [open, setOpen] = useState(false)
  if (!usage) return null
  const pct = Math.min(100, usage.percent_used || 0)
  const r = 8.5
  const c = 2 * Math.PI * r
  const tone = usage.limit_reached ? 'limit' : pct >= 75 ? 'warn' : 'ok'
  const order = usage.model_order || []

  return (
    <div className="usage-anchor">
      <button
        className={`usage-ring ${tone}`}
        onClick={() => setOpen((v) => !v)}
        title="Daily usage limits — click for details"
        aria-label={`Daily AI usage ${pct} percent — open details`}
      >
        <svg viewBox="0 0 22 22" width="22" height="22">
          <circle cx="11" cy="11" r={r} fill="none" strokeWidth="3" className="ring-track" />
          <circle
            cx="11" cy="11" r={r} fill="none" strokeWidth="3" strokeLinecap="round"
            className="ring-fill"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct / 100)}
            transform="rotate(-90 11 11)"
          />
        </svg>
        <span>{usage.limit_reached ? 'Limit' : `${pct}%`}</span>
      </button>

      {open && (
        <>
          <div className="usage-backdrop" onClick={() => setOpen(false)} />
          <div className="usage-panel" role="dialog" aria-label="Daily usage limits">
            <div className="usage-panel-head">
              <span>Daily usage limits · Groq free tier</span>
              <small>{formatReset(usage.resets_in_seconds)}</small>
            </div>

            {order.map((key) => {
              const m = usage.models[key]
              if (!m) return null
              const mTone = m.exhausted ? 'limit' : m.percent_used >= 75 ? 'warn' : 'ok'
              return (
                <div key={key} className="usage-row">
                  <div className="usage-row-top">
                    <span>{m.label}</span>
                    <strong>{m.exhausted ? 'Limit reached' : `${m.percent_used}%`}</strong>
                  </div>
                  <div className="usage-bar">
                    <div className={`usage-bar-fill ${mTone}`} style={{ width: `${m.percent_used}%` }} />
                  </div>
                  <small>
                    {m.tokens_used.toLocaleString()} / {m.tokens_limit.toLocaleString()} tokens ·{' '}
                    {m.requests_used}/{m.requests_limit} requests
                  </small>
                </div>
              )
            })}

            <div className="usage-faq-line">
              <Zap size={13} />
              FAQ instant answers: <strong>{usage.faq_hits}</strong> (free, unlimited)
            </div>

            <div className="usage-panel-head model-head">
              <span>Model preference</span>
            </div>
            <div className="model-choice-list">
              {modelChoices(usage).map((c2) => {
                const exhausted = Boolean(c2.key && usage.models[c2.key]?.exhausted)
                return (
                  <button
                    key={c2.label}
                    className={`model-choice ${modelPref === c2.key ? 'active' : ''}`}
                    disabled={exhausted}
                    onClick={() => { onPickModel(c2.key); setOpen(false) }}
                  >
                    <span>
                      {c2.label}
                      <small>{exhausted ? 'Daily limit reached' : c2.hint}</small>
                    </span>
                    {modelPref === c2.key && <Check size={15} />}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** One row in the sidebar chat list — open / favorite / rename / delete. */
function ConversationRow({
  conversation, isActive, isRenaming, renameValue, favoritesFull,
  onOpen, onToggleFavorite, onStartRename, onRenameChange, onCommitRename, onCancelRename, onDelete,
}) {
  return (
    <div className={`history-item ${isActive ? 'active' : ''}`}>
      {isRenaming ? (
        <input
          className="rename-input"
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitRename()
            if (e.key === 'Escape') onCancelRename()
          }}
          onBlur={onCommitRename}
        />
      ) : (
        <button className="history-item-main" onClick={onOpen}>
          <span>{conversation.title}</span>
          <small>{new Date(conversation.updatedAt).toLocaleDateString()}</small>
        </button>
      )}
      <div className="history-item-actions">
        <button
          className={`icon-mini favorite-btn ${conversation.favorite ? 'active' : ''}`}
          disabled={!conversation.favorite && favoritesFull}
          title={
            conversation.favorite
              ? 'Remove from favorites'
              : favoritesFull
                ? `Favorites full (max ${MAX_FAVORITE_CHATS}) — remove one first`
                : 'Add to favorites'
          }
          onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
        >
          <Star size={13} fill={conversation.favorite ? 'currentColor' : 'none'} />
        </button>
        <button className="icon-mini" title="Rename" onClick={(e) => { e.stopPropagation(); onStartRename() }}>
          <Pencil size={13} />
        </button>
        <button className="icon-mini danger" title="Delete" onClick={(e) => { e.stopPropagation(); onDelete() }}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

const ROLE_LABELS = {
  manager: 'Manager',
  lead_analyst: 'Lead Solar Analyst',
  solar_analyst: 'Solar Analyst',
}

const CATEGORIES = [
  'All SOPs',
  'Case Creation',
  'Alerts',
  'Aerial',
  'Scheduling',
  'Ops Review',
  'Reports',
  'PV Technical',
  'BESS',
]

const SUGGESTIONS = [
  {
    q: 'How do I create a reactive case in Softwrench?',
    kicker: 'Case Creation',
  },
  {
    q: 'What are the steps to notify an issue on an AES site?',
    kicker: 'Escalation',
  },
  {
    q: 'When does a case qualify for Ops Review?',
    kicker: 'Ops Review',
  },
  {
    q: 'How are solar plant alerts categorized?',
    kicker: 'Alerts',
  },
  {
    q: 'What is the case status flow for a preventative contract?',
    kicker: 'Maintenance',
  },
  {
    q: 'Walk me through the aerial inspection procedure',
    kicker: 'Aerial',
  },
]

const CONVERSATION_KEY = 'astra_conversations'
const MAX_RECENT_CHATS = 10   // rolling queue — oldest (by creation) auto-deleted beyond this
const MAX_FAVORITE_CHATS = 5  // permanent, never auto-evicted; only the owner can delete them

function readConversations(userEmail) {
  try {
    const all = JSON.parse(localStorage.getItem(CONVERSATION_KEY) || '[]')
    return all.filter((c) => c.userEmail === userEmail)
  } catch {
    return []
  }
}

function writeConversations(userEmail, nextForUser) {
  const all = JSON.parse(localStorage.getItem(CONVERSATION_KEY) || '[]')
  const others = all.filter((c) => c.userEmail !== userEmail)
  localStorage.setItem(CONVERSATION_KEY, JSON.stringify([...nextForUser, ...others]))
}

function titleFromMessages(messages) {
  const firstUser = messages.find((m) => m.role === 'user')?.text || 'New conversation'
  return firstUser.length > 54 ? `${firstUser.slice(0, 54)}...` : firstUser
}

function normalizeAnswerText(text = '') {
  return text.replace(/<br\s*\/?>/gi, '\n')
}

export default function Chat() {
  const navigate = useNavigate()
  const user = useMemo(() => JSON.parse(localStorage.getItem('astra_user') || '{}'), [])
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [category, setCategory] = useState('All SOPs')
  const [sideTab, setSideTab] = useState('categories')
  const [conversations, setConversations] = useState(() => readConversations(user.email))
  const [activeConversationId, setActiveConversationId] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [copied, setCopied] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [usage, setUsage] = useState(null)
  const [kb, setKb] = useState(null)
  const [modelPref, setModelPrefState] = useState(() => localStorage.getItem('astra_model_pref') || null)

  function setModelPref(key) {
    setModelPrefState(key)
    if (key) localStorage.setItem('astra_model_pref', key)
    else localStorage.removeItem('astra_model_pref')
  }

  const bottomRef = useRef(null)
  const taRef = useRef(null)
  const ctrlRef = useRef(null)
  const chatScrollRef = useRef(null)
  const sidebarScrollRef = useRef(null)
  // Guards against a stray blur (fired when Escape unmounts the rename input)
  // re-committing text that the user just cancelled.
  const suppressRenameBlur = useRef(false)

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: 0 })
    sidebarScrollRef.current?.scrollTo({ top: 0 })
    chatAPI.usage().then(({ data }) => {
      setUsage(data)
      // drop a saved model preference that no longer exists (e.g. old key names)
      const saved = localStorage.getItem('astra_model_pref')
      if (saved && !data?.models?.[saved]) {
        localStorage.removeItem('astra_model_pref')
        setModelPrefState(null)
      }
    }).catch(() => {})
    chatAPI.stats().then(({ data }) => setKb(data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streaming])

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 196)}px`
  }, [input])

  useEffect(() => {
    if (!activeConversationId || messages.length === 0 || streaming) return

    setConversations((prev) => {
      const existing = prev.find((c) => c.id === activeConversationId)
      const nextConversation = {
        id: activeConversationId,
        userEmail: user.email,
        // A manually-renamed title (titleLocked) is never overwritten by the
        // auto-generated "first message" title on later turns.
        title: existing?.titleLocked ? existing.title : titleFromMessages(messages),
        titleLocked: existing?.titleLocked || false,
        favorite: existing?.favorite || false,
        messages: messages.map(({ streaming: _streaming, sources: _sources, ...m }) => m),
        updatedAt: new Date().toISOString(),
        createdAt: existing?.createdAt || new Date().toISOString(),
      }
      const combined = [nextConversation, ...prev.filter((c) => c.id !== activeConversationId)]

      // Favorites are permanent — never auto-evicted. Non-favorites are a
      // rolling queue: oldest-by-creation is dropped once there are more
      // than MAX_RECENT_CHATS of them.
      const favorites = combined.filter((c) => c.favorite)
      const recents = combined
        .filter((c) => !c.favorite)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .slice(-MAX_RECENT_CHATS)

      const next = [...favorites, ...recents]
      writeConversations(user.email, next)
      return next
    })
  }, [activeConversationId, messages, streaming, user.email])

  function updateLast(patch) {
    setMessages((prev) => {
      const copy = [...prev]
      const i = copy.length - 1
      if (i < 0) return prev
      copy[i] = { ...copy[i], ...(typeof patch === 'function' ? patch(copy[i]) : patch) }
      return copy
    })
  }

  function send(q) {
    const query = (q || input).trim()
    if (!query || streaming) return
    const conversationId = activeConversationId || crypto.randomUUID()
    if (!activeConversationId) setActiveConversationId(conversationId)

    setInput('')
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: query },
      { role: 'ai', text: '', sources: [], streaming: true },
    ])
    setStreaming(true)

    ctrlRef.current = streamChat(
      { query, category_filter: category === 'All SOPs' ? null : category, model: modelPref },
      {
        onSources: () => {},
        onToken: (t) => updateLast((m) => ({ text: m.text + t })),
        onFaq: () => updateLast({ faq: true }),
        onLimit: () => updateLast({ limited: true }),
        onUsage: (snap) => setUsage(snap),
        onModel: (m) => updateLast({ modelLabel: m.label, switched: m.switched, switchReason: m.reason }),
        onError: (msg) => updateLast((m) => ({ text: `${m.text || ''}\n\n${msg}`, streaming: false })),
        onDone: () => {
          updateLast({ streaming: false })
          setStreaming(false)
          ctrlRef.current = null
        },
      },
    )
  }

  function stop() {
    ctrlRef.current?.abort()
  }

  async function copy(text, i) {
    try {
      await navigator.clipboard.writeText(normalizeAnswerText(text))
      setCopied(i)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      setCopied(null)
    }
  }

  async function loadHistory() {
    setSideTab('history')
    setConversations(readConversations(user.email))
  }

  function newChat() {
    if (streaming) return
    setMessages([])
    setActiveConversationId(null)
    chatScrollRef.current?.scrollTo({ top: 0 })
  }

  function openConversation(conversation) {
    if (streaming) return
    setActiveConversationId(conversation.id)
    setMessages(conversation.messages || [])
    requestAnimationFrame(() => {
      chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight })
    })
  }

  function toggleFavorite(conversationId) {
    setConversations((prev) => {
      const target = prev.find((c) => c.id === conversationId)
      if (!target) return prev
      const favoriteCount = prev.filter((c) => c.favorite).length
      if (!target.favorite && favoriteCount >= MAX_FAVORITE_CHATS) {
        alert(`You can only keep ${MAX_FAVORITE_CHATS} favorite chats. Remove one first.`)
        return prev
      }
      const next = prev.map((c) => (c.id === conversationId ? { ...c, favorite: !c.favorite } : c))
      writeConversations(user.email, next)
      return next
    })
  }

  function deleteConversation(conversationId) {
    if (!confirm('Delete this chat? This cannot be undone.')) return
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== conversationId)
      writeConversations(user.email, next)
      return next
    })
    if (activeConversationId === conversationId) {
      setMessages([])
      setActiveConversationId(null)
    }
  }

  function startRename(conversation) {
    setRenamingId(conversation.id)
    setRenameValue(conversation.title)
  }

  function commitRename() {
    if (suppressRenameBlur.current) {
      suppressRenameBlur.current = false
      return
    }
    if (!renamingId) return
    const trimmed = renameValue.trim()
    setConversations((prev) => {
      const next = prev.map((c) =>
        c.id === renamingId ? { ...c, title: trimmed || c.title, titleLocked: true } : c
      )
      writeConversations(user.email, next)
      return next
    })
    setRenamingId(null)
    setRenameValue('')
  }

  function cancelRename() {
    suppressRenameBlur.current = true
    setRenamingId(null)
    setRenameValue('')
  }

  function logout() {
    localStorage.clear()
    navigate('/login')
  }

  const firstName = user.name?.split(' ')[0] || 'there'
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'
  const canAdmin = ['manager', 'lead_analyst'].includes(user.role)

  const byRecentActivity = (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
  const favoriteConversations = conversations.filter((c) => c.favorite).sort(byRecentActivity)
  const recentConversations = conversations.filter((c) => !c.favorite).sort(byRecentActivity)

  return (
    <div className={`app-shell ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <aside className="sidebar">
        <div className="brand-lockup">
          <img className="brand-logo" src={agsLogo} alt="American Green Solutions" />
          <p className="brand-sub">SolarOps command center</p>
        </div>

        <button className="primary-nav-button" onClick={newChat}>
          <MessageSquarePlus size={17} />
          New chat
        </button>

        <div className="side-tabs" role="tablist" aria-label="Sidebar sections">
          <button className={sideTab === 'categories' ? 'active' : ''} onClick={() => setSideTab('categories')}>
            <Database size={14} />
            SOPs
          </button>
          <button className={sideTab === 'history' ? 'active' : ''} onClick={loadHistory}>
            <History size={14} />
            History
          </button>
        </div>

        <div className="sidebar-scroll" ref={sidebarScrollRef}>
          {sideTab === 'categories' ? (
            <>
              <p className="section-kicker">Knowledge scope</p>
              <div className="filter-stack">
                {CATEGORIES.map((c) => (
                  <button key={c} className={`filter-item ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>
                    <span>{c}</span>
                    {category === c && <ChevronRight size={15} />}
                  </button>
                ))}
              </div>

              <p className="section-kicker with-space">Fast prompts</p>
              <div className="prompt-list">
                {SUGGESTIONS.map((s) => (
                  <button key={s.q} className="prompt-item" onClick={() => send(s.q)}>
                    <span className="prompt-kicker">{s.kicker}</span>
                    <span>{s.q}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {favoriteConversations.length > 0 && (
                <>
                  <p className="section-kicker">
                    Favorites ({favoriteConversations.length}/{MAX_FAVORITE_CHATS})
                  </p>
                  <div className="history-list">
                    {favoriteConversations.map((conversation) => (
                      <ConversationRow
                        key={conversation.id}
                        conversation={conversation}
                        isActive={activeConversationId === conversation.id}
                        isRenaming={renamingId === conversation.id}
                        renameValue={renameValue}
                        favoritesFull={favoriteConversations.length >= MAX_FAVORITE_CHATS}
                        onOpen={() => openConversation(conversation)}
                        onToggleFavorite={() => toggleFavorite(conversation.id)}
                        onStartRename={() => startRename(conversation)}
                        onRenameChange={setRenameValue}
                        onCommitRename={commitRename}
                        onCancelRename={cancelRename}
                        onDelete={() => deleteConversation(conversation.id)}
                      />
                    ))}
                  </div>
                </>
              )}

              <p className="section-kicker with-space">
                Recent ({recentConversations.length}/{MAX_RECENT_CHATS})
              </p>
              {recentConversations.length === 0 ? (
                <div className="empty-panel">
                  <Clock3 size={20} />
                  <span>
                    {favoriteConversations.length > 0
                      ? 'No other recent chats.'
                      : 'No saved chats yet.'}
                  </span>
                </div>
              ) : (
                <div className="history-list">
                  {recentConversations.map((conversation) => (
                    <ConversationRow
                      key={conversation.id}
                      conversation={conversation}
                      isActive={activeConversationId === conversation.id}
                      isRenaming={renamingId === conversation.id}
                      renameValue={renameValue}
                      favoritesFull={favoriteConversations.length >= MAX_FAVORITE_CHATS}
                      onOpen={() => openConversation(conversation)}
                      onToggleFavorite={() => toggleFavorite(conversation.id)}
                      onStartRename={() => startRename(conversation)}
                      onRenameChange={setRenameValue}
                      onCommitRename={commitRename}
                      onCancelRename={cancelRename}
                      onDelete={() => deleteConversation(conversation.id)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="sidebar-user">
          <div className="avatar">{user.name?.[0]?.toUpperCase() || 'A'}</div>
          <div className="user-copy">
            <strong>{user.name || 'Astra User'}</strong>
            <span>{ROLE_LABELS[user.role] || 'SolarOps'}</span>
          </div>
          {canAdmin && (
            <button className="icon-button" onClick={() => navigate('/admin')} title="Admin panel" aria-label="Admin panel">
              <Settings size={17} />
            </button>
          )}
          <button className="icon-button" onClick={logout} title="Sign out" aria-label="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button className="ghost-icon desktop-only" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle sidebar">
              <PanelLeftClose size={18} />
            </button>
            <div>
              <p className="eyebrow">Solar operations assistant</p>
              <h1>SolarOps Assistant</h1>
            </div>
          </div>
          <div className="topbar-actions">
            <UsageRing usage={usage} modelPref={modelPref} onPickModel={setModelPref} />
            <div className="status-pill">
              {category}
            </div>
          </div>
        </header>

        <div className="chat-scroll" ref={chatScrollRef}>
          <div className="chat-column">
            {messages.length === 0 && (
              <section className="welcome-panel">
                <div className="welcome-copy">
                  <div className="hero-badge">
                    <Sparkles size={16} />
                    Clean Leaf SOP knowledge base
                  </div>
                  <h2>{greeting}, {firstName}.</h2>
                  <p>
                    Get clear operating steps for case creation, alerts, scheduling, aerial inspection,
                    ops review, and reporting.
                  </p>
                </div>
                <div className="metric-strip">
                  <div>
                    <strong>{kb?.total_documents ?? '—'}</strong>
                    <span>Documents indexed</span>
                  </div>
                  <div>
                    <strong>{kb?.total_chunks?.toLocaleString() ?? '—'}</strong>
                    <span>Knowledge chunks</span>
                  </div>
                  <div>
                    <strong>{kb?.faq?.faq_count ?? '—'}</strong>
                    <span>Instant FAQ answers</span>
                  </div>
                </div>
                <div className="suggestion-grid">
                  {SUGGESTIONS.slice(0, 4).map((s) => (
                    <button key={s.q} className="suggestion-card" onClick={() => send(s.q)}>
                      <span>{s.kicker}</span>
                      <strong>{s.q}</strong>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {messages.map((msg, i) => (
              <div key={`${msg.role}-${i}`} className={`message-row ${msg.role}`}>
                {msg.role === 'user' ? (
                  <div className="user-message">{msg.text}</div>
                ) : (
                  <>
                    <div className="assistant-avatar">
                      <Bot size={17} />
                    </div>
                    <div className="assistant-message">
                      {msg.switched && msg.switchReason && (
                        <div className="model-switch-note">
                          Switched to <strong>{msg.modelLabel}</strong> — {msg.switchReason}
                        </div>
                      )}
                      {msg.text === '' && msg.streaming ? (
                        <div className="typing" aria-label="Astra AI is typing">
                          <span />
                          <span />
                          <span />
                        </div>
                      ) : (
                        <div className="md-content">
                          <ReactMarkdown rehypePlugins={[rehypeRaw]}>{normalizeAnswerText(msg.text)}</ReactMarkdown>
                          {msg.streaming && <span className="stream-cursor" />}
                        </div>
                      )}

                      {!msg.streaming && msg.text && (
                        <div className="message-actions">
                          <button className="subtle-button" onClick={() => copy(msg.text, i)}>
                            {copied === i ? <Check size={14} /> : <Clipboard size={14} />}
                            {copied === i ? 'Copied' : 'Copy'}
                          </button>
                          {msg.faq && (
                            <span className="faq-badge" title="Answered instantly from the FAQ cache — does not use your daily AI quota">
                              <Zap size={12} />
                              Instant · FAQ
                            </span>
                          )}
                          {!msg.faq && msg.modelLabel && (
                            <span className="model-tag">{msg.modelLabel}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        <footer className="composer-zone">
          {usage?.limit_reached && (
            <div className="limit-banner" role="status">
              Daily AI limit reached — resets at midnight. Common questions are still
              answered instantly from the FAQ cache (free).
            </div>
          )}
          <div className="composer-model-row">
            <span>Model</span>
            <div className="model-segment" role="radiogroup" aria-label="Model preference">
              {modelChoices(usage).map((c2) => {
                const m = c2.key ? usage?.models?.[c2.key] : null
                const exhausted = Boolean(m?.exhausted)
                return (
                  <button
                    key={c2.label}
                    className={modelPref === c2.key ? 'active' : ''}
                    disabled={exhausted}
                    title={exhausted ? `${c2.label} daily limit reached` : `${c2.label} — ${c2.hint}`}
                    onClick={() => setModelPref(c2.key)}
                  >
                    {c2.short}
                    {m && <span className="seg-pct">{exhausted ? 'Limit' : `${m.percent_used}%`}</span>}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="composer-shell">
            <div className="composer-prefix">
              <Search size={18} />
            </div>
            <textarea
              ref={taRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Ask about an SOP, escalation, alert, case workflow, or report..."
            />
            {streaming ? (
              <button className="send-button stop" onClick={stop} title="Stop generation" aria-label="Stop generation">
                <Square size={15} fill="currentColor" />
              </button>
            ) : (
              <button className="send-button" onClick={() => send()} disabled={!input.trim()} title="Send" aria-label="Send">
                <ArrowUp size={19} />
              </button>
            )}
          </div>
          <p>Astra AI can make mistakes. Confirm critical field steps against source SOPs.</p>
        </footer>
      </main>
    </div>
  )
}

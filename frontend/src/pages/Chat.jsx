import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import {
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Clock3,
  Database,
  History,
  UserCog,
  LogOut,
  MessageSquarePlus,
  Menu,
  PanelLeftClose,
  Pencil,
  Search,
  Settings,
  Sparkles,
  Square,
  Star,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { chatAPI, streamChat } from '../api/client'
import { useAuth } from '../context/AuthContext'
import agsLogo from '../assets/ags-logo-hero-dark.png'

function formatReset(seconds) {
  if (seconds == null) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `Resets in ${h} hr ${m} min` : `Resets in ${m} min`
}

/**
 * Group models into families for the picker — solar analysts pick "GPT-OSS"
 * or "Llama", not a wall of raw model names/sizes. Clicking a family cycles
 * through its specific models (MODEL_ORDER priority order within the
 * family), mirroring how Claude's chat switches model versions.
 */
function familyList(usage) {
  if (!usage?.family_order) return []
  return usage.family_order.map((key) => ({
    key,
    label: usage.families[key].label,
    members: usage.families[key].members,
    percentUsed: usage.families[key].percent_used,
    exhausted: usage.families[key].exhausted,
  }))
}

function ModelSelector({ usage, modelPref, onPick, compact = false }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const selectedModel = modelPref ? usage?.models?.[modelPref] : null

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({
        bottom: window.innerHeight - r.top + 8,
        left: Math.max(12, Math.min(r.left, window.innerWidth - 390 - 12)),
      })
    }
    setOpen((v) => !v)
  }

  function pick(modelKey) {
    onPick(modelKey)
    setOpen(false)
  }

  return (
    <div className="model-selector-anchor">
      <button
        ref={btnRef}
        className={`model-selector-trigger ${compact ? 'compact' : ''} ${open ? 'open' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={toggle}
      >
        {compact ? (
          <>
            <Sparkles size={14} />
            <strong className="model-compact-label">{selectedModel?.label || 'Auto'}</strong>
          </>
        ) : (
          <>
            <span className="model-selector-icon"><Sparkles size={15} /></span>
            <span className="model-selector-copy">
              <small>AI model</small>
              <strong>{selectedModel?.label || 'Auto'}</strong>
            </span>
            {!selectedModel && <span className="recommended-badge">Recommended</span>}
          </>
        )}
        <ChevronDown size={16} className="model-selector-chevron" />
      </button>

      {open && pos && createPortal(
        <>
          <div className="usage-backdrop" onClick={() => setOpen(false)} />
          <div
            className="model-picker-panel"
            role="dialog"
            aria-label="Choose AI model"
            style={{ bottom: pos.bottom, left: pos.left }}
          >
            <div className="model-picker-head">
              <div>
                <strong>Choose AI model</strong>
                <span>Select a version or let Astra choose.</span>
              </div>
              <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close model selector">
                <X size={16} />
              </button>
            </div>

            <button className={`model-option auto ${modelPref === null ? 'active' : ''}`} onClick={() => pick(null)}>
              <span className="model-option-mark"><Sparkles size={16} /></span>
              <span className="model-option-copy">
                <strong>Auto <em>Recommended</em></strong>
                <small>Uses the best available model for each question</small>
              </span>
              {modelPref === null && <Check size={17} />}
            </button>

            <div className="model-family-list">
              {usage && familyList(usage).map((fam) => (
                <section className="model-family" key={fam.key}>
                  <div className="model-family-head">
                    <strong>{fam.label}</strong>
                    <span>{fam.exhausted ? 'Daily limit reached' : `${Math.max(0, 100 - fam.percentUsed)}% available`}</span>
                  </div>
                  {fam.members.map((memberKey) => {
                    const model = usage.models[memberKey]
                    return (
                      <button
                        key={memberKey}
                        className={`model-option ${modelPref === memberKey ? 'active' : ''}`}
                        disabled={model.exhausted}
                        onClick={() => pick(memberKey)}
                      >
                        <span className="model-version-dot" />
                        <span className="model-option-copy">
                          <strong>{model.label}</strong>
                          <small>{model.exhausted ? 'Unavailable until reset' : 'Available today'}</small>
                        </span>
                        {modelPref === memberKey && <Check size={17} />}
                      </button>
                    )
                  })}
                </section>
              ))}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

/** Compact daily-capacity control with a detailed usage breakdown. */
function UsageRing({ usage }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  if (!usage) return null
  const pct = Math.min(100, usage.percent_used || 0)
  const r = 8.5
  const c = 2 * Math.PI * r
  const tone = usage.limit_reached ? 'limit' : pct >= 75 ? 'warn' : 'ok'
  const available = Math.max(0, 100 - pct)

  function toggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 10, right: Math.max(12, window.innerWidth - rect.right) })
    }
    setOpen((value) => !value)
  }

  return (
    <div className="usage-anchor">
      <button
        ref={btnRef}
        className={`usage-ring ${tone}`}
        onClick={toggle}
        title="Open daily usage details"
        aria-label={`Daily AI usage, ${available} percent available — open details`}
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
        <span className="usage-ring-copy">
          <small>Daily usage</small>
          <strong className="usage-full-text">{usage.limit_reached ? 'Limit reached' : `${available}% available`}</strong>
          <strong className="usage-mobile-text">{usage.limit_reached ? 'Limit' : `${available}% left`}</strong>
        </span>
        <ChevronDown size={14} className="usage-chevron" />
      </button>

      {open && pos && createPortal(
        <>
          <div className="usage-backdrop" onClick={() => setOpen(false)} />
          <div className="usage-panel" role="dialog" aria-label="Daily usage limits" style={pos}>
            <div className="usage-panel-head">
              <span>Daily AI usage</span>
              <small>{formatReset(usage.resets_in_seconds)}</small>
            </div>

            <div className={`usage-overview ${tone}`}>
              <strong>{usage.limit_reached ? '0%' : `${available}%`}</strong>
              <span>{usage.limit_reached ? 'No model capacity remaining' : 'Available for today'}</span>
            </div>

            {familyList(usage).map((fam) => {
              const fTone = fam.exhausted ? 'limit' : fam.percentUsed >= 75 ? 'warn' : 'ok'
              return (
                <div key={fam.key} className="usage-row">
                  <div className="usage-row-top">
                    <span>{fam.label}</span>
                    <strong>{fam.exhausted ? 'Limit reached' : `${fam.percentUsed}%`}</strong>
                  </div>
                  <div className="usage-bar">
                    <div className={`usage-bar-fill ${fTone}`} style={{ width: `${fam.percentUsed}%` }} />
                  </div>
                  <small>Combined across {fam.members.length > 1 ? `all ${fam.label} sizes` : fam.label}</small>
                </div>
              )
            })}

            <div className="usage-faq-line">
              <Zap size={13} />
              FAQ instant answers: <strong>{usage.faq_hits}</strong> (free, unlimited)
            </div>

          </div>
        </>,
        document.body
      )}
    </div>
  )
}

/** One row in the sidebar chat list — open / favorite / rename / delete. */
function ConversationRow({
  conversation, isActive, isRenaming, renameValue, favoritesFull,
  onOpen, onToggleFavorite, onStartRename, onRenameChange, onCommitRename, onCancelRename, onDelete,
}) {
  // Long titles are ellipsis-truncated by default (so the favorite/rename/
  // delete icons never get squeezed out) — hovering pans the text left by
  // exactly its hidden overflow so the full title becomes readable, then
  // restores the ellipsis on mouse-leave. (A translateX-on-inline-block
  // version of this broke native text-overflow:ellipsis — an inline-block
  // child is an atomic box the browser won't clip mid-text, so it just hard-
  // cut the button instead of showing "…", and forced the button to its
  // full content width, pushing the action icons off the sidebar entirely.
  // Panning scrollLeft on the plain ellipsis span avoids both problems.)
  function handleTitleEnter(e) {
    const el = e.currentTarget
    el.style.textOverflow = 'clip'
    el.scrollLeft = el.scrollWidth - el.clientWidth
  }
  function handleTitleLeave(e) {
    const el = e.currentTarget
    el.scrollLeft = 0
    el.style.textOverflow = 'ellipsis'
  }

  return (
    <div className={`history-item ${isActive ? 'active' : ''}`}>
      {isRenaming ? (
        <div className="rename-shell">
          <input
            className="rename-input"
            autoFocus
            value={renameValue}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onCommitRename()
              if (e.key === 'Escape') onCancelRename()
            }}
          />
          <button className="icon-mini rename-save" title="Save title" aria-label="Save title" onClick={onCommitRename}>
            <Check size={13} />
          </button>
          <button className="icon-mini" title="Cancel rename" aria-label="Cancel rename" onClick={onCancelRename}>
            <X size={13} />
          </button>
        </div>
      ) : (
        <button className="history-item-main" onClick={onOpen}>
          <span
            className="history-item-title"
            onMouseEnter={handleTitleEnter}
            onMouseLeave={handleTitleLeave}
          >
            {conversation.title}
          </span>
          <small>{new Date(conversation.updatedAt).toLocaleDateString()}</small>
        </button>
      )}
      {!isRenaming && <div className="history-item-actions">
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
      </div>}
    </div>
  )
}

const ROLE_LABELS = {
  admin: 'Admin',
  user: 'User',
}

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

const MAX_RECENT_CHATS = 10   // rolling queue — oldest (by creation) auto-deleted beyond this
const MAX_FAVORITE_CHATS = 5  // permanent, never auto-evicted; only the owner can delete them

// Conversations live server-side (per account, scoped by the JWT — see
// backend/app/conversations.py), not in browser localStorage, so Recent and
// Favorites are identical whichever browser or device you're signed in from.
function dedupeConversations(conversations) {
  const seenIds = new Set()
  const recentContent = new Map()

  return [...conversations]
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .filter((conversation) => {
      if (!conversation?.id || seenIds.has(conversation.id)) return false
      seenIds.add(conversation.id)

      const signature = JSON.stringify(
        (conversation.messages || []).map(({ role, text }) => ({ role, text }))
      )
      const createdAt = new Date(conversation.createdAt || conversation.updatedAt || 0).getTime()
      const previousCreatedAt = recentContent.get(signature)
      if (signature !== '[]' && previousCreatedAt != null && Math.abs(previousCreatedAt - createdAt) < 30000) {
        return false
      }
      recentContent.set(signature, createdAt)
      return true
    })
}

async function readConversations() {
  try {
    const { data } = await chatAPI.getConversations()
    const raw = data.conversations || []
    const normalized = dedupeConversations(raw)
    if (normalized.length !== raw.length) {
      await chatAPI.saveConversations(normalized).catch(() => {})
    }
    return normalized
  } catch {
    return []
  }
}

let conversationWriteQueue = Promise.resolve()

function writeConversations(nextForUser) {
  const normalized = dedupeConversations(nextForUser)
  conversationWriteQueue = conversationWriteQueue
    .catch(() => {})
    .then(() => chatAPI.saveConversations(normalized))
  return conversationWriteQueue
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
  const { user, logout: authLogout } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [category, setCategory] = useState('All SOPs')
  const [clientFilter, setClientFilter] = useState(null)
  const [expandedClient, setExpandedClient] = useState(null)
  const [sideTab, setSideTab] = useState('categories')
  const [conversations, setConversations] = useState([])
  const [activeConversationId, setActiveConversationId] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [copied, setCopied] = useState(null)
  // On narrow screens the sidebar becomes an overlay drawer (see the 980px
  // breakpoint in index.css) — default it closed there so it doesn't cover
  // the chat on first load, same as it's always been on desktop (open).
  const [sidebarOpen, setSidebarOpen] = useState(() => (
    typeof window === 'undefined' || window.innerWidth > 980
  ))
  const [usage, setUsage] = useState(null)
  const [kb, setKb] = useState(null)
  const [modelPref, setModelPrefState] = useState(() => localStorage.getItem('astra_model_pref') || null)

  function setModelPref(key) {
    setModelPrefState(key)
    if (key) localStorage.setItem('astra_model_pref', key)
    else localStorage.removeItem('astra_model_pref')
  }

  // Knowledge scope, client-first: real client names (from ingested docs),
  // each expandable to its own categories. Technical Library sorts last —
  // it's a catch-all for technical books, not a real client/plant.
  const knowledgeClients = useMemo(() => {
    const docs = kb?.documents || []
    const map = new Map()
    for (const d of docs) {
      if (!d.client) continue
      if (!map.has(d.client)) map.set(d.client, new Set())
      map.get(d.client).add(d.category)
    }
    const entries = [...map.entries()].map(([name, cats]) => ({ name, categories: [...cats].sort() }))
    entries.sort((a, b) => {
      if (a.name === 'Technical Library') return 1
      if (b.name === 'Technical Library') return -1
      return a.name.localeCompare(b.name)
    })
    return entries
  }, [kb])

  const bottomRef = useRef(null)
  const taRef = useRef(null)
  const ctrlRef = useRef(null)
  const sendingRef = useRef(false)
  const chatScrollRef = useRef(null)
  const sidebarScrollRef = useRef(null)

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
    readConversations().then(setConversations)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 980px)')
    const syncSidebarToViewport = () => setSidebarOpen(!mq.matches)

    syncSidebarToViewport()
    if (mq.addEventListener) {
      mq.addEventListener('change', syncSidebarToViewport)
      return () => mq.removeEventListener('change', syncSidebarToViewport)
    }
    mq.addListener(syncSidebarToViewport)
    return () => mq.removeListener(syncSidebarToViewport)
  }, [])

  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
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
        messages: messages.map(({ streaming: _streaming, ...m }) => m),
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
      writeConversations(next).catch(() => {})
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
    if (!query || sendingRef.current) return
    sendingRef.current = true
    if (window.matchMedia('(max-width: 980px)').matches) setSidebarOpen(false)
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
      { query, category_filter: category === 'All SOPs' ? null : category, client_filter: clientFilter, model: modelPref },
      {
        onSources: (sources) => updateLast({ sources }),
        onToken: (t) => updateLast((m) => ({ text: m.text + t })),
        onFaq: () => updateLast({ faq: true }),
        onLimit: () => updateLast({ limited: true }),
        onUsage: (snap) => setUsage(snap),
        onModel: (m) => updateLast({ modelLabel: m.label, switched: m.switched, switchReason: m.reason }),
        onError: (msg) => updateLast((m) => ({ text: `${m.text || ''}\n\n${msg}`, streaming: false })),
        onDone: () => {
          updateLast({ streaming: false })
          setStreaming(false)
          sendingRef.current = false
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
    setConversations(await readConversations())
  }

  function newChat() {
    if (streaming) return
    setMessages([])
    setActiveConversationId(null)
    if (window.matchMedia('(max-width: 980px)').matches) setSidebarOpen(false)
    chatScrollRef.current?.scrollTo({ top: 0 })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function openConversation(conversation) {
    if (streaming) return
    setActiveConversationId(conversation.id)
    setMessages(conversation.messages || [])
    if (window.matchMedia('(max-width: 980px)').matches) setSidebarOpen(false)
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
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
      writeConversations(next).catch(() => {})
      return next
    })
  }

  async function deleteConversation(conversationId) {
    if (!confirm('Delete this chat? This cannot be undone.')) return
    const previous = conversations
    const next = conversations.filter((c) => c.id !== conversationId)
    setConversations(next)
    if (activeConversationId === conversationId) {
      setMessages([])
      setActiveConversationId(null)
    }
    try {
      await writeConversations(next)
    } catch {
      setConversations(previous)
      alert('The chat could not be deleted. Please try again.')
    }
  }

  function startRename(conversation) {
    setRenamingId(conversation.id)
    setRenameValue(conversation.title)
  }

  function commitRename() {
    if (!renamingId) return
    const trimmed = renameValue.trim()
    setConversations((prev) => {
      const next = prev.map((c) =>
        c.id === renamingId ? { ...c, title: trimmed || c.title, titleLocked: true } : c
      )
      writeConversations(next).catch(() => {})
      return next
    })
    setRenamingId(null)
    setRenameValue('')
  }

  function cancelRename() {
    setRenamingId(null)
    setRenameValue('')
  }

  async function logout() {
    await authLogout()
    navigate('/login')
  }

  const firstName = user.name?.split(' ')[0] || 'there'
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'
  const canAdmin = user.role === 'admin'

  const byRecentActivity = (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
  const favoriteConversations = conversations.filter((c) => c.favorite).sort(byRecentActivity)
  const recentConversations = conversations.filter((c) => !c.favorite).sort(byRecentActivity)

  return (
    <div className={`app-shell sales-hub-shell ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      <div className="suite-topbar">
        <div className="suite-left">
          <button className="suite-round" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle navigation">
            <Menu size={19} />
          </button>
        </div>
        <div className="suite-title">
          <strong>AGS</strong>
          <span>Astra</span>
        </div>
        <div className="suite-right" />
      </div>

      {sidebarOpen && (
        <div className="sidebar-mobile-backdrop" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className="sidebar">
        <button className="sidebar-close" onClick={() => setSidebarOpen(false)} title="Close navigation" aria-label="Close navigation">
          <X size={18} />
        </button>
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
                <button
                  className={`filter-item ${category === 'All SOPs' ? 'active' : ''}`}
                  onClick={() => { setCategory('All SOPs'); setClientFilter(null) }}
                >
                  <span>All SOPs</span>
                  {category === 'All SOPs' && <ChevronRight size={15} />}
                </button>
                {knowledgeClients.map((c) => (
                  <div key={c.name} className="client-scope-group">
                    <button
                      className={`filter-item client-item ${expandedClient === c.name ? 'expanded' : ''}`}
                      onClick={() => setExpandedClient((v) => (v === c.name ? null : c.name))}
                    >
                      <span>{c.name}</span>
                      <ChevronRight size={15} className="client-chevron" />
                    </button>
                    {expandedClient === c.name && (
                      <div className="client-scope-categories">
                        {c.categories.map((cat) => (
                          <button
                            key={cat}
                            className={`filter-item sub-item ${category === cat && clientFilter === c.name ? 'active' : ''}`}
                            onClick={() => { setCategory(cat); setClientFilter(c.name) }}
                          >
                            <span>{cat}</span>
                            {category === cat && clientFilter === c.name && <ChevronRight size={14} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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
          <button className="icon-button" onClick={() => navigate('/settings')} title="Change password" aria-label="Change password">
            <UserCog size={17} />
          </button>
          <button className="icon-button" onClick={logout} title="Sign out" aria-label="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button className="ghost-icon" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle sidebar">
              <PanelLeftClose size={18} />
            </button>
            <div>
              <h1>AGS Solar Ops</h1>
              <p className="eyebrow">Smarter operations intelligence</p>
            </div>
          </div>
          <div className="topbar-actions">
            <UsageRing usage={usage} />
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
                {canAdmin && (
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
                )}
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
                          <ReactMarkdown skipHtml>{normalizeAnswerText(msg.text)}</ReactMarkdown>
                          {msg.streaming && <span className="stream-cursor" />}
                        </div>
                      )}

                      {!msg.streaming && msg.sources?.length > 0 && (
                        <div className="source-block">
                          <div className="source-title">
                            <Database size={13} />
                            Sources used
                          </div>
                          <div className="source-chips">
                            {msg.sources.map((source, sourceIndex) => (
                              <span
                                className="source-chip"
                                key={`${source.document}-${source.page}-${source.section}-${sourceIndex}`}
                                title={[source.document, source.section, source.page].filter(Boolean).join(' · ')}
                              >
                                {source.document}
                                {source.page && <small>{source.page}</small>}
                              </span>
                            ))}
                          </div>
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
            {messages.length > 0 && (
              <div className="chat-bottom-spacer" ref={bottomRef} aria-hidden="true" />
            )}
          </div>
        </div>

        <footer className="composer-zone">
          {usage?.limit_reached && (
            <div className="limit-banner" role="status">
              Daily AI limit reached — resets at midnight. Common questions are still
              answered instantly from the FAQ cache (free).
            </div>
          )}
          <div className="composer-shell integrated">
            <div className="composer-input-row">
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
            </div>
            <div className="composer-toolbar">
              <ModelSelector compact usage={usage} modelPref={modelPref} onPick={setModelPref} />
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
          </div>
          <p>Astra AI can make mistakes. Confirm critical field steps against source SOPs.</p>
        </footer>
      </main>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  UserCog,
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
import { authAPI, chatAPI, streamChat } from '../api/client'
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

function shortLabel(fullLabel) {
  return fullLabel.split(' ').pop() // "GPT-OSS 120B" → "120B", "Llama 3.1 8B" → "8B"
}

/** Which specific member of this family is currently selected, if any. */
function activeMemberOf(family, modelPref) {
  return family.members.includes(modelPref) ? modelPref : null
}

/**
 * A family's picker button. Single-model families select directly on click;
 * multi-model families open a small portal-rendered flyout listing each
 * specific size as its own selectable row (checkmark on the active one) —
 * explicit choices, not a "click again to cycle" guessing game.
 */
function FamilyPickerButton({ fam, usage, modelPref, onPick, variant = 'segment' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const active = activeMemberOf(fam, modelPref)
  const activeModel = active ? usage.models[active] : null
  const multi = fam.members.length > 1

  function toggle() {
    if (!multi) {
      onPick(fam.members[0])
      return
    }
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ bottom: window.innerHeight - r.top + 8, left: Math.max(8, Math.min(r.left, window.innerWidth - 240 - 12)) })
    }
    setOpen((v) => !v)
  }

  function pick(memberKey) {
    onPick(memberKey)
    setOpen(false)
  }

  return (
    <>
      <button
        ref={btnRef}
        className={variant === 'segment' ? (active ? 'active' : '') : `model-choice ${active ? 'active' : ''}`}
        disabled={fam.exhausted}
        title={fam.exhausted ? `${fam.label} daily limit reached` : multi ? `${fam.label} — choose a size` : fam.label}
        onClick={toggle}
      >
        {variant === 'segment' ? (
          <>
            {fam.label}
            {active && <small className="seg-size">{shortLabel(activeModel.label)}</small>}
            {multi && <ChevronRight size={11} className={`seg-cycle ${open ? 'open' : ''}`} />}
            <span className="seg-pct">{fam.exhausted ? 'Limit' : `${fam.percentUsed}%`}</span>
          </>
        ) : (
          <>
            <span>
              {fam.label}
              <small>
                {fam.exhausted
                  ? 'Daily limit reached'
                  : activeModel
                    ? `Using ${shortLabel(activeModel.label)} · ${activeModel.percent_used}% used`
                    : multi ? `${fam.percentUsed}% used today — choose a size` : `${fam.percentUsed}% used today`}
              </small>
            </span>
            {active ? <Check size={15} /> : multi && <ChevronRight size={14} />}
          </>
        )}
      </button>
      {open && multi && pos && createPortal(
        <>
          <div className="usage-backdrop" onClick={() => setOpen(false)} />
          <div className="family-flyout" style={{ position: 'fixed', bottom: pos.bottom, left: pos.left }}>
            {fam.members.map((m) => {
              const model = usage.models[m]
              return (
                <button
                  key={m}
                  className={`model-choice ${modelPref === m ? 'active' : ''}`}
                  disabled={model.exhausted}
                  onClick={() => pick(m)}
                >
                  <span>
                    {shortLabel(model.label)}
                    <small>{model.exhausted ? 'Daily limit reached' : `${model.percent_used}% used`}</small>
                  </span>
                  {modelPref === m && <Check size={14} />}
                </button>
              )
            })}
          </div>
        </>,
        document.body
      )}
    </>
  )
}

/**
 * Account settings — rename + password change. Rendered through a portal
 * (not inline in the sidebar) because the sidebar has `overflow: hidden` for
 * its own internal scroll areas, which was silently clipping this popover
 * when it lived inside `.sidebar-user`; a fixed-position portal escapes that
 * entirely and stays anchored to the trigger button regardless.
 */
function SettingsButton({ user }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)

  const [name, setName] = useState(user.name || '')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameError, setNameError] = useState('')
  const [nameDone, setNameDone] = useState(false)

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwDone, setPwDone] = useState(false)

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ bottom: window.innerHeight - r.top + 10, left: Math.min(r.left, window.innerWidth - 330 - 12) })
    }
    setOpen((v) => !v)
    setName(user.name || '')
    setNameError('')
    setNameDone(false)
    setCurrentPw('')
    setNewPw('')
    setConfirmPw('')
    setPwError('')
    setPwDone(false)
  }

  async function saveName(e) {
    e.preventDefault()
    setNameError('')
    if (!name.trim()) return setNameError('Name can\'t be empty.')
    setNameSaving(true)
    try {
      const { data } = await authAPI.updateProfile(name.trim())
      localStorage.setItem('astra_token', data.access_token)
      localStorage.setItem('astra_user', JSON.stringify(data.user))
      setNameDone(true)
      setTimeout(() => window.location.reload(), 700)
    } catch (err) {
      setNameError(err.response?.data?.detail || 'Could not update name.')
    } finally {
      setNameSaving(false)
    }
  }

  async function savePassword(e) {
    e.preventDefault()
    setPwError('')
    if (newPw.length < 6) return setPwError('New password must be at least 6 characters.')
    if (newPw !== confirmPw) return setPwError('New passwords do not match.')
    setPwSaving(true)
    try {
      await authAPI.changePassword(currentPw, newPw)
      setPwDone(true)
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (err) {
      setPwError(err.response?.data?.detail || 'Could not update password.')
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <>
      <button ref={btnRef} className="icon-button" onClick={toggle} title="Account settings" aria-label="Account settings">
        <UserCog size={17} />
      </button>
      {open && pos && createPortal(
        <>
          <div className="usage-backdrop" onClick={() => setOpen(false)} />
          <div className="usage-panel settings-panel" role="dialog" aria-label="Account settings" style={{ position: 'fixed', bottom: pos.bottom, left: pos.left, top: 'auto', right: 'auto' }}>
            <div className="usage-panel-head">
              <span>Account settings</span>
            </div>

            <form className="auth-form" onSubmit={saveName}>
              <label>
                <span>Display name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                <span>Email</span>
                <input value={user.email || ''} disabled title="Email is your login and can't be changed here" />
              </label>
              {nameError && <div className="error-banner">{nameError}</div>}
              <button type="submit" className="cta-button" disabled={nameSaving}>
                {nameDone ? 'Saved ✓' : nameSaving ? 'Saving…' : 'Save name'}
              </button>
            </form>

            <div className="usage-panel-head model-head">
              <span>Change password</span>
            </div>
            {pwDone ? (
              <div className="empty-state">
                <Check size={22} />
                <strong>Password updated</strong>
              </div>
            ) : (
              <form className="auth-form" onSubmit={savePassword}>
                <label>
                  <span>Current password</span>
                  <input type="password" required value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
                </label>
                <label>
                  <span>New password</span>
                  <input type="password" required minLength={6} value={newPw} onChange={(e) => setNewPw(e.target.value)} />
                </label>
                <label>
                  <span>Confirm new password</span>
                  <input type="password" required value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
                </label>
                {pwError && <div className="error-banner">{pwError}</div>}
                <button type="submit" className="cta-button" disabled={pwSaving}>
                  {pwSaving ? 'Saving…' : 'Update password'}
                </button>
              </form>
            )}
          </div>
        </>,
        document.body
      )}
    </>
  )
}

/** Clickable daily-quota ring → Claude-style per-model usage panel. */
function UsageRing({ usage, modelPref, onPickModel }) {
  const [open, setOpen] = useState(false)
  if (!usage) return null
  const pct = Math.min(100, usage.percent_used || 0)
  const r = 8.5
  const c = 2 * Math.PI * r
  const tone = usage.limit_reached ? 'limit' : pct >= 75 ? 'warn' : 'ok'

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

            <div className="usage-panel-head model-head">
              <span>Model preference</span>
            </div>
            <div className="model-choice-list">
              <button
                className={`model-choice ${modelPref === null ? 'active' : ''}`}
                onClick={() => { onPickModel(null); setOpen(false) }}
              >
                <span>
                  Auto
                  <small>Best available model first</small>
                </span>
                {modelPref === null && <Check size={15} />}
              </button>
              {familyList(usage).map((fam) => (
                <FamilyPickerButton
                  key={fam.key}
                  fam={fam}
                  usage={usage}
                  modelPref={modelPref}
                  onPick={(key) => { onPickModel(key); setOpen(false) }}
                  variant="list"
                />
              ))}
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
async function readConversations() {
  try {
    const { data } = await chatAPI.getConversations()
    return data.conversations || []
  } catch {
    return []
  }
}

function writeConversations(nextForUser) {
  chatAPI.saveConversations(nextForUser).catch(() => {})
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
      writeConversations(next)
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
      { query, category_filter: category === 'All SOPs' ? null : category, client_filter: clientFilter, model: modelPref },
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
    setConversations(await readConversations())
  }

  function newChat() {
    if (streaming) return
    setMessages([])
    setActiveConversationId(null)
    chatScrollRef.current?.scrollTo({ top: 0 })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function openConversation(conversation) {
    if (streaming) return
    setActiveConversationId(conversation.id)
    setMessages(conversation.messages || [])
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
      writeConversations(next)
      return next
    })
  }

  function deleteConversation(conversationId) {
    if (!confirm('Delete this chat? This cannot be undone.')) return
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== conversationId)
      writeConversations(next)
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
      writeConversations(next)
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
    localStorage.removeItem('astra_token')
    localStorage.removeItem('astra_user')
    navigate('/login')
  }

  const firstName = user.name?.split(' ')[0] || 'there'
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'
  const canAdmin = user.role === 'admin'

  const byRecentActivity = (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
  const favoriteConversations = conversations.filter((c) => c.favorite).sort(byRecentActivity)
  const recentConversations = conversations.filter((c) => !c.favorite).sort(byRecentActivity)

  return (
    <div className={`app-shell ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      {sidebarOpen && (
        <div className="sidebar-mobile-backdrop" onClick={() => setSidebarOpen(false)} />
      )}
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
          <SettingsButton user={user} />
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
              <button
                className={modelPref === null ? 'active' : ''}
                title="Auto — best available model first"
                onClick={() => setModelPref(null)}
              >
                Auto
              </button>
              {usage && familyList(usage).map((fam) => (
                <FamilyPickerButton
                  key={fam.key}
                  fam={fam}
                  usage={usage}
                  modelPref={modelPref}
                  onPick={setModelPref}
                  variant="segment"
                />
              ))}
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

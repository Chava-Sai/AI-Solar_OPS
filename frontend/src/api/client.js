import axios from 'axios'

// In dev, Vite proxies '/api' to localhost:8000 (see vite.config.js).
// In production (Vercel), set VITE_API_URL to the deployed backend's base
// URL (e.g. https://astra-ai-backend.onrender.com) — no trailing slash.
const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api'

const api = axios.create({ baseURL: API_BASE })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('astra_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('astra_token')
      localStorage.removeItem('astra_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
}

export const chatAPI = {
  query:   (query, client_filter, category_filter) =>
             api.post('/chat/query', { query, client_filter, category_filter }),
  history: () => api.get('/chat/history'),
  stats:   () => api.get('/chat/stats'),
  usage:   () => api.get('/chat/usage'),
  adminUsage: () => api.get('/chat/admin/usage'),
}

/**
 * Stream a chat answer token-by-token over SSE.
 * Callbacks: onSources(list), onToken(text), onFaq(info), onLimit(msg),
 *            onUsage(snapshot), onDone(), onError(msg)
 * Returns an AbortController so the caller can stop generation.
 */
export function streamChat(
  { query, client_filter = null, category_filter = null, model = null },
  { onSources, onToken, onFaq, onLimit, onUsage, onModel, onDone, onError } = {}
) {
  const controller = new AbortController()
  const token = localStorage.getItem('astra_token')

  ;(async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query, client_filter, category_filter, model }),
        signal: controller.signal,
      })

      if (res.status === 401) {
        localStorage.removeItem('astra_token')
        localStorage.removeItem('astra_user')
        window.location.href = '/login'
        return
      }
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE frames are separated by a blank line
        const frames = buffer.split('\n\n')
        buffer = frames.pop() || ''

        for (const frame of frames) {
          const line = frame.trim()
          if (!line.startsWith('data:')) continue
          let data
          try { data = JSON.parse(line.slice(5).trim()) } catch { continue }

          if (data.type === 'sources')      onSources?.(data.sources || [])
          else if (data.type === 'token')   onToken?.(data.text || '')
          else if (data.type === 'faq')     onFaq?.(data)
          else if (data.type === 'limit')   onLimit?.(data.message || '')
          else if (data.type === 'usage')   onUsage?.(data)
          else if (data.type === 'model')   onModel?.(data)
          else if (data.type === 'error')   onError?.(data.message || 'Generation error')
          else if (data.type === 'done')    onDone?.()
        }
      }
      onDone?.()
    } catch (err) {
      if (err.name === 'AbortError') { onDone?.(); return }
      onError?.('Could not reach the server. Make sure the backend is running.')
    }
  })()

  return controller
}

export const docsAPI = {
  upload: (file, category, client_name) => {
    const form = new FormData()
    form.append('file', file)
    form.append('category', category)
    form.append('client_name', client_name)
    return api.post('/docs/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  status: (jobId)    => api.get(`/docs/status/${jobId}`),
  list:   ()         => api.get('/docs/list'),
  delete: (filename) => api.delete(`/docs/${encodeURIComponent(filename)}`),
}

export default api

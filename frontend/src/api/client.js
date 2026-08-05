import axios from 'axios'

// /api is always same-origin: Vite proxies it to localhost:8000 in dev (see
// vite.config.js), and Vercel proxies it to the Cloud Run backend in
// production (see vercel.json rewrites). The session lives in an httpOnly
// cookie the browser attaches automatically on same-origin requests — no
// token is ever stored in JS-reachable memory or localStorage.
const api = axios.create({ baseURL: '/api', withCredentials: true })

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthRequest = err.config?.url?.includes('/auth/login') || err.config?.url?.includes('/auth/me')
    if (err.response?.status === 401 && !isAuthRequest) {
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  changePassword: (current_password, new_password) =>
    api.post('/auth/change-password', { current_password, new_password }),
  updateProfile: (name) => api.put('/auth/profile', { name }),
}

export const adminAPI = {
  listUsers:  () => api.get('/admin/users'),
  createUser: (email, name, password, role) => api.post('/admin/users', { email, name, password, role }),
  deleteUser: (email) => api.delete(`/admin/users/${encodeURIComponent(email)}`),
}

export const chatAPI = {
  query:   (query, client_filter, category_filter) =>
             api.post('/chat/query', { query, client_filter, category_filter }),
  history: () => api.get('/chat/history'),
  stats:   () => api.get('/chat/stats'),
  usage:   () => api.get('/chat/usage'),
  adminUsage: () => api.get('/chat/admin/usage'),
  getConversations:  () => api.get('/chat/conversations'),
  saveConversations: (conversations) => api.put('/chat/conversations', { conversations }),
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

  ;(async () => {
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      onDone?.()
    }

    try {
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ query, client_filter, category_filter, model }),
        signal: controller.signal,
      })

      if (res.status === 401) {
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
          else if (data.type === 'done')    finish()
        }
      }
      finish()
    } catch (err) {
      if (err.name === 'AbortError') { finish(); return }
      onError?.('Could not reach the server. Make sure the backend is running.')
      finish()
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

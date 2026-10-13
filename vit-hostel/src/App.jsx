import { useState, useEffect, useCallback, useRef } from 'react'
import LoginPage from './components/LoginPage'
import StudentDashboard from './components/StudentDashboard'
import WardenPanel from './components/WardenPanel'
import ChangePasswordForm from './components/ChangePasswordForm'
import { apiRequest, getToken, setToken, clearToken } from './api'
import './App.css'

const WARDEN_PAGE_SIZE = 20
const initialWardenQuery = { status: 'all', page: 1 }
const initialWardenMeta = { page: 1, pages: 1, total: 0, counts: { total: 0, open: 0, completed: 0 } }

function App() {
  const [user, setUser] = useState(null)
  const [checkingSession, setCheckingSession] = useState(Boolean(getToken()))
  const [sessionError, setSessionError] = useState('')
  const [complaints, setComplaints] = useState([])
  const [loadingComplaints, setLoadingComplaints] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [wardenQuery, setWardenQuery] = useState(initialWardenQuery)
  const [wardenMeta, setWardenMeta] = useState(initialWardenMeta)
  const [actionError, setActionError] = useState('')
  const requestIdRef = useRef(0)

  // Restore the logged-in user from a saved token. Only a 401 logs out;
  // network/server errors keep the token and offer a retry.
  const restoreSession = useCallback(() => {
    if (!getToken()) {
      setCheckingSession(false)
      return
    }
    setCheckingSession(true)
    setSessionError('')
    apiRequest('/api/auth/me')
      .then(setUser)
      .catch((error) => {
        if (error.status === 401) clearToken()
        else setSessionError(error.message)
      })
      .finally(() => setCheckingSession(false))
  }, [])

  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  const handleLogout = useCallback(() => {
    requestIdRef.current++ // discard any in-flight complaints request
    clearToken()
    setUser(null)
    setSessionError('')
    setComplaints([])
    setLoadError('')
    setLoadingComplaints(false)
    setWardenQuery(initialWardenQuery)
    setWardenMeta(initialWardenMeta)
    setActionError('')
  }, [])

  // Students get a plain array; wardens get one page plus counts for the current filter.
  const loadComplaints = useCallback(async () => {
    if (!user || user.mustChangePassword) return
    const id = ++requestIdRef.current
    setLoadingComplaints(true)
    setLoadError('')
    try {
      if (user.role === 'warden') {
        const { status, page } = wardenQuery
        const data = await apiRequest(
          `/api/complaints?status=${encodeURIComponent(status)}&page=${page}&limit=${WARDEN_PAGE_SIZE}`
        )
        if (id !== requestIdRef.current) return
        // The page emptied (e.g. its last complaint left the filter): step back one page
        if (data.complaints.length === 0 && page > 1) {
          setWardenQuery((q) => (q.page === page ? { ...q, page: page - 1 } : q))
          return
        }
        setComplaints(data.complaints)
        setWardenMeta({ page: data.page, pages: data.pages, total: data.total, counts: data.counts })
      } else {
        const data = await apiRequest('/api/complaints/mine')
        if (id === requestIdRef.current) setComplaints(data)
      }
    } catch (error) {
      if (id !== requestIdRef.current) return
      if (error.status === 401) return handleLogout()
      setLoadError(error.message)
    } finally {
      if (id === requestIdRef.current) setLoadingComplaints(false)
    }
  }, [user, wardenQuery, handleLogout])

  useEffect(() => {
    loadComplaints()
  }, [loadComplaints])

  function handleLogin({ token, user }) {
    setToken(token)
    setUser(user)
  }

  // The old token is invalid after a password change, so store the new one
  function handlePasswordChanged({ token, user }) {
    setToken(token)
    setUser(user)
  }

  function changeWardenQuery(changes) {
    setActionError('')
    setWardenQuery((q) => ({ ...q, ...changes }))
  }

  // Throws on failure so the form can show the server's message.
  // On 401 it logs out and resolves to false (the dashboard unmounts).
  async function addComplaint(newComplaint) {
    let saved
    try {
      saved = await apiRequest('/api/complaints', { method: 'POST', body: newComplaint })
    } catch (error) {
      if (error.status === 401) {
        handleLogout()
        return false
      }
      throw error
    }
    setComplaints((prev) => [saved, ...prev])
    return true
  }

  // Reloads the current page afterwards: counts and filter membership change
  async function updateComplaintStatus(id, newStatus) {
    try {
      await apiRequest(`/api/complaints/${id}`, { method: 'PATCH', body: { status: newStatus } })
    } catch (error) {
      if (error.status === 401) return handleLogout()
      setActionError(error.message)
      return
    }
    setActionError('')
    await loadComplaints()
  }

  if (checkingSession) {
    return <div className="loading-screen">Loading…</div>
  }

  if (sessionError) {
    return (
      <div className="loading-screen session-error">
        <p role="alert">{sessionError}</p>
        <div className="session-error-actions">
          <button type="button" className="refresh-btn" onClick={restoreSession}>Retry</button>
          <button type="button" className="link-btn" onClick={handleLogout}>Log out</button>
        </div>
      </div>
    )
  }

  if (!user) {
    return <LoginPage onLogin={handleLogin} />
  }

  if (user.mustChangePassword) {
    return (
      <div className="login-page">
        <div className="login-card">
          <ChangePasswordForm forced onChanged={handlePasswordChanged} onSessionExpired={handleLogout} />
          <p className="auth-switch">
            <button type="button" className="link-btn" onClick={handleLogout}>Log out</button>
          </p>
        </div>
      </div>
    )
  }

  if (user.role === 'warden') {
    return (
      <WardenPanel
        complaints={complaints}
        loading={loadingComplaints}
        loadError={loadError}
        actionError={actionError}
        query={wardenQuery}
        meta={wardenMeta}
        onQueryChange={changeWardenQuery}
        onRefresh={loadComplaints}
        updateComplaintStatus={updateComplaintStatus}
        onLogout={handleLogout}
        onPasswordChanged={handlePasswordChanged}
      />
    )
  }

  return (
    <StudentDashboard
      user={user}
      complaints={complaints}
      loading={loadingComplaints}
      loadError={loadError}
      addComplaint={addComplaint}
      onRefresh={loadComplaints}
      onLogout={handleLogout}
      onPasswordChanged={handlePasswordChanged}
    />
  )
}

export default App

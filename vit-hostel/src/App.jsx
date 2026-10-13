import { useState, useEffect, useCallback, useRef } from 'react'
import LoginPage from './components/LoginPage'
import StudentDashboard from './components/StudentDashboard'
import WardenPanel from './components/WardenPanel'
import { apiRequest, getToken, setToken, clearToken } from './api'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [checkingSession, setCheckingSession] = useState(Boolean(getToken()))
  const [sessionError, setSessionError] = useState('')
  const [complaints, setComplaints] = useState([])
  const [loadingComplaints, setLoadingComplaints] = useState(false)
  const [loadError, setLoadError] = useState('')
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
  }, [])

  const loadComplaints = useCallback(async () => {
    if (!user) return
    const id = ++requestIdRef.current
    setLoadingComplaints(true)
    setLoadError('')
    try {
      const path = user.role === 'warden' ? '/api/complaints' : '/api/complaints/mine'
      const data = await apiRequest(path)
      if (id === requestIdRef.current) setComplaints(data)
    } catch (error) {
      if (id !== requestIdRef.current) return
      if (error.status === 401) return handleLogout()
      setLoadError(error.message)
    } finally {
      if (id === requestIdRef.current) setLoadingComplaints(false)
    }
  }, [user, handleLogout])

  useEffect(() => {
    loadComplaints()
  }, [loadComplaints])

  function handleLogin({ token, user }) {
    setToken(token)
    setUser(user)
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

  async function updateComplaintStatus(id, newStatus) {
    try {
      const updated = await apiRequest(`/api/complaints/${id}`, { method: 'PATCH', body: { status: newStatus } })
      setComplaints((prev) => prev.map((c) => (c._id === id ? updated : c)))
    } catch (error) {
      if (error.status === 401) return handleLogout()
      alert(error.message)
    }
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

  if (user.role === 'warden') {
    return (
      <WardenPanel
        user={user}
        complaints={complaints}
        loading={loadingComplaints}
        loadError={loadError}
        onRefresh={loadComplaints}
        updateComplaintStatus={updateComplaintStatus}
        onLogout={handleLogout}
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
    />
  )
}

export default App

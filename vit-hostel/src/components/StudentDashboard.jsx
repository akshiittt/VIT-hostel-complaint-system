import { useState, useEffect } from 'react'
import ComplaintForm from './ComplaintForm'
import ComplaintList from './ComplaintList'
import ChangePasswordForm from './ChangePasswordForm'
import TopBar from './TopBar'

const NOTICE_MS = 4000

function StudentDashboard({ user, complaints, loading, loadError, addComplaint, onRefresh, onLogout, onSessionExpired, onPasswordChanged }) {
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwordChanged, setPasswordChanged] = useState(false)

  useEffect(() => {
    if (!passwordChanged) return
    const timer = setTimeout(() => setPasswordChanged(false), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [passwordChanged])

  function togglePasswordForm() {
    setShowPasswordForm(!showPasswordForm)
    setPasswordChanged(false)
  }

  function handlePasswordChanged(data) {
    onPasswordChanged(data)
    setShowPasswordForm(false)
    setPasswordChanged(true)
  }

  return (
    <div className="dashboard-body">
      <TopBar
        role="student"
        showPasswordForm={showPasswordForm}
        onTogglePassword={togglePasswordForm}
        onLogout={onLogout}
      />

      <main>
        {(showPasswordForm || passwordChanged) && (
          <div className="account-section">
            {passwordChanged && <p className="success-msg" role="status">Password changed.</p>}
            {showPasswordForm && (
              <div className="panel-card account-card">
                <ChangePasswordForm
                  onChanged={handlePasswordChanged}
                  onCancel={() => setShowPasswordForm(false)}
                  onSessionExpired={onSessionExpired}
                />
              </div>
            )}
          </div>
        )}

        <div className="dashboard-container">
          <div className="left-panel">
            <ComplaintForm user={user} addComplaint={addComplaint} />
          </div>
          <div className="right-panel">
            <ComplaintList complaints={complaints} loading={loading} loadError={loadError} onRefresh={onRefresh} />
          </div>
        </div>
      </main>
    </div>
  )
}

export default StudentDashboard

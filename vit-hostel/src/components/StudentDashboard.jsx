import { useState } from 'react'
import ComplaintForm from './ComplaintForm'
import ComplaintList from './ComplaintList'
import ChangePasswordForm from './ChangePasswordForm'
import vitLogo from '../assets/vit-logo.jpg'

function StudentDashboard({ user, complaints, loading, loadError, addComplaint, onRefresh, onLogout, onPasswordChanged }) {
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwordChanged, setPasswordChanged] = useState(false)

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
      <header className="topbar">
        <div className="topbar-left">
          <img src={vitLogo} alt="VIT Logo" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
          <span className="topbar-title">VIT Hostel Complaint System</span>
        </div>
        <div className="topbar-right">
          <span className="role-badge student-badge">Student</span>
          <button type="button" className="logout-btn" aria-expanded={showPasswordForm} onClick={togglePasswordForm}>
            Change password
          </button>
          <button className="logout-btn" onClick={onLogout}>Logout</button>
        </div>
      </header>

      {(showPasswordForm || passwordChanged) && (
        <div className="account-section">
          {passwordChanged && <p className="success-msg" role="status">Password changed.</p>}
          {showPasswordForm && (
            <div className="panel-card account-card">
              <ChangePasswordForm
                onChanged={handlePasswordChanged}
                onCancel={() => setShowPasswordForm(false)}
                onSessionExpired={onLogout}
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
    </div>
  )
}

export default StudentDashboard

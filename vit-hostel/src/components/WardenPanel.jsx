import { useState } from 'react'
import ComplaintCard from './ComplaintCard'
import ChangePasswordForm from './ChangePasswordForm'
import ResetPasswordPanel from './ResetPasswordPanel'
import vitLogo from '../assets/vit-logo.jpg'

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'Pending', label: 'Pending' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Completed', label: 'Completed' }
]

function WardenPanel({
  complaints,
  loading,
  loadError,
  actionError,
  query,
  meta,
  onQueryChange,
  onRefresh,
  updateComplaintStatus,
  onLogout,
  onPasswordChanged
}) {
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwordChanged, setPasswordChanged] = useState(false)
  const { counts } = meta

  function togglePasswordForm() {
    setShowPasswordForm(!showPasswordForm)
    setPasswordChanged(false)
  }

  function handlePasswordChanged(data) {
    onPasswordChanged(data)
    setShowPasswordForm(false)
    setPasswordChanged(true)
  }

  const emptyMessage = query.status === 'all'
    ? "No complaints found. Students haven't submitted any yet."
    : 'No complaints match this filter.'

  return (
    <div className="dashboard-body">
      <header className="topbar">
        <div className="topbar-left">
          <img src={vitLogo} alt="VIT Logo" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
          <span className="topbar-title">VIT Hostel Complaint System</span>
        </div>
        <div className="topbar-right">
          <span className="role-badge warden-badge">Warden</span>
          <button type="button" className="logout-btn" aria-expanded={showPasswordForm} onClick={togglePasswordForm}>
            Change password
          </button>
          <button className="logout-btn" onClick={onLogout}>Logout</button>
        </div>
      </header>

      <div className="warden-container">
        {passwordChanged && <p className="success-msg" role="status">Password changed.</p>}
        {showPasswordForm && (
          <div className="panel-card account-card warden-section">
            <ChangePasswordForm
              onChanged={handlePasswordChanged}
              onCancel={() => setShowPasswordForm(false)}
              onSessionExpired={onLogout}
            />
          </div>
        )}

        <div className="warden-top">
          <h2 className="panel-heading">
            All Complaints
            <button className="refresh-btn" onClick={onRefresh} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </h2>
          <div className="stats-row">
            <div className="stat-box">
              <span>{counts.total}</span>
              <small>Total</small>
            </div>
            <div className="stat-box pending-stat">
              <span>{counts.open}</span>
              <small>Open</small>
            </div>
            <div className="stat-box done-stat">
              <span>{counts.completed}</span>
              <small>Completed</small>
            </div>
          </div>
        </div>

        <div className="filter-group warden-filter">
          <label htmlFor="warden-status-filter">Show</label>
          <select
            id="warden-status-filter"
            value={query.status}
            onChange={(e) => onQueryChange({ status: e.target.value, page: 1 })}
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        {loadError && <p className="error-msg" role="alert">{loadError}</p>}
        {actionError && <p className="error-msg" role="alert">{actionError}</p>}

        {loading && complaints.length === 0 ? (
          <p className="empty-msg">Loading complaints…</p>
        ) : complaints.length === 0 ? (
          <p className="empty-msg">{emptyMessage}</p>
        ) : (
          complaints.map((complaint) => (
            <ComplaintCard
              key={complaint._id}
              complaint={complaint}
              showActions={true}
              updateComplaintStatus={updateComplaintStatus}
            />
          ))
        )}

        {meta.pages > 1 && (
          <nav className="pagination" aria-label="Complaint pages">
            <button
              type="button"
              className="refresh-btn"
              disabled={loading || query.page <= 1}
              onClick={() => onQueryChange({ page: query.page - 1 })}
            >
              Previous
            </button>
            <span>Page {meta.page} of {meta.pages}</span>
            <button
              type="button"
              className="refresh-btn"
              disabled={loading || query.page >= meta.pages}
              onClick={() => onQueryChange({ page: query.page + 1 })}
            >
              Next
            </button>
          </nav>
        )}

        <ResetPasswordPanel onSessionExpired={onLogout} />
      </div>
    </div>
  )
}

export default WardenPanel

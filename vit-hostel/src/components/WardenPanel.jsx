import ComplaintCard from './ComplaintCard'
import vitLogo from '../assets/vit-logo.jpg'

function WardenPanel({ complaints, loading, loadError, onRefresh, updateComplaintStatus, onLogout }) {
  const totalCount = complaints.length
  const pendingCount = complaints.filter((c) => c.status !== 'Completed').length
  const doneCount = complaints.filter((c) => c.status === 'Completed').length

  return (
    <div className="dashboard-body">
      <header className="topbar">
        <div className="topbar-left">
          <img src={vitLogo} alt="VIT Logo" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
          <span className="topbar-title">VIT Hostel Complaint System</span>
        </div>
        <div className="topbar-right">
          <span className="role-badge warden-badge">Warden</span>
          <button className="logout-btn" onClick={onLogout}>Logout</button>
        </div>
      </header>

      <div className="warden-container">
        <div className="warden-top">
          <h2 className="panel-heading">
            All Complaints
            <button className="refresh-btn" onClick={onRefresh} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </h2>
          <div className="stats-row">
            <div className="stat-box">
              <span>{totalCount}</span>
              <small>Total</small>
            </div>
            <div className="stat-box pending-stat">
              <span>{pendingCount}</span>
              <small>Pending</small>
            </div>
            <div className="stat-box done-stat">
              <span>{doneCount}</span>
              <small>Completed</small>
            </div>
          </div>
        </div>

        {loadError && <p className="error-msg" role="alert">{loadError}</p>}

        {loading && complaints.length === 0 ? (
          <p className="empty-msg">Loading complaints…</p>
        ) : complaints.length === 0 ? (
          <p className="empty-msg">No complaints found. Students haven't submitted any yet.</p>
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
      </div>
    </div>
  )
}

export default WardenPanel

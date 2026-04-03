import ComplaintCard from './ComplaintCard'

function WardenPanel({ complaints, updateComplaintStatus, onLogout }) {
  const totalCount = complaints.length
  const pendingCount = complaints.filter((c) => c.status === 'Pending').length
  const doneCount = complaints.filter((c) => c.status === 'Completed').length

  return (
    <div className="dashboard-body">
      <header className="topbar">
        <div className="topbar-left">
          <img src="/images/c6c2e9022f25f404fe108a4cfefab222.jpg" alt="VIT Logo" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
          <span className="topbar-title">VIT Hostel Complaint System</span>
        </div>
        <div className="topbar-right">
          <span className="role-badge warden-badge">Warden</span>
          <button className="logout-btn" onClick={onLogout}>Logout</button>
        </div>
      </header>

      <div className="warden-container">
        <div className="warden-top">
          <h2 className="panel-heading">All Complaints</h2>
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

        {complaints.length === 0 ? (
          <p className="empty-msg">No complaints found. Students haven't submitted any yet.</p>
        ) : (
          complaints.map((complaint, index) => (
            <ComplaintCard
              key={index}
              complaint={complaint}
              index={index}
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

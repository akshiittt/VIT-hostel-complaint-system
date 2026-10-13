import ComplaintForm from './ComplaintForm'
import ComplaintList from './ComplaintList'
import vitLogo from '../assets/vit-logo.jpg'

function StudentDashboard({ user, complaints, loading, loadError, addComplaint, onRefresh, onLogout }) {
  return (
    <div className="dashboard-body">
      <header className="topbar">
        <div className="topbar-left">
          <img src={vitLogo} alt="VIT Logo" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
          <span className="topbar-title">VIT Hostel Complaint System</span>
        </div>
        <div className="topbar-right">
          <span className="role-badge student-badge">Student</span>
          <button className="logout-btn" onClick={onLogout}>Logout</button>
        </div>
      </header>

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

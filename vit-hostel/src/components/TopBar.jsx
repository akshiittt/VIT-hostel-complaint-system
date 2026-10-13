import vitLogo from '../assets/vit-logo.jpg'

const ROLE_LABELS = { student: 'Student', warden: 'Warden' }

// Shared header for both dashboards. skipTo is the id of the element the
// keyboard "skip" link jumps to (e.g. past a long complaint list).
function TopBar({ role, showPasswordForm, onTogglePassword, onLogout, skipTo, skipLabel }) {
  return (
    <header className="topbar">
      {skipTo && <a className="skip-link" href={`#${skipTo}`}>{skipLabel}</a>}
      <div className="topbar-left">
        <img src={vitLogo} alt="VIT Logo" style={{ width: '36px', height: '36px', objectFit: 'contain' }} />
        <span className="topbar-title">
          <span className="topbar-title-full">VIT Hostel Complaint System</span>
          <span className="topbar-title-short">VIT Hostel</span>
        </span>
      </div>
      <div className="topbar-right">
        <span className={`role-badge ${role}-badge`}>{ROLE_LABELS[role]}</span>
        <button
          type="button"
          className="logout-btn"
          aria-label="Change password"
          aria-expanded={showPasswordForm}
          onClick={onTogglePassword}
        >
          <span className="topbar-title-full">Change password</span>
          <span className="topbar-title-short">Password</span>
        </button>
        <button type="button" className="logout-btn" onClick={onLogout}>Logout</button>
      </div>
    </header>
  )
}

export default TopBar

import { COMPLAINT_STATUSES } from '../constants'

const STATUS_BADGES = {
  Completed: 'badge-status-completed',
  'In Progress': 'badge-status-progress'
}

// Button order and wording for each status the warden can set
const ACTIONS = {
  Completed: { label: 'Mark as Completed', className: 'btn-complete' },
  'In Progress': { label: 'Mark In Progress', className: 'btn-progress' },
  Pending: { label: 'Mark as Pending', className: 'btn-pending' }
}
const ACTION_ORDER = ['Completed', 'In Progress', 'Pending'].filter((s) => COMPLAINT_STATUSES.includes(s))

// updating: true while this card's status change is in flight, so a
// double-click can't send duplicate requests
function ComplaintCard({ complaint, showActions, updateComplaintStatus, updating = false }) {
  const statusClass = STATUS_BADGES[complaint.status] || 'badge-status-pending'

  const submittedOn = complaint.createdAt
    ? new Date(complaint.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : ''

  return (
    <div className={`complaint-card ${complaint.urgent ? 'urgent' : ''}`}>
      <div className="card-top">
        <div>
          <span className="card-name">{complaint.name}</span>
          <span className="card-reg">{complaint.reg}</span>
        </div>
        <div className="card-badges">
          <span className="badge badge-type">{complaint.complaintType}</span>
          {complaint.urgent && (
            <span className="badge badge-urgent">Urgent</span>
          )}
          <span className={`badge ${statusClass}`}>{complaint.status}</span>
        </div>
      </div>

      <div className="card-hostel">
        {complaint.hostelType} &nbsp;|&nbsp; Block {complaint.block} &nbsp;|&nbsp; Room {complaint.room}
        {submittedOn && <> &nbsp;|&nbsp; {submittedOn}</>}
      </div>

      <div className="card-desc">{complaint.description}</div>

      {showActions && (
        <div className="card-actions" aria-busy={updating}>
          {ACTION_ORDER.map((status) => (
            <button
              key={status}
              type="button"
              className={ACTIONS[status].className}
              disabled={updating || complaint.status === status}
              onClick={() => updateComplaintStatus(complaint._id, status)}
            >
              {ACTIONS[status].label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default ComplaintCard

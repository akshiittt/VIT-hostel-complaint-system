import { useState } from 'react'
import ComplaintCard from './ComplaintCard'

function ComplaintList({ complaints }) {
  const [filter, setFilter] = useState('All')

  function getFilteredComplaints() {
    if (filter === 'All') return complaints
    return complaints.filter((c) => c.complaintType === filter)
  }

  const filtered = getFilteredComplaints()

  return (
    <div className="panel-card">
      <div className="complaints-header">
        <h2 className="panel-heading">My Complaints</h2>
        <div className="filter-group">
          <label>Filter by:</label>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="All">All</option>
            <option value="Electricity Issue">Electricity</option>
            <option value="Water Issue">Water</option>
            <option value="WiFi Issue">WiFi</option>
            <option value="Room Change Request">Room Change</option>
            <option value="Others">Others</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="empty-msg">No complaints found.</p>
      ) : (
        filtered.map((complaint, index) => (
          <ComplaintCard
            key={index}
            complaint={complaint}
            index={index}
            showActions={false}
          />
        ))
      )}
    </div>
  )
}

export default ComplaintList

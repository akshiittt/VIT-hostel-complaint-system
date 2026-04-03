import { useState } from 'react'
import LoginPage from './components/LoginPage'
import StudentDashboard from './components/StudentDashboard'
import WardenPanel from './components/WardenPanel'
import './App.css'

function App() {
  const [role, setRole] = useState(null)
  const [complaints, setComplaints] = useState([])

  function handleLogin(selectedRole) {
    setRole(selectedRole)
  }

  function handleLogout() {
    setRole(null)
  }

  function addComplaint(newComplaint) {
    setComplaints([...complaints, newComplaint])
  }

  function updateComplaintStatus(index, newStatus) {
    const updated = [...complaints]
    updated[index].status = newStatus
    setComplaints(updated)
  }

  if (role === null) {
    return <LoginPage onLogin={handleLogin} />
  }

  if (role === 'student') {
    return (
      <StudentDashboard
        complaints={complaints}
        addComplaint={addComplaint}
        onLogout={handleLogout}
      />
    )
  }

  if (role === 'warden') {
    return (
      <WardenPanel
        complaints={complaints}
        updateComplaintStatus={updateComplaintStatus}
        onLogout={handleLogout}
      />
    )
  }
}

export default App

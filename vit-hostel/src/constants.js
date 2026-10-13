export const HOSTEL_BLOCKS = {
  "Men's Hostel": ['A','B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T'],
  "Women's Hostel": ['A','B','C','D','E','F','G','H','J']
}

export const COMPLAINT_TYPES = ['Electricity Issue', 'Water Issue', 'WiFi Issue', 'Room Change Request', 'Others']

export const COMPLAINT_STATUSES = ['Pending', 'In Progress', 'Completed']

// Must match backend/lib/constants.js LIMITS (max field lengths)
export const LIMITS = { name: 100, email: 254, password: 72, regNumber: 20, room: 20, description: 2000 }

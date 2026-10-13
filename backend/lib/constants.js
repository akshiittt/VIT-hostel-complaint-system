const HOSTEL_BLOCKS = {
  "Men's Hostel": ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T'],
  "Women's Hostel": ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J']
}

const COMPLAINT_TYPES = ['Electricity Issue', 'Water Issue', 'WiFi Issue', 'Room Change Request', 'Others']

const COMPLAINT_STATUSES = ['Pending', 'In Progress', 'Completed']

// Max lengths enforced in routes (400) and schemas. Password is 72 because
// bcrypt silently ignores everything past 72 bytes.
const LIMITS = { name: 100, email: 254, password: 72, regNumber: 20, room: 20, description: 2000 }

const normalizedEmail = (req) => String(req.body?.email || '').trim().toLowerCase()

// Backend only (not mirrored in the frontend). Counters live in MongoDB.
// The per-account limit (IP + email) stops password guessing. The per-IP limits
// are deliberately generous: hostel WiFi puts many students behind one NAT IP,
// so they only catch one machine hammering the API.
const RATE_LIMITS = {
  loginPerIpEmail: {
    name: 'login-ip-email',
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyFn: (req) => `${req.ip}:${normalizedEmail(req)}`
  },
  loginPerIp: {
    name: 'login-ip',
    windowMs: 15 * 60 * 1000,
    max: 300,
    keyFn: (req) => req.ip
  },
  registerPerIp: {
    name: 'register-ip',
    windowMs: 60 * 60 * 1000,
    max: 100,
    keyFn: (req) => req.ip
  },
  // Applied after protect, so req.user is set
  changePasswordPerUser: {
    name: 'change-password',
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyFn: (req) => String(req.user._id)
  }
}

function isValidBlock(hostelType, block) {
  return Boolean(HOSTEL_BLOCKS[hostelType] && HOSTEL_BLOCKS[hostelType].includes(block))
}

module.exports = { HOSTEL_BLOCKS, COMPLAINT_TYPES, COMPLAINT_STATUSES, LIMITS, RATE_LIMITS, isValidBlock }

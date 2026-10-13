const HOSTEL_BLOCKS = {
  "Men's Hostel": ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T'],
  "Women's Hostel": ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J']
}

const COMPLAINT_TYPES = ['Electricity Issue', 'Water Issue', 'WiFi Issue', 'Room Change Request', 'Others']

const COMPLAINT_STATUSES = ['Pending', 'In Progress', 'Completed']

// Max lengths enforced in routes (400) and schemas. Password is 72 because
// bcrypt silently ignores everything past 72 bytes.
const LIMITS = { name: 100, email: 254, password: 72, regNumber: 20, room: 20, description: 2000 }

// VIT registration numbers: 2-digit year, 3-letter programme, 4-digit roll,
// e.g. 23BCE1234. Checked after trim + uppercase. Mirrored in the frontend.
const REG_NUMBER_PATTERN = /^\d{2}[A-Z]{3}\d{4}$/

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
  // Caps guesses against one account from any number of IPs (a distributed
  // attack on the warden). A cool-down, not a permanent lockout.
  loginPerEmail: {
    name: 'login-email',
    windowMs: 60 * 60 * 1000,
    max: 30,
    keyFn: normalizedEmail
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
  // The limits below run after protect, so req.user is set
  complaintsPerStudent: {
    name: 'complaints',
    windowMs: 60 * 60 * 1000,
    max: 10,
    keyFn: (req) => String(req.user._id),
    message: (minutes) => `You have submitted a lot of complaints. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
  },
  // Urgent complaints jump the warden's queue, so they get a tighter daily cap
  urgentPerStudent: {
    name: 'urgent',
    windowMs: 24 * 60 * 60 * 1000,
    max: 3,
    keyFn: (req) => String(req.user._id),
    skip: (req) => req.body?.urgent !== true,
    message: () => 'You can mark at most 3 complaints a day as urgent. Submit this one without the urgent flag, or contact the warden.'
  },
  resetPerWarden: {
    name: 'reset-password',
    windowMs: 60 * 60 * 1000,
    max: 20,
    keyFn: (req) => String(req.user._id)
  },
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

module.exports = { HOSTEL_BLOCKS, COMPLAINT_TYPES, COMPLAINT_STATUSES, LIMITS, REG_NUMBER_PATTERN, RATE_LIMITS, isValidBlock }

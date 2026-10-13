const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const { LIMITS } = require('../lib/constants')
const { hashPassword } = require('../lib/passwordPolicy')

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: LIMITS.name
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: LIMITS.email
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  role: {
    type: String,
    enum: ['student', 'warden'],
    default: 'student'
  },
  regNumber: {
    type: String,
    trim: true,
    uppercase: true,
    maxlength: LIMITS.regNumber,
    default: ''
  },
  hostelType: {
    type: String,
    enum: ["Men's Hostel", "Women's Hostel", ''],
    default: ''
  },
  block: {
    type: String,
    trim: true,
    default: ''
  },
  room: {
    type: String,
    trim: true,
    maxlength: LIMITS.room,
    default: ''
  },
  // Embedded in every token as `v`. Incrementing it revokes all existing
  // tokens for this user (see middleware/auth.js). Never sent to the client.
  tokenVersion: {
    type: Number,
    default: 0
  },
  // Set when a warden resets the password; cleared by change-password
  mustChangePassword: {
    type: Boolean,
    default: false
  },
  // Audit trail for warden resets: when, and by which warden
  passwordResetAt: {
    type: Date,
    default: null
  },
  passwordResetBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, { timestamps: true })

// One account per registration number. Partial so wardens, who all have
// regNumber '', don't collide.
userSchema.index({ regNumber: 1 }, { unique: true, partialFilterExpression: { role: 'student' } })

// Hashes a plain password set on the document before saving. Callers using
// save()/create() (register, seed, login re-hash) must pass the plain password,
// otherwise it would be hashed twice. Routes that write with updateOne/
// findByIdAndUpdate bypass this hook and call hashPassword() themselves.
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return
  this.password = await hashPassword(this.password)
})

userSchema.methods.matchPassword = function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password)
}

userSchema.methods.toPublic = function () {
  return {
    _id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    regNumber: this.regNumber,
    hostelType: this.hostelType,
    block: this.block,
    room: this.room,
    mustChangePassword: this.mustChangePassword,
    passwordResetAt: this.passwordResetAt
  }
}

module.exports = mongoose.models.User || mongoose.model('User', userSchema)

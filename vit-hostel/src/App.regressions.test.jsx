// Guards for two fixed App.jsx bugs (version-1/ai-docs/check.md #12 and #13) that had no test
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

const TOKEN_KEY = 'vit-hostel-token'

const studentUser = {
  _id: 'u1', name: 'Asha Rao', regNumber: '23BCE1234', email: 'asha@vitstudent.ac.in', role: 'student',
  hostelType: "Men's Hostel", block: 'C', room: '204', mustChangePassword: false
}
const wardenUser = { _id: 'w1', name: 'Warden', email: 'warden@vit.ac.in', role: 'warden', mustChangePassword: false }

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function keyOf(url, options = {}) {
  return `${options.method || 'GET'} ${new URL(url).pathname}`
}

describe('App regressions', () => {
  it('#13: ignores a warden list that arrives after logout and a student login', async () => {
    localStorage.setItem(TOKEN_KEY, 'warden-token')
    let finishWardenList
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      switch (keyOf(url, options)) {
        case 'GET /api/auth/me': return jsonResponse(200, wardenUser)
        case 'GET /api/complaints':
          // The warden's request hangs until after the student has logged in
          return new Promise((resolve) => {
            finishWardenList = () => resolve(jsonResponse(200, {
              complaints: [{ _id: 'w-c1', name: 'Other Student', reg: '22BCE0001', hostelType: "Men's Hostel", block: 'A', room: '1', complaintType: 'Others', description: 'Warden-only data', urgent: false, status: 'Pending' }],
              page: 1, limit: 20, total: 1, pages: 1, counts: { total: 1, open: 1, completed: 0 }
            }))
          })
        case 'POST /api/auth/logout': return jsonResponse(204, {})
        case 'POST /api/auth/login': return jsonResponse(200, { token: 'student-token', user: studentUser })
        case 'GET /api/complaints/mine': return jsonResponse(200, [])
        default: throw new Error(`Unexpected request: ${keyOf(url, options)}`)
      }
    }))
    const user = userEvent.setup()
    render(<App />)

    await screen.findByText('Loading complaints…')
    await user.click(screen.getByRole('button', { name: 'Logout' }))
    await user.type(await screen.findByLabelText('Email'), studentUser.email)
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Login' }))
    expect(await screen.findByText('No complaints found.')).toBeInTheDocument()

    finishWardenList()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(screen.queryByText('Warden-only data')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'My Complaints' })).toBeInTheDocument()
  })

  it('#12: a 401 when submitting a complaint logs out with the notice instead of showing it in the form', async () => {
    localStorage.setItem(TOKEN_KEY, 'revoked-token')
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      switch (keyOf(url, options)) {
        case 'GET /api/auth/me': return jsonResponse(200, studentUser)
        case 'GET /api/complaints/mine': return jsonResponse(200, [])
        case 'POST /api/complaints': return jsonResponse(401, { message: 'Not authorized, token failed' })
        default: throw new Error(`Unexpected request: ${keyOf(url, options)}`)
      }
    }))
    const user = userEvent.setup()
    render(<App />)

    await screen.findByText('No complaints found.')
    await user.click(screen.getByRole('radio', { name: 'Water Issue' }))
    await user.type(screen.getByLabelText('Description'), 'Tap is leaking')
    await user.click(screen.getByRole('button', { name: 'Submit Complaint' }))

    expect(await screen.findByText('Your session expired. Please log in again.')).toBeInTheDocument()
    expect(screen.queryByText('Not authorized, token failed')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument()
    await waitFor(() => expect(localStorage.getItem(TOKEN_KEY)).toBeNull())
  })

  it('#11: a server error (not 401) during session restore keeps the token', async () => {
    localStorage.setItem(TOKEN_KEY, 'good-token')
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(503, { message: 'The service is temporarily unavailable. Please try again shortly.' })))
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_KEY)).toBe('good-token')
  })

  // Regression: an older /mine response used to overwrite a just-submitted
  // complaint (addComplaint now invalidates in-flight list loads).
  it('keeps a just-submitted complaint when an older list response arrives afterwards', async () => {
    localStorage.setItem(TOKEN_KEY, 'good-token')
    let listCalls = 0
    let finishSecondList
    const saved = {
      _id: 'new-1', name: studentUser.name, reg: studentUser.regNumber, hostelType: "Men's Hostel", block: 'C', room: '204',
      complaintType: 'Water Issue', description: 'Tap is leaking', urgent: false, status: 'Pending', createdAt: '2026-10-01T10:00:00.000Z'
    }
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      switch (keyOf(url, options)) {
        case 'GET /api/auth/me': return jsonResponse(200, studentUser)
        case 'GET /api/complaints/mine':
          if (++listCalls === 1) return jsonResponse(200, [])
          // Read by the server before the new complaint was inserted
          return new Promise((resolve) => { finishSecondList = () => resolve(jsonResponse(200, [])) })
        case 'POST /api/complaints': return jsonResponse(201, saved)
        default: throw new Error(`Unexpected request: ${keyOf(url, options)}`)
      }
    }))
    const user = userEvent.setup()
    render(<App />)

    await screen.findByText('No complaints found.')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    await user.click(screen.getByRole('radio', { name: 'Water Issue' }))
    await user.type(screen.getByLabelText('Description'), 'Tap is leaking')
    await user.click(screen.getByRole('button', { name: 'Submit Complaint' }))
    expect(await screen.findByText('Tap is leaking', { selector: '.card-desc' })).toBeInTheDocument()

    finishSecondList()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled())

    expect(screen.queryByText('Tap is leaking', { selector: '.card-desc' })).toBeInTheDocument()
  })
})


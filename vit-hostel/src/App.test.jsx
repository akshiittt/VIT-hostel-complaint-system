import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

const TOKEN_KEY = 'vit-hostel-token'

const studentUser = {
  _id: 'u1',
  name: 'Asha Rao',
  regNumber: '23BCE1234',
  email: 'asha@vitstudent.ac.in',
  role: 'student',
  hostelType: "Men's Hostel",
  block: 'C',
  room: '204'
}

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

// routes: { 'GET /api/auth/me': [status, body] }
function routeFetch(routes) {
  return async (url, options = {}) => {
    const key = `${options.method || 'GET'} ${new URL(url).pathname}`
    const route = routes[key]
    if (!route) throw new Error(`Unexpected request: ${key}`)
    return jsonResponse(...route)
  }
}

function callsTo(fetchMock, suffix) {
  return fetchMock.mock.calls.filter(([url]) => url.endsWith(suffix))
}

describe('App session handling', () => {
  it('shows the login page when there is no token', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)

    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('logs out and removes the token when /api/auth/me returns 401', async () => {
    localStorage.setItem(TOKEN_KEY, 'expired-token')
    const fetchMock = vi.fn(routeFetch({ 'GET /api/auth/me': [401, { message: 'Not authorized' }] }))
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)

    expect(await screen.findByRole('button', { name: 'Login' })).toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
    const [[url, options]] = fetchMock.mock.calls
    expect(url).toMatch(/\/api\/auth\/me$/)
    expect(options.headers.Authorization).toBe('Bearer expired-token')
  })

  it('keeps the token and offers Retry when the server is unreachable', async () => {
    localStorage.setItem(TOKEN_KEY, 'good-token')
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server')
    expect(localStorage.getItem(TOKEN_KEY)).toBe('good-token')
    expect(screen.queryByRole('button', { name: 'Login' })).not.toBeInTheDocument()

    fetchMock.mockImplementation(routeFetch({
      'GET /api/auth/me': [200, studentUser],
      'GET /api/complaints/mine': [200, []]
    }))
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('heading', { name: 'Submit a Complaint' })).toBeInTheDocument()
    expect(await screen.findByText('No complaints found.')).toBeInTheDocument()
    expect(callsTo(fetchMock, '/api/complaints/mine')).toHaveLength(1)
  })
})

describe('App student flow', () => {
  it("renders the student's complaints and refreshes them", async () => {
    localStorage.setItem(TOKEN_KEY, 'good-token')
    const complaint = {
      _id: 'c1',
      name: studentUser.name,
      reg: studentUser.regNumber,
      hostelType: "Men's Hostel",
      block: 'C',
      room: '204',
      complaintType: 'Water Issue',
      description: 'Tap is leaking',
      urgent: false,
      status: 'Pending',
      createdAt: '2026-10-01T10:00:00.000Z'
    }
    const fetchMock = vi.fn(routeFetch({
      'GET /api/auth/me': [200, studentUser],
      'GET /api/complaints/mine': [200, [complaint]]
    }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByText('Tap is leaking')).toBeInTheDocument()
    expect(callsTo(fetchMock, '/api/complaints/mine')).toHaveLength(1)

    await user.click(await screen.findByRole('button', { name: 'Refresh' }))

    expect(callsTo(fetchMock, '/api/complaints/mine')).toHaveLength(2)
    expect(await screen.findByRole('button', { name: 'Refresh' })).toBeEnabled()
    expect(screen.getByText('Tap is leaking')).toBeInTheDocument()
  })
})

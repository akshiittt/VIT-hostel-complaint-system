import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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

// routes: { 'GET /api/auth/me': [status, body] }, or a function (url, options) => [status, body]
function routeFetch(routes) {
  return async (url, options = {}) => {
    const key = `${options.method || 'GET'} ${new URL(url).pathname}`
    const route = routes[key]
    if (!route) throw new Error(`Unexpected request: ${key}`)
    return jsonResponse(...(typeof route === 'function' ? route(url, options) : route))
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

describe('App password changes', () => {
  it('shows only the forced change screen when the password was reset, then the dashboard', async () => {
    localStorage.setItem(TOKEN_KEY, 'old-token')
    const fetchMock = vi.fn(routeFetch({
      'GET /api/auth/me': [200, { ...studentUser, mustChangePassword: true }],
      'POST /api/auth/change-password': [200, { token: 'new-token', user: { ...studentUser, mustChangePassword: false } }],
      'GET /api/complaints/mine': [200, []]
    }))
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
    expect(screen.getByText('Your password was reset by the warden. Choose a new password to continue.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Submit a Complaint' })).not.toBeInTheDocument()
    expect(callsTo(fetchMock, '/api/complaints/mine')).toHaveLength(0)

    await user.type(screen.getByLabelText('Current password'), 'Tmp-9xQ2')
    await user.type(screen.getByLabelText('New password'), 'newpass1')
    await user.type(screen.getByLabelText('Confirm new password'), 'newpass1')
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    expect(await screen.findByRole('heading', { name: 'Submit a Complaint' })).toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_KEY)).toBe('new-token')
    await waitFor(() => expect(callsTo(fetchMock, '/api/complaints/mine')).toHaveLength(1))
    const [, options] = callsTo(fetchMock, '/api/complaints/mine')[0]
    expect(options.headers.Authorization).toBe('Bearer new-token')
  })

  it('lets a student change their password from the dashboard', async () => {
    localStorage.setItem(TOKEN_KEY, 'old-token')
    vi.stubGlobal('fetch', vi.fn(routeFetch({
      'GET /api/auth/me': [200, { ...studentUser, mustChangePassword: false }],
      'GET /api/complaints/mine': [200, []],
      'POST /api/auth/change-password': [200, { token: 'new-token', user: { ...studentUser, mustChangePassword: false } }]
    })))
    const user = userEvent.setup()
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Change password' }))
    await user.type(screen.getByLabelText('Current password'), 'oldpass1')
    await user.type(screen.getByLabelText('New password'), 'newpass1')
    await user.type(screen.getByLabelText('Confirm new password'), 'newpass1')
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Password changed.')
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_KEY)).toBe('new-token')
  })
})

describe('App warden flow', () => {
  const wardenUser = { _id: 'w1', name: 'Warden', email: 'warden@vit.ac.in', role: 'warden', mustChangePassword: false }
  const complaint = {
    _id: 'c1',
    name: 'Asha Rao',
    reg: '23BCE1234',
    hostelType: "Men's Hostel",
    block: 'C',
    room: '204',
    complaintType: 'Water Issue',
    description: 'Tap is leaking',
    urgent: false,
    status: 'Pending',
    createdAt: '2026-10-01T10:00:00.000Z'
  }

  function pageResponse(url) {
    const params = new URL(url).searchParams
    return [200, {
      complaints: [complaint],
      page: Number(params.get('page')),
      limit: 20,
      total: 45,
      pages: 3,
      counts: { total: 57, open: 41, completed: 16 }
    }]
  }

  function listCalls(fetchMock) {
    return fetchMock.mock.calls
      .filter(([url, options = {}]) => new URL(url).pathname === '/api/complaints' && (options.method || 'GET') === 'GET')
      .map(([url]) => new URL(url).search)
  }

  function renderWarden(extraRoutes = {}) {
    localStorage.setItem(TOKEN_KEY, 'warden-token')
    const fetchMock = vi.fn(routeFetch({
      'GET /api/auth/me': [200, wardenUser],
      'GET /api/complaints': pageResponse,
      ...extraRoutes
    }))
    vi.stubGlobal('fetch', fetchMock)
    render(<App />)
    return fetchMock
  }

  it('shows the stat boxes from counts and requests the first page of all complaints', async () => {
    const fetchMock = renderWarden()

    expect(await screen.findByText('Tap is leaking')).toBeInTheDocument()
    expect(screen.getByText('57')).toBeInTheDocument()
    expect(screen.getByText('41')).toBeInTheDocument()
    expect(screen.getByText('16')).toBeInTheDocument()
    expect(screen.getByText('Open', { selector: 'small' })).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(listCalls(fetchMock)).toEqual(['?status=all&page=1&limit=20'])
  })

  it('requests page 1 of the chosen filter, then the next page', async () => {
    const fetchMock = renderWarden()
    const user = userEvent.setup()
    await screen.findByText('Page 1 of 3')

    await user.selectOptions(screen.getByLabelText('Show'), 'open')
    await waitFor(() => expect(listCalls(fetchMock).at(-1)).toBe('?status=open&page=1&limit=20'))

    await user.click(await screen.findByRole('button', { name: 'Next' }))
    await waitFor(() => expect(listCalls(fetchMock).at(-1)).toBe('?status=open&page=2&limit=20'))
    expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Show'), 'In Progress')
    await waitFor(() => expect(listCalls(fetchMock).at(-1)).toBe('?status=In%20Progress&page=1&limit=20'))
  })

  it('shows the filter empty state', async () => {
    renderWarden({
      'GET /api/complaints': [200, { complaints: [], page: 1, limit: 20, total: 0, pages: 0, counts: { total: 5, open: 0, completed: 5 } }]
    })
    const user = userEvent.setup()
    await screen.findByText("No complaints found. Students haven't submitted any yet.")

    await user.selectOptions(screen.getByLabelText('Show'), 'open')

    expect(await screen.findByText('No complaints match this filter.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
  })

  it('reloads the current page after a status change', async () => {
    const fetchMock = renderWarden({
      'PATCH /api/complaints/c1': [200, { ...complaint, status: 'In Progress' }]
    })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Mark In Progress' }))

    await waitFor(() => expect(listCalls(fetchMock)).toHaveLength(2))
    const patch = fetchMock.mock.calls.find(([, options = {}]) => options.method === 'PATCH')
    expect(JSON.parse(patch[1].body)).toEqual({ status: 'In Progress' })
  })

  it('steps back a page when a status change empties the current page', async () => {
    let emptyPage2 = false
    const fetchMock = renderWarden({
      'GET /api/complaints': (url) => {
        const page = Number(new URL(url).searchParams.get('page'))
        const empty = emptyPage2 && page === 2
        return [200, {
          complaints: empty ? [] : [{ ...complaint, _id: `c${page}`, description: `Page ${page} complaint` }],
          page,
          limit: 20,
          total: empty ? 20 : 21,
          pages: empty ? 1 : 2,
          counts: { total: 21, open: 21, completed: 0 }
        }]
      },
      'PATCH /api/complaints/c2': () => {
        emptyPage2 = true
        return [200, { ...complaint, _id: 'c2', status: 'Completed' }]
      }
    })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Next' }))
    await screen.findByText('Page 2 complaint')
    await user.click(screen.getByRole('button', { name: 'Mark as Completed' }))

    await waitFor(() => expect(listCalls(fetchMock).at(-1)).toBe('?status=all&page=1&limit=20'))
    expect(listCalls(fetchMock)).toEqual([
      '?status=all&page=1&limit=20',
      '?status=all&page=2&limit=20',
      '?status=all&page=2&limit=20',
      '?status=all&page=1&limit=20'
    ])
    expect(await screen.findByText('Page 1 complaint')).toBeInTheDocument()
  })

  it('shows a failed status change as an alert paragraph instead of window.alert', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const fetchMock = renderWarden({
      'PATCH /api/complaints/c1': [400, { message: 'Invalid status' }]
    })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Mark as Completed' }))

    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent('Invalid status')
    expect(error.tagName).toBe('P')
    expect(alertSpy).not.toHaveBeenCalled()
    expect(listCalls(fetchMock)).toHaveLength(1)

    // cleared when the filter changes
    await user.selectOptions(screen.getByLabelText('Show'), 'Completed')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

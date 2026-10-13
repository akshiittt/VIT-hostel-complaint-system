import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LoginPage from './LoginPage'

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function stubFetch(impl) {
  const fetchMock = vi.fn(impl)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function goToRegister(user) {
  await user.click(screen.getByRole('button', { name: 'Create an account' }))
}

describe('LoginPage: login', () => {
  it('shows an error and makes no request when submitted empty', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, {}))
    const onLogin = vi.fn()
    const user = userEvent.setup()
    render(<LoginPage onLogin={onLogin} />)

    await user.click(screen.getByRole('button', { name: 'Login' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter your email and password.')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(onLogin).not.toHaveBeenCalled()
  })

  it('POSTs the credentials and passes the response to onLogin', async () => {
    const body = { token: 'tok-123', user: { _id: 'u1', name: 'Asha', role: 'student' } }
    const fetchMock = stubFetch(async () => jsonResponse(200, body))
    const onLogin = vi.fn()
    const user = userEvent.setup()
    render(<LoginPage onLogin={onLogin} />)

    await user.type(screen.getByLabelText('Email'), 'asha@vitstudent.ac.in')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Login' }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/api\/auth\/login$/)
    expect(options.method).toBe('POST')
    expect(options.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(options.body)).toEqual({ email: 'asha@vitstudent.ac.in', password: 'secret123' })
    expect(onLogin).toHaveBeenCalledWith(body)
  })

  it('shows the server message when login is rejected', async () => {
    stubFetch(async () => jsonResponse(401, { message: 'Invalid email or password' }))
    const onLogin = vi.fn()
    const user = userEvent.setup()
    render(<LoginPage onLogin={onLogin} />)

    await user.type(screen.getByLabelText('Email'), 'asha@vitstudent.ac.in')
    await user.type(screen.getByLabelText('Password'), 'wrongpass')
    await user.click(screen.getByRole('button', { name: 'Login' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
    expect(onLogin).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Login' })).toBeEnabled()
  })
})

describe('LoginPage: register', () => {
  it("lists only blocks A-J for the Women's Hostel", async () => {
    stubFetch(async () => jsonResponse(200, {}))
    const user = userEvent.setup()
    render(<LoginPage onLogin={vi.fn()} />)
    await goToRegister(user)

    await user.selectOptions(screen.getByLabelText('Hostel Type'), "Women's Hostel")

    const options = within(screen.getByLabelText('Hostel Block')).getAllByRole('option')
    expect(options).toHaveLength(10)
    expect(options[0]).toHaveValue('')
    expect(options.slice(1).map((o) => o.value)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J'])
  })

  it('resets the block when the hostel type changes', async () => {
    stubFetch(async () => jsonResponse(200, {}))
    const user = userEvent.setup()
    render(<LoginPage onLogin={vi.fn()} />)
    await goToRegister(user)

    await user.selectOptions(screen.getByLabelText('Hostel Type'), "Women's Hostel")
    await user.selectOptions(screen.getByLabelText('Hostel Block'), 'C')
    expect(screen.getByLabelText('Hostel Block')).toHaveValue('C')

    await user.selectOptions(screen.getByLabelText('Hostel Type'), "Men's Hostel")
    expect(screen.getByLabelText('Hostel Block')).toHaveValue('')
  })

  it('rejects a password shorter than 8 characters without a request', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(201, {}))
    const user = userEvent.setup()
    render(<LoginPage onLogin={vi.fn()} />)
    await goToRegister(user)

    await user.type(screen.getByLabelText('Full Name'), 'Asha Rao')
    await user.type(screen.getByLabelText('Registration Number'), '23BCE1234')
    await user.type(screen.getByLabelText('Email'), 'asha@vitstudent.ac.in')
    await user.type(screen.getByLabelText('Password'), '1234567')
    await user.selectOptions(screen.getByLabelText('Hostel Type'), "Women's Hostel")
    await user.selectOptions(screen.getByLabelText('Hostel Block'), 'B')
    await user.type(screen.getByLabelText('Room Number'), '204')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Password must be at least 8 characters.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('can switch back to the login form', async () => {
    const user = userEvent.setup()
    render(<LoginPage onLogin={vi.fn()} />)
    await goToRegister(user)

    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument()
  })
})

describe('LoginPage: validation messages', () => {
  it('shows one app message for a malformed email and makes no request', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(200, {}))
    const user = userEvent.setup()
    const { container } = render(<LoginPage onLogin={vi.fn()} />)

    expect(container.querySelector('form')).toHaveAttribute('novalidate')
    await user.type(screen.getByLabelText('Email'), 'not-an-email')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Login' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid email address.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('clears the error as soon as the user edits a field', async () => {
    stubFetch(async () => jsonResponse(200, {}))
    const user = userEvent.setup()
    render(<LoginPage onLogin={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Login' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter your email and password.')

    await user.type(screen.getByLabelText('Email'), 'a')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows a notice passed in by the app', () => {
    stubFetch(async () => jsonResponse(200, {}))
    render(<LoginPage onLogin={vi.fn()} notice="Your session expired. Please log in again." />)
    expect(screen.getByRole('status')).toHaveTextContent('Your session expired. Please log in again.')
  })
})

describe('LoginPage: registration number', () => {
  it('rejects a registration number that is not in the VIT format without a request', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(201, {}))
    const user = userEvent.setup()
    render(<LoginPage onLogin={vi.fn()} />)
    await goToRegister(user)

    await user.type(screen.getByLabelText('Full Name'), 'Asha Rao')
    await user.type(screen.getByLabelText('Registration Number'), 'X123')
    await user.type(screen.getByLabelText('Email'), 'asha@vitstudent.ac.in')
    await user.type(screen.getByLabelText('Password'), 'solid-pass-1')
    await user.selectOptions(screen.getByLabelText('Hostel Type'), "Women's Hostel")
    await user.selectOptions(screen.getByLabelText('Hostel Block'), 'B')
    await user.type(screen.getByLabelText('Room Number'), '204')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Please enter a valid registration number (e.g. 23BCE1234).')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

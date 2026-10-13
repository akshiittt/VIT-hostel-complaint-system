// Full-stack journey (React in jsdom + real API + real MongoDB): invalid
// sign-ups show the right message, from the form or from the server.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { startBackend, loadApp, renderApp, student } from './harness'
import { signUp } from './steps'

let backend

beforeAll(async () => {
  backend = await startBackend()
  await loadApp(backend.url)
})

afterAll(async () => {
  await backend?.stop()
})

beforeEach(async () => {
  await backend.resetDb()
})

afterEach(() => {
  delete process.env.ALLOWED_EMAIL_DOMAINS
})

async function expectNoAccount() {
  expect(await backend.User.countDocuments()).toBe(0)
  expect(screen.queryByRole('heading', { name: 'Submit a Complaint' })).not.toBeInTheDocument()
}

describe('Journey 7: invalid sign-up inputs', () => {
  it('bad registration number: the form explains the format and sends nothing', async () => {
    const user = userEvent.setup()
    renderApp()

    await signUp(user, { ...student, regNumber: 'ABC123' })

    expect(await screen.findByRole('alert')).toHaveTextContent('Please enter a valid registration number (e.g. 23BCE1234).')
    await expectNoAccount()
  })

  it('short password: the form message', async () => {
    const user = userEvent.setup()
    renderApp()

    await signUp(user, { ...student, password: 'short1' })

    expect(await screen.findByRole('alert')).toHaveTextContent('Password must be at least 8 characters.')
    await expectNoAccount()
  })

  it('common password: the server message', async () => {
    const user = userEvent.setup()
    renderApp()

    await signUp(user, { ...student, password: 'password123' })

    expect(await screen.findByRole('alert')).toHaveTextContent('This password is too common. Please choose another.')
    await expectNoAccount()
  })

  it('non-university domain when ALLOWED_EMAIL_DOMAINS is set: the server message, then the right domain works', async () => {
    // The API reads this on every request, so it applies without a restart
    process.env.ALLOWED_EMAIL_DOMAINS = 'vitstudent.ac.in'
    const user = userEvent.setup()
    renderApp()

    await signUp(user, { ...student, email: 'asha@gmail.com' })

    expect(await screen.findByRole('alert')).toHaveTextContent('Please use your university email (@vitstudent.ac.in)')
    await expectNoAccount()

    const email = screen.getByLabelText('Email')
    await user.clear(email)
    await user.type(email, student.email)
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    expect(await screen.findByRole('heading', { name: 'Submit a Complaint' })).toBeInTheDocument()
  })

  it('missing fields: the form message', async () => {
    const user = userEvent.setup()
    renderApp()

    await signUp(user, { ...student, room: '' })

    expect(await screen.findByRole('alert')).toHaveTextContent('Please fill in all fields.')
    await expectNoAccount()
  })

  it('an email or registration number that is already registered: the server 409 messages', async () => {
    await backend.User.create({ ...student, email: 'taken@vitstudent.ac.in', regNumber: '23BCE9999', role: 'student' })
    const user = userEvent.setup()
    renderApp()

    await signUp(user, { ...student, email: 'taken@vitstudent.ac.in' })
    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists')

    const reg = screen.getByLabelText('Registration Number')
    await user.clear(reg)
    await user.type(reg, '23bce9999')
    const email = screen.getByLabelText('Email')
    await user.clear(email)
    await user.type(email, student.email)
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This registration number is already registered')
    expect(await backend.User.countDocuments()).toBe(1)
  })
})

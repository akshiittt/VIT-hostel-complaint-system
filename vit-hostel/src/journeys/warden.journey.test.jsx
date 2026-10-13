// Full-stack journeys (React in jsdom + real API + real MongoDB) for the
// warden: completing a complaint, and resetting a student's password.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { startBackend, loadApp, renderApp, api, student, warden, seedWarden, TOKEN_KEY } from './harness'
import { signUp, logIn, submitComplaint, waitForListLoaded } from './steps'

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
  await seedWarden(backend.User)
})

// The student signs up in the UI and files one complaint, then closes the tab.
// Returns the student's token, as a second device would still hold it.
async function studentFilesComplaint(user, description) {
  const view = renderApp()
  await signUp(user, student)
  await waitForListLoaded()
  await submitComplaint(user, { type: 'Electricity Issue', description })
  expect(await screen.findByRole('status')).toHaveTextContent('Complaint submitted.')
  const token = localStorage.getItem(TOKEN_KEY)
  view.unmount()
  localStorage.clear()
  return token
}

function statValue(label) {
  return screen.getByText(label, { selector: '.stat-box small' }).previousElementSibling.textContent
}

describe('Journey 2: warden completes a complaint and the student sees it', () => {
  it('filters Open, marks it Completed, and the student sees Completed after a refresh', async () => {
    const user = userEvent.setup()
    const studentToken = await studentFilesComplaint(user, 'Corridor light is off')

    // Warden logs in on their own device
    const wardenView = renderApp()
    await logIn(user, warden.email, warden.password)
    expect(await screen.findByRole('heading', { name: 'All Complaints' })).toBeInTheDocument()
    await screen.findByText('Corridor light is off')
    expect(statValue('Total')).toBe('1')
    expect(statValue('Open')).toBe('1')
    expect(statValue('Completed')).toBe('0')

    await user.selectOptions(screen.getByLabelText('Show'), 'Open')
    const card = (await screen.findByText('Corridor light is off')).closest('.complaint-card')
    await user.click(within(card).getByRole('button', { name: 'Mark as Completed' }))

    // Completed leaves the Open filter, and the counts come from the server
    expect(await screen.findByText('No complaints match this filter.')).toBeInTheDocument()
    await waitFor(() => expect(statValue('Completed')).toBe('1'))
    expect(statValue('Open')).toBe('0')

    const stored = await backend.Complaint.findOne().lean()
    expect(stored.status).toBe('Completed')
    expect(stored.resolvedAt).toBeInstanceOf(Date)
    expect(stored.statusHistory).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Logout' }))
    await screen.findByRole('button', { name: 'Login' })
    wardenView.unmount()

    // The student's device still holds its token; a reload shows the new status
    localStorage.setItem(TOKEN_KEY, studentToken)
    renderApp()
    const studentCard = (await screen.findByText('Corridor light is off')).closest('.complaint-card')
    expect(within(studentCard).getByText('Completed')).toBeInTheDocument()
  })

  it('refuses a wrong warden password with the server message', async () => {
    const user = userEvent.setup()
    renderApp()

    await logIn(user, warden.email, 'not-the-password')

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
    expect(screen.queryByRole('heading', { name: 'All Complaints' })).not.toBeInTheDocument()
  })

  it('a student cannot reach the warden list even with a valid token', async () => {
    const user = userEvent.setup()
    const studentToken = await studentFilesComplaint(user, 'Water cooler broken')

    const res = await api(backend.url, '/api/complaints', { token: studentToken })

    expect(res.status).toBe(403)
  })
})

describe('Journey 3: warden resets a student password', () => {
  it('temporary password → forced change → dashboard works, and every older session is gone', async () => {
    const user = userEvent.setup()
    const oldStudentToken = await studentFilesComplaint(user, 'Mess food is cold')

    // Warden resets the password and reads the temporary one off the screen
    const wardenView = renderApp()
    await logIn(user, warden.email, warden.password)
    await screen.findByRole('heading', { name: 'All Complaints' })
    await user.type(screen.getByLabelText('Student email'), student.email)
    await user.click(screen.getByRole('button', { name: 'Reset password' }))
    const result = await screen.findByText(/Temporary password for/)
    const temporaryPassword = result.querySelector('code').textContent
    expect(temporaryPassword).toMatch(/^\S{12}$/)
    await user.click(screen.getByRole('button', { name: 'Logout' }))
    await screen.findByRole('button', { name: 'Login' })
    wardenView.unmount()
    localStorage.clear()

    // The old password no longer works
    renderApp()
    await logIn(user, student.email, student.password)
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')

    // The temporary password only opens the forced change screen
    await logIn(user, student.email, temporaryPassword)
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
    expect(screen.getByText(/Your password was reset by the warden on /)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Submit a Complaint' })).not.toBeInTheDocument()
    // The server enforces it too, not just the UI
    const blocked = await api(backend.url, '/api/complaints/mine', { token: localStorage.getItem(TOKEN_KEY) })
    expect(blocked).toEqual({ status: 403, body: { message: 'Please change your password first' } })

    await user.type(screen.getByLabelText('Current password'), temporaryPassword)
    await user.type(screen.getByLabelText('New password'), 'brand-new-pass-7')
    await user.type(screen.getByLabelText('Confirm new password'), 'brand-new-pass-7')
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    // Dashboard works with the new token: the old complaint loads and a new one saves
    expect(await screen.findByRole('heading', { name: 'Submit a Complaint' })).toBeInTheDocument()
    expect(await screen.findByText('Mess food is cold')).toBeInTheDocument()
    await submitComplaint(user, { type: 'Others', description: 'Laundry room locked' })
    expect(await screen.findByText('Laundry room locked')).toBeInTheDocument()

    // The session from before the reset is dead on the server...
    expect((await api(backend.url, '/api/auth/me', { token: oldStudentToken })).status).toBe(401)
    // ...and a device still holding it lands on the login page with the notice
    localStorage.setItem(TOKEN_KEY, oldStudentToken)
    renderApp()
    expect(await screen.findByText('Your session expired. Please log in again.')).toBeInTheDocument()
  })

  it('shows the server message when the email is not a student', async () => {
    const user = userEvent.setup()
    renderApp()
    await logIn(user, warden.email, warden.password)
    await screen.findByRole('heading', { name: 'All Complaints' })

    await user.type(screen.getByLabelText('Student email'), 'nobody@vitstudent.ac.in')
    await user.click(screen.getByRole('button', { name: 'Reset password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No student account with that email')
  })

  it('the forced screen rejects reusing the temporary password', async () => {
    const user = userEvent.setup()
    await studentFilesComplaint(user, 'Door lock jammed')
    const wardenLogin = await api(backend.url, '/api/auth/login', { method: 'POST', body: { email: warden.email, password: warden.password } })
    const reset = await api(backend.url, '/api/auth/reset-password', { method: 'POST', token: wardenLogin.body.token, body: { email: student.email } })
    const { temporaryPassword } = reset.body

    renderApp()
    await logIn(user, student.email, temporaryPassword)
    await screen.findByRole('heading', { name: 'Choose a new password' })
    await user.type(screen.getByLabelText('Current password'), temporaryPassword)
    await user.type(screen.getByLabelText('New password'), temporaryPassword)
    await user.type(screen.getByLabelText('Confirm new password'), temporaryPassword)
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('New password must be different from the current one')
    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument()
  })
})

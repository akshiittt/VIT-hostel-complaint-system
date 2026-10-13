// Full-stack journey (React in jsdom + real API + real MongoDB): a session
// revoked on the server (logout from another device) ends this one too.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { startBackend, loadApp, renderApp, api, student, TOKEN_KEY } from './harness'
import { signUp, logIn, submitComplaint, waitForListLoaded } from './steps'

const EXPIRED = 'Your session expired. Please log in again.'

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

// "Another device" holding the same token logs out through the API
async function logoutElsewhere() {
  const res = await api(backend.url, '/api/auth/logout', { method: 'POST', token: localStorage.getItem(TOKEN_KEY) })
  expect(res.status).toBe(204)
}

describe('Journey 4: session revoked server-side', () => {
  it('the next Refresh shows the expired notice and clears the token', async () => {
    const user = userEvent.setup()
    renderApp()
    await signUp(user, student)
    await waitForListLoaded()

    await logoutElsewhere()
    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(await screen.findByText(EXPIRED)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Login' })).toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('submitting a complaint with the revoked session logs out instead of showing an error in the form', async () => {
    const user = userEvent.setup()
    renderApp()
    await signUp(user, student)
    await waitForListLoaded()

    await logoutElsewhere()
    await submitComplaint(user, { description: 'Bathroom tap leaking' })

    expect(await screen.findByText(EXPIRED)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Submit a Complaint' })).not.toBeInTheDocument()
    expect(await backend.Complaint.countDocuments()).toBe(0)
  })

  it('a reload with the revoked token lands on login with the notice; logging in again works and clears it', async () => {
    const user = userEvent.setup()
    const view = renderApp()
    await signUp(user, student)
    await waitForListLoaded()
    await logoutElsewhere()
    view.unmount()

    renderApp()
    expect(await screen.findByText(EXPIRED)).toBeInTheDocument()

    await logIn(user, student.email, student.password)
    expect(await screen.findByRole('heading', { name: 'Submit a Complaint' })).toBeInTheDocument()
    expect(screen.queryByText(EXPIRED)).not.toBeInTheDocument()
  })

  it('the Logout button really ends the session on the server', async () => {
    const user = userEvent.setup()
    renderApp()
    await signUp(user, student)
    await waitForListLoaded()
    const token = localStorage.getItem(TOKEN_KEY)

    await user.click(screen.getByRole('button', { name: 'Logout' }))
    await screen.findByRole('button', { name: 'Login' })

    // The logout request is fire-and-forget in the UI, so poll the server
    await expect.poll(async () => (await api(backend.url, '/api/auth/me', { token })).status).toBe(401)
    expect(screen.queryByText(EXPIRED)).not.toBeInTheDocument()
  })
})

// Full-stack journey (React in jsdom + real API): the database is unreachable
// from the start. This file's API points at an address where nothing listens,
// so it never shares a database with the other journeys.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { startBackend, loadApp, renderApp, api, student, TOKEN_KEY } from './harness'
import { signUp, logIn } from './steps'

const UNAVAILABLE = 'The service is temporarily unavailable. Please try again shortly.'

let backend

beforeAll(async () => {
  backend = await startBackend({ db: false })
  await loadApp(backend.url)
})

afterAll(async () => {
  await backend?.stop()
})

describe('Journey 6a: database unreachable from the start', () => {
  it('login shows the 503 "temporarily unavailable" message and stays on the login page', async () => {
    const user = userEvent.setup()
    renderApp()

    await logIn(user, student.email, student.password)

    expect(await screen.findByRole('alert', {}, { timeout: 15000 })).toHaveTextContent(UNAVAILABLE)
    expect(screen.getByRole('button', { name: 'Login' })).toBeEnabled()
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull()
  })

  it('sign-up shows the same message', async () => {
    const user = userEvent.setup()
    renderApp()

    await signUp(user, student)

    expect(await screen.findByRole('alert', {}, { timeout: 15000 })).toHaveTextContent(UNAVAILABLE)
  })

  it('the API answers 503 with Retry-After and health reports the database as unreachable', async () => {
    const res = await fetch(`${backend.url}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: student.email, password: student.password })
    })
    expect(res.status).toBe(503)
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0)

    expect(await api(backend.url, '/api/health')).toEqual({ status: 503, body: { status: 'error', db: 'unreachable' } })
  })

  it('a saved session is kept (not logged out) and the Retry screen shows the message', async () => {
    localStorage.setItem(TOKEN_KEY, 'token-from-before-the-outage')
    renderApp()

    expect(await screen.findByRole('alert', {}, { timeout: 15000 })).toHaveTextContent(UNAVAILABLE)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(localStorage.getItem(TOKEN_KEY)).toBe('token-from-before-the-outage')
  })
})

// Full-stack journey (React in jsdom + real API + real MongoDB): the database
// goes away in the middle of a session. This file owns its memory server and
// stops it, so no other journey is affected.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { startBackend, loadApp, renderApp, student, TOKEN_KEY } from './harness'
import { signUp, submitComplaint, waitForListLoaded } from './steps'

const UNAVAILABLE = 'The service is temporarily unavailable. Please try again shortly.'

let backend

beforeAll(async () => {
  backend = await startBackend()
  await loadApp(backend.url)
})

afterAll(async () => {
  await backend?.stop()
})

describe('Journey 6b: database stops mid-session', () => {
  it('Refresh and submit both show the 503 message, and the student stays logged in', async () => {
    const user = userEvent.setup()
    renderApp()
    await signUp(user, student)
    await waitForListLoaded()

    await backend.mongod.stop()

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    // The API waits for MongoDB's server-selection / buffering timeout first
    expect(await screen.findByRole('alert', {}, { timeout: 20000 })).toHaveTextContent(UNAVAILABLE)
    expect(localStorage.getItem(TOKEN_KEY)).toBeTruthy()

    await submitComplaint(user, { description: 'Lift is stuck' })
    expect(await screen.findByText(UNAVAILABLE, { selector: 'form [role="alert"]' }, { timeout: 20000 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Submit a Complaint' })).toBeInTheDocument()
  }, 60000)
})

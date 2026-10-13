// Full-stack journey (React in jsdom + real API + real MongoDB): a student
// signs up, files a complaint and sees it; a double submit gets the API's 409.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { startBackend, loadApp, renderApp, student, TOKEN_KEY } from './harness'
import { signUp, submitComplaint, waitForListLoaded } from './steps'

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

function myComplaints() {
  return screen.getByRole('heading', { name: 'My Complaints' }).closest('.panel-card')
}

describe('Journey 1: student signs up, submits a complaint and sees it', () => {
  it('stores the complaint in MongoDB and lists it under My Complaints, also after a reload', async () => {
    const user = userEvent.setup()
    const view = renderApp()

    await signUp(user, student)
    expect(await screen.findByRole('heading', { name: 'Submit a Complaint' })).toBeInTheDocument()
    expect(screen.getByText(student.name)).toBeInTheDocument()
    await waitForListLoaded()
    expect(screen.getByText('No complaints found.')).toBeInTheDocument()

    await submitComplaint(user, { type: 'Water Issue', description: 'Tap in the washroom is leaking' })

    expect(await screen.findByRole('status')).toHaveTextContent('Complaint submitted.')
    const list = myComplaints()
    expect(within(list).getByText('Tap in the washroom is leaking')).toBeInTheDocument()
    expect(within(list).getByText('Pending')).toBeInTheDocument()

    // Really persisted, with the server-side identity (not what the form sent)
    const saved = await backend.Complaint.find().lean()
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ name: student.name, reg: student.regNumber, block: 'C', room: '204', status: 'Pending' })

    // A reload restores the session from the stored token and refetches
    view.unmount()
    expect(localStorage.getItem(TOKEN_KEY)).toBeTruthy()
    renderApp()
    expect(await screen.findByText('Tap in the washroom is leaking')).toBeInTheDocument()
  })

  it('rejects an incomplete complaint in the form without creating anything', async () => {
    const user = userEvent.setup()
    renderApp()
    await signUp(user, student)
    await waitForListLoaded()

    await user.click(screen.getByRole('button', { name: 'Submit Complaint' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Please fill in all required fields.')
    expect(await backend.Complaint.countDocuments()).toBe(0)
  })
})

describe('Journey 5: duplicate complaint within 10 minutes', () => {
  it('shows the API 409 message and keeps a single copy', async () => {
    const user = userEvent.setup()
    renderApp()
    await signUp(user, student)
    await waitForListLoaded()

    await submitComplaint(user, { type: 'WiFi Issue', description: 'WiFi drops every evening' })
    expect(await screen.findByRole('status')).toHaveTextContent('Complaint submitted.')

    await submitComplaint(user, { type: 'WiFi Issue', description: 'WiFi drops every evening' })

    expect(await screen.findByRole('alert')).toHaveTextContent('You already submitted this complaint a moment ago')
    await waitFor(async () => expect(await backend.Complaint.countDocuments()).toBe(1))
    expect(within(myComplaints()).getAllByText('WiFi drops every evening')).toHaveLength(1)
  })

  it('still accepts a different complaint right after', async () => {
    const user = userEvent.setup()
    renderApp()
    await signUp(user, student)
    await waitForListLoaded()

    await submitComplaint(user, { description: 'Fan is broken' })
    expect(await screen.findByRole('status')).toHaveTextContent('Complaint submitted.')
    await submitComplaint(user, { type: 'Electricity Issue', description: 'Socket sparks' })

    await waitFor(() => expect(within(myComplaints()).getByText('Socket sparks')).toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(await backend.Complaint.countDocuments()).toBe(2)
  })
})

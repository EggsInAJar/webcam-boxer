import type { Page } from '@playwright/test'

/**
 * Inject a fake MediaStream so webcam pages don't block on camera permission.
 * Must be called before page.goto() to take effect.
 */
export async function mockWebcam(page: Page) {
  await page.addInitScript(() => {
    const fakeStream = {
      getTracks: () => [{ stop: () => {}, kind: 'video', enabled: true }],
      getVideoTracks: () => [{ stop: () => {}, kind: 'video', enabled: true }],
      getAudioTracks: () => [],
      active: true,
    } as unknown as MediaStream

    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: () => Promise.resolve(fakeStream),
        enumerateDevices: () => Promise.resolve([]),
      },
      configurable: true,
      writable: true,
    })
  })
}

/**
 * Stub the /v1/identity endpoint so the online page doesn't need a live server.
 */
export async function mockIdentity(page: Page) {
  await page.route('**/v1/identity', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        guestId: '00000000-0000-0000-0000-000000000001',
        token: 'fakehmacsig:0',
        rating: 1200,
        username: null,
      }),
    })
  )
}

/**
 * Stub socket.io handshake so the online page doesn't hang on connection.
 */
export async function mockSocket(page: Page) {
  await page.route('**/socket.io/**', (route) => route.abort())
}

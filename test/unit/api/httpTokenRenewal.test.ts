// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ========= Copyright 2025-2026 @ Eigent.ai All Rights Reserved. =========

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  auth: {
    token: null as string | null,
    user_id: 1 as number | null,
    setAuth: vi.fn(),
  },
  setState: vi.fn(),
  reportError: vi.fn(() => 'task'),
}));

vi.mock('@/store/authStore', () => ({
  getAuthStore: () => mocked.auth,
  useAuthStore: {
    setState: (patch: { token: string }) => {
      mocked.setState(patch);
      mocked.auth.token = patch.token;
    },
  },
}));

vi.mock('@/host/createHost', () => ({
  createHost: () => ({ electronAPI: null, ipcRenderer: null }),
}));

vi.mock('@/lib/notifyError', () => ({
  reportError: mocked.reportError,
}));

vi.mock('@/components/Toast/storageToast', () => ({
  showStorageToast: vi.fn(),
}));

const jwt = (exp: number, id = 1) =>
  `h.${btoa(JSON.stringify({ id, exp })).replace(/=+$/, '')}.s`;
const nowSec = () => Math.floor(Date.now() / 1000);
const EXPIRED = jwt(nowSec() - 3600);
const FRESH = jwt(nowSec() + 7 * 24 * 3600);
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

async function loadHttp(localMode: boolean) {
  vi.resetModules();
  vi.stubEnv('VITE_USE_LOCAL_PROXY', localMode ? 'true' : 'false');
  return import('@/api/http');
}

function authHeader(call: unknown[]): string | undefined {
  return ((call[1] as RequestInit).headers as Record<string, string>)
    .Authorization;
}

describe('api/http local session renewal', () => {
  beforeEach(() => {
    mocked.auth = { token: null, user_id: 1, setAuth: vi.fn() };
    mocked.setState.mockClear();
    mocked.reportError.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('treats expired, near-expiry and unreadable tokens as expiring', async () => {
    const { isTokenExpiring } = await loadHttp(true);
    expect(isTokenExpiring(EXPIRED)).toBe(true);
    expect(isTokenExpiring(jwt(nowSec() + 60))).toBe(true);
    expect(isTokenExpiring('not-a-jwt')).toBe(true);
    expect(isTokenExpiring(FRESH)).toBe(false);
    expect(isTokenExpiring(null)).toBe(false);
  });

  it('renews an expired token before the request and keeps the same user', async () => {
    const { proxyFetchGet } = await loadHttp(true);
    mocked.auth.token = EXPIRED;
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ token: FRESH, email: 'a@b', user_id: 1 }))
      .mockResolvedValueOnce(json({ items: [] }));

    await expect(proxyFetchGet('/api/v1/spaces')).resolves.toEqual({
      items: [],
    });

    expect(fetch.mock.calls[0][0]).toBe('/api/v1/user/auto-login');
    expect(authHeader(fetch.mock.calls[1])).toBe(`Bearer ${FRESH}`);
    expect(mocked.setState).toHaveBeenCalledWith({ token: FRESH });
    expect(mocked.auth.setAuth).not.toHaveBeenCalled();
  });

  it('renews and retries once when the server rejects the token', async () => {
    const { proxyFetchPost } = await loadHttp(true);
    const rejected = jwt(nowSec() + 3600);
    mocked.auth.token = rejected;
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        json({ code: 13, text: 'Could not validate credentials' })
      )
      .mockResolvedValueOnce(json({ token: FRESH, email: 'a@b', user_id: 1 }))
      .mockResolvedValueOnce(json({ id: 'p1' }));

    await expect(
      proxyFetchPost('/api/v1/spaces/s/projects', {})
    ).resolves.toEqual({
      id: 'p1',
    });

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(authHeader(fetch.mock.calls[0])).toBe(`Bearer ${rejected}`);
    expect(authHeader(fetch.mock.calls[2])).toBe(`Bearer ${FRESH}`);
    expect(mocked.reportError).not.toHaveBeenCalled();
  });

  it('shares one auto-login across concurrent requests', async () => {
    const { proxyFetchGet } = await loadHttp(true);
    mocked.auth.token = EXPIRED;
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url) =>
        String(url).endsWith('/auto-login')
          ? json({ token: FRESH, email: 'a@b', user_id: 1 })
          : json({ ok: true })
      );

    await Promise.all([proxyFetchGet('/a'), proxyFetchGet('/b')]);

    const logins = fetch.mock.calls.filter(([url]) =>
      String(url).endsWith('/auto-login')
    );
    expect(logins).toHaveLength(1);
  });

  it('reports the error when the retry is rejected too', async () => {
    const { proxyFetchGet } = await loadHttp(true);
    mocked.auth.token = jwt(nowSec() + 3600);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).endsWith('/auto-login')
        ? json({ token: FRESH, email: 'a@b', user_id: 1 })
        : json({ code: 13, text: 'Could not validate credentials' })
    );

    await expect(proxyFetchGet('/api/v1/spaces')).rejects.toThrow(
      'Could not validate credentials'
    );
    expect(mocked.reportError).toHaveBeenCalledTimes(1);
  });

  it('does not auto-login outside local mode', async () => {
    const { proxyFetchGet, renewLocalSession } = await loadHttp(false);
    mocked.auth.token = EXPIRED;
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json({ ok: true }));

    await proxyFetchGet('/api/v1/spaces');
    await expect(renewLocalSession()).resolves.toBeNull();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(authHeader(fetch.mock.calls[0])).toBe(`Bearer ${EXPIRED}`);
  });
});

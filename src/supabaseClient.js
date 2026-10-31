const BASE_URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// --- Auth (Supabase Auth via REST; no SDK dependency) ---
const SESSION_KEY = 'deal-closing-session';
let session = null;

const loadStored = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } };
const storeSession = s => { session = s; s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); };

async function authCall(path, body, token) {
  if (!BASE_URL || !KEY) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY (restart the dev server after editing .env).');
  const res = await fetch(`${BASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${token || KEY}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body)
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error_description || data?.msg || data?.message || `Auth error ${res.status}`);
  return data;
}

const toSession = d => ({
  accessToken: d.access_token, refreshToken: d.refresh_token, expiresAt: Date.now() + d.expires_in * 1000,
  user: { id: d.user.id, email: d.user.email, name: d.user.user_metadata?.full_name || d.user.user_metadata?.name || d.user.email.split('@')[0] }
});

export async function signIn(email, password) {
  const s = toSession(await authCall('token?grant_type=password', { email, password }));
  storeSession(s);
  return s.user;
}

export async function signOut() {
  const token = session?.accessToken;
  storeSession(null);
  if (token) await authCall('logout', null, token).catch(() => {});
}

// Returns the signed-in user from a stored session (refreshing it if expired), or null.
export async function restoreSession() {
  const s = loadStored();
  if (!s) return null;
  if (s.expiresAt - 30000 > Date.now()) { session = s; return s.user; }
  try {
    const fresh = toSession(await authCall('token?grant_type=refresh_token', { refresh_token: s.refreshToken }));
    storeSession(fresh);
    return fresh.user;
  } catch { storeSession(null); return null; }
}

// --- Data (PostgREST). Requests carry the signed-in user's token so row-level security applies. ---
export async function rest(path, { method = 'GET', body, prefer } = {}) {
  if (!BASE_URL || !KEY) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY (restart the dev server after editing .env).');
  if (session && session.expiresAt - 30000 < Date.now()) await restoreSession();
  const res = await fetch(`${BASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${session?.accessToken || KEY}`, 'Content-Type': 'application/json', ...(prefer && { Prefer: prefer }) },
    body: body && JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()) || res.statusText}`);
  // Writes sent with "return=minimal" come back 201/204 with an empty body, so only parse JSON when there is some.
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}


export const currentUser = () => session?.user;

// Calls a Supabase Edge Function as the signed-in user (the function checks the token and reads data with it).
// `url` overrides the address (used to run a function on this machine instead of Supabase).
export async function callFunction(name, body, { url } = {}) {
  if (!BASE_URL || !KEY) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY (restart the dev server after editing .env).');
  if (session && session.expiresAt - 30000 < Date.now()) await restoreSession();
  if (!session) throw new Error('Please sign in again.');
  let res;
  try {
    res = await fetch(url || `${BASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error(url ? 'Could not reach Ask AI on this computer. Start it with "npm run ask-ai" and keep that window open.' : 'Could not reach the server. Check your connection.');
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
  if (!res.ok) {
    if (res.status === 404) throw new Error('Ask AI is not deployed yet (the "ask-ai" function was not found).');
    const error = new Error(data?.error || data?.message || `Request failed (${res.status}).`);
    error.status = res.status;
    throw error;
  }
  return data;
}

// Deal Closing API calls use the same logged-in Supabase session and RLS identity.
export async function apiRequest(path) {
  if (session && session.expiresAt - 30000 < Date.now()) await restoreSession();
  if (!session) throw new Error('Please sign in again.');
  const base = (import.meta.env.VITE_DEAL_API_URL || 'http://localhost:3001').replace(/\/$/, '');
  const response = await fetch(`${base}${path}`, {headers:{Authorization:`Bearer ${session.accessToken}`}});
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Deal API error ${response.status}`);
  return data;
}

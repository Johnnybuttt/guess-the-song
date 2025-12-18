// guess-the-song/spotify.js
import { randomString, sha256Base64Url } from "./pkce.js";

// Dev mode: Set ?dev=true in URL or localStorage.setItem('dev_mode', 'true')
export const DEV_MODE = new URLSearchParams(window.location.search).get('dev') === 'true' 
  || localStorage.getItem('dev_mode') === 'true';

export const SPOTIFY_CLIENT_ID = "b73a4ec396574050bbfd3c398514bfc2";
export const REDIRECT_URI = "https://johnnybuttt.github.io/guess-the-song/callback.html";

const SCOPES = [
  "streaming",
  "user-read-private",
  "user-read-email",
  "user-modify-playback-state",
  "user-read-playback-state",
  "user-top-read",
].join(" ");

const LS = {
  verifier: "pkce_verifier",
  state: "pkce_state",
  token: "sp_access_token",
  exp: "sp_token_exp",
};

export function logout() {
  localStorage.removeItem(LS.verifier);
  localStorage.removeItem(LS.state);
  localStorage.removeItem(LS.token);
  localStorage.removeItem(LS.exp);
}

export function getAccessToken() {
  const token = localStorage.getItem(LS.token);
  const exp = Number(localStorage.getItem(LS.exp) || "0");
  if (!token || Date.now() > exp) return null;
  return token;
}

export function isAuthed() {
  if (DEV_MODE) return true; // Always authenticated in dev mode
  return !!getAccessToken();
}

// Mock data for dev mode
const MOCK_TRACKS = [
  { uri: "spotify:track:mock1", name: "Bohemian Rhapsody", artist: "Queen", duration_ms: 355000 },
  { uri: "spotify:track:mock2", name: "Stairway to Heaven", artist: "Led Zeppelin", duration_ms: 482000 },
  { uri: "spotify:track:mock3", name: "Hotel California", artist: "Eagles", duration_ms: 391000 },
  { uri: "spotify:track:mock4", name: "Sweet Child O' Mine", artist: "Guns N' Roses", duration_ms: 356000 },
  { uri: "spotify:track:mock5", name: "Imagine", artist: "John Lennon", duration_ms: 183000 },
  { uri: "spotify:track:mock6", name: "Billie Jean", artist: "Michael Jackson", duration_ms: 294000 },
  { uri: "spotify:track:mock7", name: "Smells Like Teen Spirit", artist: "Nirvana", duration_ms: 301000 },
  { uri: "spotify:track:mock8", name: "Like a Rolling Stone", artist: "Bob Dylan", duration_ms: 366000 },
  { uri: "spotify:track:mock9", name: "Wonderwall", artist: "Oasis", duration_ms: 258000 },
  { uri: "spotify:track:mock10", name: "Don't Stop Believin'", artist: "Journey", duration_ms: 251000 },
];

export async function beginLogin({ force = false } = {}) {
  const verifier = randomString(64);
  const challenge = await sha256Base64Url(verifier);
  const state = randomString(16);

  localStorage.setItem(LS.verifier, verifier);
  localStorage.setItem(LS.state, state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state,
  });

  if (force) params.set("show_dialog", "true");

  window.location.href =
    "https://accounts.spotify.com/authorize?" + params.toString();
}

export async function handleCallback() {
  const url = new URL(window.location.href);

  const err = url.searchParams.get("error");
  if (err) throw new Error(err);

  const code = url.searchParams.get("code");
  if (!code) throw new Error("Missing code");

  const returnedState = url.searchParams.get("state");
  const expectedState = localStorage.getItem(LS.state);
  if (!returnedState || !expectedState || returnedState !== expectedState) {
    throw new Error("Invalid state. Try logging in again.");
  }

  const verifier = localStorage.getItem(LS.verifier);
  if (!verifier) throw new Error("Missing PKCE verifier. Try logging in again.");

  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token exchange failed (${res.status}). ${text}`);
  }

  const data = await res.json();
  const expiresAt = Date.now() + data.expires_in * 1000 - 10000;

  localStorage.setItem(LS.token, data.access_token);
  localStorage.setItem(LS.exp, String(expiresAt));

  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState({}, document.title, url.toString());

  return data.access_token;
}

export async function spotifyFetch(path, { method = "GET", body } = {}) {
  // Dev mode: Return mock data
  if (DEV_MODE) {
    await new Promise(r => setTimeout(r, 300)); // Simulate network delay
    
    if (path === "/me") {
      return { product: "premium", country: "US" };
    }
    
    if (path === "/me/top/tracks") {
      const timeRange = new URLSearchParams(path.split("?")[1] || "").get("time_range") || "medium_term";
      return {
        items: MOCK_TRACKS.map(t => ({
          uri: t.uri,
          name: t.name,
          artists: [{ name: t.artist }],
          duration_ms: t.duration_ms
        }))
      };
    }
    
    if (path.startsWith("/search")) {
      return {
        tracks: {
          items: MOCK_TRACKS.map(t => ({
            uri: t.uri,
            name: t.name,
            artists: [{ name: t.artist }],
            duration_ms: t.duration_ms
          }))
        }
      };
    }
    
    if (path === "/me/player") {
      if (method === "PUT") {
        return null; // Success
      }
      return { device: { id: "dev-device", is_active: true } };
    }
    
    if (path.startsWith("/me/player/")) {
      return null; // Success for play/pause/seek
    }
    
    return {};
  }
  
  // Real Spotify API calls
  const token = getAccessToken();
  if (!token) throw new Error("Not logged in to Spotify.");

  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Spotify API ${res.status}: ${text || "Request failed"}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

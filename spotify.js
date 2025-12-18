// guess-the-song/spotify.js
import { randomString, sha256Base64Url } from "./pkce.js";

export const SPOTIFY_CLIENT_ID = "b73a4ec396574050bbfd3c398514bfc2";

// Allowed origins for redirect URI (security whitelist)
const ALLOWED_ORIGINS = [
  "https://johnnybuttt.github.io",
  "http://localhost",
  "http://127.0.0.1"
];

// Use current origin for redirect URI (works for both localhost and production)
// Get the base path (everything before the filename)
const basePath = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
const currentOrigin = window.location.origin;

// Validate origin is in whitelist (extra security layer)
const isAllowedOrigin = ALLOWED_ORIGINS.some(allowed => currentOrigin.startsWith(allowed));
if (!isAllowedOrigin) {
  console.warn(`Warning: Origin ${currentOrigin} is not in the allowed list. Make sure to add it to your Spotify app's redirect URIs.`);
}

export const REDIRECT_URI = `${currentOrigin}${basePath}callback.html`;

const SCOPES = [
  "streaming",
  "user-read-private",
  "user-read-email",
  "user-modify-playback-state",
  "user-read-playback-state",
  "user-top-read"
].join(" ");

const LS = {
  verifier: "pkce_verifier",
  state: "oauth_state",
  token: "sp_access_token",
  exp: "sp_token_exp"
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
  return !!getAccessToken();
}

export async function beginLogin({ force = false } = {}) {
  const verifier = randomString(64);
  const challenge = await sha256Base64Url(verifier);
  const state = randomString(32);
  
  localStorage.setItem(LS.verifier, verifier);
  localStorage.setItem(LS.state, state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge,
    state: state
  });

  // Forces Spotify to show the consent screen again
  if (force) params.set("show_dialog", "true");

  window.location.href = "https://accounts.spotify.com/authorize?" + params.toString();
}

export async function handleCallback() {
  const url = new URL(window.location.href);

  const err = url.searchParams.get("error");
  if (err) throw new Error("Authentication failed. Please try again.");

  const code = url.searchParams.get("code");
  if (!code) throw new Error("Missing authorization code. Please try logging in again.");

  // Verify state parameter to prevent CSRF
  const returnedState = url.searchParams.get("state");
  const storedState = localStorage.getItem(LS.state);
  if (!returnedState || !storedState || returnedState !== storedState) {
    throw new Error("Security validation failed. Please try logging in again.");
  }
  localStorage.removeItem(LS.state);

  const verifier = localStorage.getItem(LS.verifier);
  if (!verifier) throw new Error("Missing PKCE verifier. Please try logging in again.");

  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!res.ok) {
    const status = res.status;
    // Don't leak API error details to users
    if (status === 400 || status === 401) {
      throw new Error("Authentication failed. Please try logging in again.");
    }
    throw new Error("Authentication service unavailable. Please try again later.");
  }

  const data = await res.json();
  const expiresAt = Date.now() + (data.expires_in * 1000) - 10_000;

  localStorage.setItem(LS.token, data.access_token);
  localStorage.setItem(LS.exp, String(expiresAt));

  // Clean up URL parameters for security
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  url.searchParams.delete("error");
  window.history.replaceState({}, document.title, url.toString());

  return data.access_token;
}

export async function spotifyFetch(path, { method = "GET", body } = {}) {
  const token = getAccessToken();
  if (!token) throw new Error("Not logged in to Spotify.");

  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    const status = res.status;
    // Provide user-friendly error messages without leaking API details
    if (status === 401) {
      throw new Error("Session expired. Please log in again.");
    } else if (status === 403) {
      throw new Error("Access denied. Please check your permissions.");
    } else if (status >= 500) {
      throw new Error("Spotify service unavailable. Please try again later.");
    } else {
      throw new Error("Request failed. Please try again.");
    }
  }

  if (res.status === 204) return null;
  return res.json();
}

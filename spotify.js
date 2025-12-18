// guess-the-song/spotify.js
import { randomString, sha256Base64Url } from "./pkce.js";

export const SPOTIFY_CLIENT_ID = "b73a4ec396574050bbfd3c398514bfc2";
export const REDIRECT_URI = "https://johnnybuttt.github.io/guess-the-song/callback.html";

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
  token: "sp_access_token",
  exp: "sp_token_exp"
};

export function logout() {
  localStorage.removeItem(LS.verifier);
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
  localStorage.setItem(LS.verifier, verifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: "S256",
    code_challenge: challenge
  });

  // Forces Spotify to show the consent screen again
  if (force) params.set("show_dialog", "true");

  window.location.href = "https://accounts.spotify.com/authorize?" + params.toString();
}

export async function handleCallback() {
  const url = new URL(window.location.href);

  const err = url.searchParams.get("error");
  if (err) throw new Error(err);

  const code = url.searchParams.get("code");
  if (!code) throw new Error("Missing code");

  const verifier = localStorage.getItem(LS.verifier);
  if (!verifier) throw new Error("Missing PKCE verifier. Try logging in again.");

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
    const text = await res.text().catch(() => "");
    throw new Error(`Token exchange failed (${res.status}). ${text}`);
  }

  const data = await res.json();
  const expiresAt = Date.now() + (data.expires_in * 1000) - 10_000;

  localStorage.setItem(LS.token, data.access_token);
  localStorage.setItem(LS.exp, String(expiresAt));

  url.searchParams.delete("code");
  url.searchParams.delete("state");
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
    const text = await res.text().catch(() => "");
    throw new Error(`Spotify API ${res.status}: ${text || "Request failed"}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

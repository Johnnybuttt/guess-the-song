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

  let res;
  try {
    res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
  } catch (e) {
    console.error("Network error during token exchange:", e);
    throw new Error("Network error. Please check your connection and try again.");
  }

  if (!res.ok) {
    const status = res.status;
    let errorText = "";
    try {
      const errorData = await res.json();
      errorText = errorData.error_description || errorData.error || "";
      console.error("Token exchange error:", status, errorText);
    } catch {
      errorText = await res.text().catch(() => "");
      console.error("Token exchange error (non-JSON):", status, errorText);
    }
    
    // Provide more helpful error messages
    if (status === 400) {
      if (errorText.includes("redirect_uri")) {
        throw new Error("Redirect URI mismatch. Please make sure the callback URL is registered in your Spotify app settings.");
      }
      throw new Error("Invalid request. Please try logging in again.");
    } else if (status === 401) {
      throw new Error("Authentication failed. Please try logging in again.");
    } else if (status === 403) {
      throw new Error("Access denied. Please check your app permissions.");
    }
    throw new Error(`Authentication failed (${status}). Please try again.`);
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
      // Try to get more details from the response
      let errorMsg = "Access denied. ";
      try {
        const errorData = await res.json().catch(() => ({}));
        if (errorData.error?.message) {
          errorMsg += errorData.error.message;
        } else if (path.includes("/me/player")) {
          errorMsg += "Spotify Premium is required for playback. Please upgrade your account.";
        } else {
          errorMsg += "Please check your account permissions.";
        }
      } catch {
        errorMsg += "Please check your account permissions or upgrade to Premium.";
      }
      throw new Error(errorMsg);
    } else if (status >= 500) {
      throw new Error("Spotify service unavailable. Please try again later.");
    } else {
      throw new Error("Request failed. Please try again.");
    }
  }

  if (res.status === 204) return null;
  return res.json();
}

import { randomString, sha256Base64Url } from "./pkce.js";

export const SPOTIFY_CLIENT_ID = "b73a4ec396574050bbfd3c398514bfc2";

// Works correctly inside subfolders
export const REDIRECT_URI = "https://johnnybuttt.github.io/guess-the-song/callback.html";


const SCOPES = [
  "streaming",
  "user-read-private",
  "user-read-email",
  "user-modify-playback-state",
  "user-read-playback-state"
].join(" ");

const LS = {
  verifier: "pkce_verifier",
  token: "sp_access_token",
  exp: "sp_token_exp"
};

export function getAccessToken() {
  const t = localStorage.getItem(LS.token);
  const e = Number(localStorage.getItem(LS.exp));
  if (!t || Date.now() > e) return null;
  return t;
}

export function isAuthed() {
  return !!getAccessToken();
}

export async function beginLogin() {
  const verifier = randomString();
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

  window.location.href =
    "https://accounts.spotify.com/authorize?" + params.toString();
}

export async function handleCallback() {
  const code = new URLSearchParams(window.location.search).get("code");
  if (!code) throw new Error("Missing code");

  const body = new URLSearchParams({
    client_id: SPOTIFY_CLIENT_ID,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: localStorage.getItem(LS.verifier)
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  const data = await res.json();
  localStorage.setItem(LS.token, data.access_token);
  localStorage.setItem(
    LS.exp,
    Date.now() + data.expires_in * 1000 - 10000
  );
}

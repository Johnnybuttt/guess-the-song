export function randomString(length = 64) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let s = "";
    crypto.getRandomValues(new Uint8Array(length)).forEach(v => {
      s += chars[v % chars.length];
    });
    return s;
  }
  
  function base64url(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  
  export async function sha256Base64Url(str) {
    const buffer = new TextEncoder().encode(str);
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return base64url(digest);
  }
  
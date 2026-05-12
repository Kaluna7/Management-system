const TOKEN_KEY = "admin_system_token";
const USER_KEY = "admin_system_user";

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUserName() {
  return localStorage.getItem(USER_KEY) ?? "";
}

export function setStoredSession(token: string, userName: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, userName);
}

export function clearStoredSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

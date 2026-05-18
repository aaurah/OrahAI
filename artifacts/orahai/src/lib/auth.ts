export function getToken(): string | null {
  return localStorage.getItem("orahai_token");
}

export function setToken(token: string): void {
  localStorage.setItem("orahai_token", token);
}

export function removeToken(): void {
  localStorage.removeItem("orahai_token");
}

export function signOut(): void {
  removeToken();
  window.location.href = "/";
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  username: string;
  avatarUrl: string | null;
}

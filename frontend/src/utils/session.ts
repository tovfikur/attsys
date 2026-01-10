export type AppUser = {
  id: number | string
  name?: string
  email?: string
  role?: string
}

export function getToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token')
}

export function getUser(): AppUser | null {
  const raw = localStorage.getItem('user') || sessionStorage.getItem('user')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearSession() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  sessionStorage.removeItem('token')
  sessionStorage.removeItem('user')
}


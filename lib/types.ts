export type Role = 'owner' | 'editor' | 'viewer'

export type UserSession = {
  id: string
  email: string
  name: string | null
}

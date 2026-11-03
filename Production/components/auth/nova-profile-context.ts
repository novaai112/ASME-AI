"use client"

import { createContext, useContext } from "react"

export interface NovaProfileControl {
  displayName: string
  email?: string
  avatarUrl?: string
  initials: string
  openProfile: () => void
}

export const NovaProfileContext = createContext<NovaProfileControl | null>(null)

export function useNovaProfileControl() {
  return useContext(NovaProfileContext)
}

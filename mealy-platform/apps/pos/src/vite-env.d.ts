/// <reference types="vite/client" />

interface Window {
  mealyDesktop?: {
    getRuntimeInfo: () => Promise<{ platform: string; online: boolean }>
  }
}

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const repositoryName = 'ghcp-aic-budget-simulator'

export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? `/${repositoryName}/` : '/',
})

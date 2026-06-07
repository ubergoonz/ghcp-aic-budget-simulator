import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const normalizeBasePath = (basePath: string) => {
  const trimmed = basePath.trim()

  if (!trimmed) {
    return '/'
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.endsWith('/')
    ? withLeadingSlash
    : `${withLeadingSlash}/`
}

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'ghcp-aic-budget-simulator'
const isUserOrOrgPagesRepo = repositoryName.endsWith('.github.io')
const computedPagesBase = isUserOrOrgPagesRepo ? '/' : `/${repositoryName}/`
const productionBase = normalizeBasePath(process.env.VITE_BASE_PATH ?? computedPagesBase)

export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? productionBase : '/',
})

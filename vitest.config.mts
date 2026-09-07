import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    // `.tsx` as well as `.ts`: `tests/unit/ui/field.test.tsx` renders a
    // component to static markup, which is the only way to assert on the
    // accessibility attributes `Field` puts on its control.
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
})

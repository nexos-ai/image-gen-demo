# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

nexos.ai Image Playground: an open-source, 100% client-side demo app for generating images with the nexos.ai Gateway API. No backend. The playground is the main page; the only dialog is the intro/API-key setup.

## Commands

- `pnpm dev`: start Vite dev server
- `pnpm build`: typecheck (`tsc -b`) then production build
- `pnpm lint`: ESLint
- `pnpm preview`: preview production build

## Tech Stack

- **Vite 7** + React 19
- **TypeScript 7** (native compiler) side by side with TypeScript 6. `@typescript/native` (`npm:typescript@^7`) provides `tsc`, used by `pnpm build`. The `typescript` package is aliased to `@typescript/typescript6` because typescript-eslint needs the TS 6 JavaScript API, which TS 7 does not have. Don't "fix" this alias.
- **TailwindCSS v4**: CSS-based config (no `tailwind.config.js`), via `@tailwindcss/vite`
- **shadcn/ui** with **Base UI** primitives (not Radix), `base-nova` style. Add components: `pnpm dlx shadcn@latest add <component>`
- **Dexie 4** + **dexie-react-hooks**: IndexedDB for the generated image history
- **Lucide React**: icons

## Path Aliases

`@/*` maps to `./src/*` (configured in both `vite.config.ts` and `tsconfig.app.json`; no `baseUrl`, which TS 7 removed).

## Structure

- `src/lib/nexos-api.ts`: **all** nexos.ai API code (models list, image generation, errors). It is the file developers new to nexos.ai read, so keep it self-contained and keep its comments thorough and current.
- `src/lib/prefs.ts`: localStorage preferences (API key, model, size). Keys are prefixed `image_playground_`.
- `src/lib/db.ts`, `src/lib/generations.ts`: history persistence and download helpers.
- `src/lib/color-mode.ts`: light/dark/system mode (the pre-paint script in `index.html` uses the same storage key).
- `src/components/Playground.tsx`: the main page. `ApiKeyDialog.tsx`: intro and key setup.

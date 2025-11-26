---
description: Use Bun for tooling, but keep runtime code Node-compatible.
globs: '*.ts, *.tsx, *.html, *.css, *.js, *.jsx, package.json'
alwaysApply: false
---

Use Bun for development commands, but keep all **runtime code** compatible with plain Node.js.  
Do **not** use Bun-specific runtime APIs in code that ships with the CLI.

## Commands

- Use `bun <file>` only for local development execution; shipped CLI must run with `node <file>`.
- Use `bun test` instead of `jest` or `vitest` (tests can rely on Bun).
- Use `bun build <file>` if bundling is needed during development.
- Use `bun install` instead of `npm install`, `yarn install`, or `pnpm install`.
- Use `bun run <script>` instead of `npm run <script>` or `yarn run <script>`.
- Bun automatically loads `.env` in development. Do **not** rely on this behavior in the published CLI.

## Runtime APIs

Runtime code must remain portable between Node.js and Bun:

- **Do not use Bun-only APIs**, including:
  - ❌ `Bun.serve()`
  - ❌ `bun:sqlite`
  - ❌ `Bun.redis`
  - ❌ `Bun.sql`
  - ❌ `Bun.file`
  - ❌ `Bun.$\`command\``
- **Use Node-compatible APIs** for everything that ships:
  - `node:fs`, `node:path`, `node:process`, etc.
  - Cross-runtime libraries for HTTP, DB access, CLI helpers, etc.
- WebSocket usage must be via a Node-compatible library (not Bun’s built-in WebSocket).

## Testing

Use Bun’s test runner:

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```

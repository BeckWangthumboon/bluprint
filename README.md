# Bluprint CLI

Bluprint is a TypeScript CLI that evaluates feature branches against a spec and architecture rules.

## Prerequisites

- Bun installed (`curl -fsSL https://bun.sh/install | bash`) or via your package manager.
- Git available on PATH.
- Node-compatible environment (bun or node)

## Setup

1. Install dependencies:
   ```bash
   bun install
   ```
2. Configure LLM provider (see [LLM Provider Configuration](#llm-provider-configuration) below)
3. (Optional) Run the test suite to verify your setup:
   ```bash
   bun run test
   ```

## LLM Provider Configuration

Bluprint supports multiple LLM providers. Set the `PROVIDER` environment variable to choose one:

### OpenRouter (default)
```bash
export PROVIDER=openrouter  
export OPENROUTER_API_KEY=your_api_key_here
```

### ZAI
```bash
export PROVIDER=zai
export ZAI_API_KEY=your_api_key_here
```

### Google Vertex AI
```bash
export PROVIDER=vertex
export GOOGLE_APPLICATION_CREDENTIALS=./google-cloud-creds.json
```

**Setting up Google Vertex AI:**
1. Download a service account JSON key from [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts)
2. Place it at the repository root as `google-cloud-creds.json` (this file is git-ignored)
3. Ensure the service account has Vertex AI API permissions enabled
4. Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable to point to the file

## Usage

- Help:
  ```bash
  bun src/index.ts --help
  ```
- Initialize Bluprint in a repo:
  ```bash
  bluprint init --spec ./feature-spec.yaml --base main
  ```
- Full command details live in `usage.md`.

## Development Notes

- Commands use safe wrappers in `src/lib/` and neverthrow Results; errors are presented via `displayError` with deterministic exit codes.
- Tests use Vitest; integration tests spin up temporary git repos and require git on PATH.

## Documentation

- `usage.md` – command behaviors and examples.
- `architecture.md` – source layout and responsibilities.
- `errors.md` – error model and exit mapping.
- `docs/workspace.md` – `.bluprint` config schema and path expectations.
- `docs/testing.md` – how to run tests and coverage notes.
- `.agents/` – agent rules

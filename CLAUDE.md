# Bluprint CLI (Agent Overview)

Bluprint is a TypeScript CLI that evaluates a feature branch against a feature spec and global architecture rules. It runs checks on changed files, then produces a builder-ready prompt summarizing what to fix. The CLI does not write code—LLM is only used as a judge and prompt writer.

For all coding-agent rules and operational policies, see `docs/rules/rules.md`.

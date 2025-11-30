# Bluprint CLI (Agent Overview)

Bluprint is a TypeScript CLI that evaluates a feature branch against a feature spec and global architecture rules. It runs checks on changed files, then produces a builder-ready prompt summarizing what to fix. The CLI does not write code—LLM is only used as a judge and prompt writer.

**REQUIRED READING FOR AI AGENTS**: You MUST read and follow all rules in `.agent/global.md` before making any code changes or decisions. This file contains mandatory coding-agent rules and operational policies that govern all development work in this codebase.

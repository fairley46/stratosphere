# Contributing

## Development Setup

```bash
npm install
npm run build
npm run test
```

## Commit Guidelines

- Keep changes scoped to Stratosphere only.
- Include tests for any behavior change in `packages/engine`.
- Keep generated artifacts out of git.

## Pull Requests

- Link the feature or issue being addressed.
- Include test evidence (`npm run test` output).
- For migration behavior changes, include a before/after example from `fixtures/stratosphere`.

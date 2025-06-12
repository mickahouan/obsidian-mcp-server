# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.1] - 2025-06-12

### Added

- **OAuth 2.1 Authentication**: Introduced support for OAuth 2.1 bearer token validation. This includes a new `oauthMiddleware.ts` that validates JWTs against a remote JWKS, along with new configuration options (`MCP_AUTH_MODE`, `OAUTH_ISSUER_URL`, `OAUTH_AUDIENCE`).
- **Authentication Context & Scopes**: Added `authContext.ts` using `AsyncLocalStorage` to make authentication details available throughout the request lifecycle. Implemented `authUtils.ts` with `withRequiredScopes` for fine-grained, scope-based authorization on tools and resources.
- **New Dependencies**: Added the `jose` library for robust JWT/JWS handling required for the OAuth implementation.
- **Session Garbage Collection**: Implemented a session garbage collector in `httpTransport.ts` to automatically clean up stale or inactive client sessions, improving server stability.
- **New Documentation**: Added `docs/obsidian_tools_phase2.md` to outline potential future tool developments.

### Changed

- **Authentication System Refactor**: The entire authentication layer in the HTTP transport has been refactored. It now supports both the original secret key-based JWTs and the new OAuth 2.1 flow, determined by the `MCP_AUTH_MODE` environment variable.
- **Obsidian API Utilities**: Refactored shared logic by moving the `RequestFunction` type to a central `types.ts` and extracting `encodeVaultPath` into a dedicated `obsidianApiUtils.ts` for better code organization.
- **Dependency Updates**: Updated key dependencies to their latest versions, including `@hono/node-server`, `openai`, and `zod`.
- **Logging Enhancements**: The logger in `logger.ts` now correctly handles `bigint` serialization in log metadata.
- **Code Cleanup**: General code cleanup and minor refactoring across various files for improved readability and maintainability.

## [2.0.0] - 2025-06-09

### Changed

- **Project Renamed & Refocused**: Project officially transitioned from `mcp-ts-template` to `obsidian-mcp-server`. The primary focus is now providing MCP tools for Obsidian vault interaction.
- **Extensive Refactoring**: Major refactoring across the codebase to align with the new project scope, including updates to server logic, tool implementations, configuration, and utility functions.
- **Updated Dependencies**: All dependencies have been updated to their latest versions as of May 2025, including `@modelcontextprotocol/sdk` to `^1.12.0`, `zod` to `^3.25.34`, `typescript` to `^5.8.3`, and many others. See `package-lock.json` for full details.
- **Enhanced Path Sanitization**: Improved `src/utils/security/sanitization.ts` with clearer `PathSanitizeOptions`, `SanitizedPathInfo` return type, better handling of absolute/relative paths, and strengthened traversal detection.
- **Configuration Updates**:
  - `LOGS_PATH` environment variable added to allow custom log directory specification.
  - `MCP_HTTP_PORT` default changed to `3010`.
  - Improved startup logging for configuration and logger initialization.
- **Script Enhancements**:
  - `scripts/clean.ts`: Improved logging and error reporting.
  - `scripts/fetch-openapi-spec.ts`: Made more robust with fallback URL logic, better parsing, and security checks for output paths.
  - `scripts/make-executable.ts`: Enhanced logging and security checks for output paths.
  - `scripts/tree.ts`: Improved ignore logic using the `ignore` package, better path handling, and security checks.
- **Documentation**:
  - `README.md`: Overhauled to reflect the `obsidian-mcp-server` project, its features, installation, configuration, and usage. Added new `LOGS_PATH` to config table and `npm run format`, `npm run docs:generate` to development scripts.
  - `docs/tree.md`: Regenerated to reflect current project structure.
  - `typedoc.json`: Updated entry points for API documentation generation.
- **Obsidian Local REST API Spec**: Updated `docs/obsidian-api/obsidian_rest_api_spec.json` and `docs/obsidian-api/obsidian_rest_api_spec.yaml` to the latest version.
- **Build Process**: Added `npm run format` script using Prettier. Updated `docs:generate` script to use `tsconfig.typedoc.json`.
- **Internal Logging & Error Handling**: Refined logging contexts and error reporting throughout the application for better traceability and debugging. `ErrorHandler.handleError` now consolidates context more effectively. `logger.ts` has improved console transport configuration and initialization logging.
- **HTTP Transport**: Migrated from Express to Hono for the HTTP transport (`httpTransport.ts`), resulting in a more modern, lightweight, and performant server. This includes a complete rewrite of the authentication middleware (`authMiddleware.ts`) and request handlers to align with Hono's context-based approach.
- **Vault Cache Service**: Relocated the `VaultCacheService` from `src/services/vaultCache/` to `src/services/obsidianRestAPI/vaultCache/` to better group it with the Obsidian-related services it depends on.
- **Tool Logic**: Minor improvements to logging and context handling in various tool logic files (e.g., `obsidianGlobalSearchTool`, `obsidianReadFileTool`).
- **Vault Cache Optimization**: The `VaultCacheService` has been significantly refactored to improve performance and efficiency. Instead of rebuilding the entire cache from scratch, it now performs incremental updates. It fetches a list of all files and compares their modification times (`mtime`) against the cached versions. Content is only re-fetched for files that are new or have been modified, drastically reducing the number of API calls to the Obsidian vault during a refresh. The service now also supports periodic refreshing.

### Added

- `.ncurc.json` for `npm-check-updates` configuration.
- `.github/workflows/publish.yml` for potential future automated publishing.
- `tsconfig.typedoc.json` for TypeDoc specific TypeScript configuration.

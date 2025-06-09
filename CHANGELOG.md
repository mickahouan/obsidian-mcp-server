# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-05-28

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

### Added

- `.ncurc.json` for `npm-check-updates` configuration.
- `.github/workflows/publish.yml` for potential future automated publishing.
- `tsconfig.typedoc.json` for TypeDoc specific TypeScript configuration.

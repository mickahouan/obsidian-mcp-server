/**
 * @fileoverview Barrel file for the auth module.
 * Exports core utilities and middleware strategies for easier imports.
 * @module src/mcp-server/transports/auth/index
 */

export { authContext } from "./core/authContext";
export { withRequiredScopes } from "./core/authUtils";
export type { AuthInfo } from "./core/authTypes";

export { mcpAuthMiddleware as jwtAuthMiddleware } from "./strategies/jwt/jwtMiddleware";
export { oauthMiddleware } from "./strategies/oauth/oauthMiddleware";

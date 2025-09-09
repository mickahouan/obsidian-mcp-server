/**
 * @module ObsidianRestApiService Barrel File
 * @description
 * Exports the singleton instance of the Obsidian REST API service and related types.
 */

export * from "./types"; // Export all types
// Removed singleton export
export { ObsidianRestApiService } from "./service"; // Export the class itself
// Export method modules if direct access is desired, though typically accessed via service instance
export * as activeFileMethods from "./methods/activeFileMethods";
export * as commandMethods from "./methods/commandMethods";
export * as openMethods from "./methods/openMethods";
export * as patchMethods from "./methods/patchMethods";
export * as periodicNoteMethods from "./methods/periodicNoteMethods";
export * as searchMethods from "./methods/searchMethods";
export * as vaultMethods from "./methods/vaultMethods";
export { VaultCacheService } from "./vaultCache/index";

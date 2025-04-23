/**
 * Property manager for Obsidian notes
 */
import { EOL } from 'os';
import { parse, stringify } from 'yaml';
import { ObsidianClient } from '../../obsidian/client.js';
import { createLogger } from '../../utils/logging.js';
import {
  ObsidianProperties,
  ObsidianPropertiesSchema,
  PropertyManagerResult,
  PropertyUpdateSchema,
  ValidationResult
} from './types.js';

// Create a logger for property operations
const logger = createLogger('PropertyManager');

/**
 * Simple deep merge function for plain objects and arrays.
 * Merges 'source' into 'target'. Modifies 'target' in place.
 */
function deepMerge(target: any, source: any): any {
  if (typeof target !== 'object' || target === null || typeof source !== 'object' || source === null) {
    return source; // Overwrite if not both are mergeable objects
  }

  for (const key in source) {
    // eslint-disable-next-line no-prototype-builtins
    if (source.hasOwnProperty(key)) {
      const targetValue = target[key];
      const sourceValue = source[key];

      if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
        // For arrays, concatenate and remove duplicates for simple arrays,
        // otherwise, replace (could be enhanced for object arrays if needed)
        target[key] = [...new Set([...targetValue, ...sourceValue])];
      } else if (typeof targetValue === 'object' && targetValue !== null && typeof sourceValue === 'object' && sourceValue !== null) {
        // Recursively merge nested objects
        deepMerge(targetValue, sourceValue);
      } else {
        // Overwrite primitive values or if types mismatch
        target[key] = sourceValue;
      }
    }
  }
  return target;
}


/**
 * Result type for parseProperties, including match details
 */
interface ParseResult {
  properties: ObsidianProperties;
  match?: {
    startIndex: number;
    endIndex: number;
    rawFrontmatter: string; // The raw YAML string
  };
  error?: Error; // Include error if parsing/validation failed
}


/**
 * Manages YAML frontmatter properties in Obsidian notes
 */
export class PropertyManager {
  constructor(private client: ObsidianClient) {}

  /**
   * Parse YAML frontmatter from note content. Finds the *first* valid block.
   * @param content The note content
   * @returns ParseResult containing properties and match details or error.
   */
  parseProperties(content: string): ParseResult {
    try {
      // Regex to find the first frontmatter block (allows leading content)
      // It captures the content between the --- markers.
      const match = content.match(/(?:^|\r?\n)---\r?\n([\s\S]*?)\r?\n---/);

      if (!match) {
        logger.debug('No frontmatter found in content');
        return { properties: {} };
      }

      const frontmatterYaml = match[1];
      // Calculate accurate start/end indices of the *entire* matched block (including ---)
      const blockStartIndex = match.index ?? 0;
      const blockEndIndex = blockStartIndex + match[0].length;


      // Parse YAML first
      const rawProperties = parse(frontmatterYaml);

      // Validate the raw parsed object against the schema
      const validationResult = ObsidianPropertiesSchema.safeParse(rawProperties);

      if (!validationResult.success) {
        const error = new Error(`Frontmatter validation failed: ${validationResult.error.message}`);
        logger.warn(error.message, { validationError: validationResult.error.flatten() });
        // Return parsed (but invalid) data along with the error and match info
        return {
          properties: rawProperties as ObsidianProperties, // Cast, knowing it's invalid
          match: { startIndex: blockStartIndex, endIndex: blockEndIndex, rawFrontmatter: frontmatterYaml },
          error
        };
      }

      // Use the validated data from now on
      const validatedProperties = validationResult.data;

      // Handle tags transformation (remove '#') on validated data
      if (validatedProperties.tags && Array.isArray(validatedProperties.tags)) {
        validatedProperties.tags = validatedProperties.tags.map((tag: string) =>
          typeof tag === 'string' && tag.startsWith('#') ? tag.substring(1) : tag
        );
      }

      // Return the validated properties and match info
      return {
        properties: validatedProperties,
        match: { startIndex: blockStartIndex, endIndex: blockEndIndex, rawFrontmatter: frontmatterYaml }
      };
    } catch (error) {
      const parseError = error instanceof Error ? error : new Error(String(error));
      logger.error('Error parsing properties:', parseError);
      // Return error information
      return {
        properties: {},
        error: parseError
      };
    }
  }

  /**
   * Generate YAML frontmatter from properties
   * @param properties The properties to convert to YAML
   * @returns YAML frontmatter string
   */
  generateProperties(properties: Partial<ObsidianProperties>): string {
    try {
      // Create a deep copy to avoid modifying the original object
      const propsToGenerate = JSON.parse(JSON.stringify(properties));

      // Add '#' prefix back to tags before stringifying
      if (propsToGenerate.tags && Array.isArray(propsToGenerate.tags)) {
        propsToGenerate.tags = propsToGenerate.tags.map((tag: string) =>
          typeof tag === 'string' && !tag.startsWith('#') ? `#${tag}` : tag
        );
      }

      // Remove undefined values explicitly (shouldn't be necessary with JSON.stringify/parse but safe)
      const cleanProperties = Object.fromEntries(
        Object.entries(propsToGenerate).filter(([_, v]) => v !== undefined)
      );

      // Generate YAML with platform-specific line endings
      const yaml = stringify(cleanProperties);
      // Ensure consistent EOL for the markers and the content
      return `---${EOL}${yaml.trimEnd()}${EOL}---`; // Return block without trailing EOL initially
    } catch (error) {
      logger.error('Error generating properties:', error instanceof Error ? error : { error: String(error) });
      // Re-throw to be caught by the caller
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  /**
   * Validate property values against schema
   * @param properties The properties to validate
   * @returns Validation result
   */
  validateProperties(properties: Partial<ObsidianProperties>): ValidationResult {
    const result = PropertyUpdateSchema.safeParse(properties);

    if (result.success) {
      return { valid: true, errors: [] };
    }

    return {
      valid: false,
      errors: result.error.errors.map(err =>
        `${err.path.join('.')}: ${err.message}`
      )
    };
  }

  /**
   * Merge new properties with existing ones
   * @param existing The existing properties
   * @param updates The new properties to merge
   * @param replace Whether to replace arrays instead of merging them
   * @returns The merged properties
   */
  mergeProperties(
    existing: ObsidianProperties,
    updates: Partial<ObsidianProperties>,
    replace: boolean = false
  ): ObsidianProperties {
    // Start with a deep copy of existing properties to avoid modifying the original
    const merged = JSON.parse(JSON.stringify(existing));

    for (const [key, value] of Object.entries(updates)) {
      // Skip undefined values and timestamp fields (created is handled separately)
      if (value === undefined || key === 'modified') continue;

      const currentValue = merged[key as keyof ObsidianProperties];

      // Handle arrays based on replace flag
      if (Array.isArray(value) && Array.isArray(currentValue)) {
        merged[key as keyof ObsidianProperties] = replace ?
          value : // Replace array
          [...new Set([...currentValue, ...value])] as any; // Merge unique elements
      }
      // Special handling for custom object - use deep merge
      else if (key === 'custom' && typeof value === 'object' && value !== null && typeof currentValue === 'object' && currentValue !== null) {
        // Ensure target 'custom' exists before merging into it
         if (!merged.custom) merged.custom = {};
        merged.custom = deepMerge(merged.custom, value); // Deep merge 'custom'
      }
      // Default case - replace value
      else {
        merged[key as keyof ObsidianProperties] = value as any;
      }
    }

    // Handle 'created' timestamp: preserve existing or set if new
    merged.created = existing.created ?? new Date().toISOString();
    // Always update 'modified' timestamp
    merged.modified = new Date().toISOString();

    // Remove properties that are explicitly set to null in the update
    for (const [key, value] of Object.entries(updates)) {
        if (value === null) {
            delete merged[key as keyof ObsidianProperties];
        }
    }


    return merged;
  }

  /**
   * Get properties from a note
   * @param filepath Path to the note
   * @returns The result including properties or errors
   */
  async getProperties(filepath: string): Promise<PropertyManagerResult> {
    try {
      logger.debug(`Getting properties from file: ${filepath}`);
      const content = await this.client.getFileContents(filepath);
      const parseResult = this.parseProperties(content);

      // Handle parsing/validation errors reported by parseProperties
      if (parseResult.error) {
        // If validation failed but we have a match, still return the raw (invalid) props?
        // For getProperties, it's better to report failure clearly.
        return {
          success: false,
          message: `Failed to parse or validate properties: ${parseResult.error.message}`,
          errors: [parseResult.error.message]
        };
      }

      return {
        success: true,
        message: 'Properties retrieved successfully',
        properties: parseResult.properties
      };
    } catch (error) {
      // Catch errors from getFileContents or other unexpected issues
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to get properties from ${filepath}:`, err);
      return {
        success: false,
        message: `Failed to get properties: ${err.message}`,
        errors: [err.message]
      };
    }
  }

  /**
   * Update properties of a note
   * @param filepath Path to the note
   * @param newProperties The new properties to apply
   * @param replace Whether to replace arrays instead of merging them
   * @returns The result of the update operation
   */
  async updateProperties(
    filepath: string,
    newProperties: Partial<ObsidianProperties>,
    replace: boolean = false
  ): Promise<PropertyManagerResult> {
    try {
      // Validate new properties first
      const validation = this.validateProperties(newProperties);
      if (!validation.valid) {
        logger.warn(`Invalid properties provided for update in ${filepath}:`, { errors: validation.errors });
        return {
          success: false,
          message: 'Invalid properties provided for update',
          errors: validation.errors
        };
      }

      // Get existing content and parse properties
      logger.debug(`Updating properties for file: ${filepath}`);
      const content = await this.client.getFileContents(filepath);
      const parseResult = this.parseProperties(content);

      // Handle parsing/validation errors from existing frontmatter *before* merging
      if (parseResult.error) {
        logger.warn(`Could not parse existing frontmatter in ${filepath}, but proceeding with update: ${parseResult.error.message}`);
        // We proceed, merging with potentially empty or invalid existing properties.
        // The new valid frontmatter will overwrite the old invalid one.
      }

      // Merge properties
      const mergedProperties = this.mergeProperties(parseResult.properties, newProperties, replace);

      // Generate new frontmatter YAML string
      const newFrontmatterBlock = this.generateProperties(mergedProperties);

      let updatedContent: string;
      const bodyContentStartIndex = parseResult.match ? parseResult.match.endIndex : 0;
      let bodyContent = content.substring(bodyContentStartIndex);

      // Ensure body content starts with a newline if it's not empty
      if (bodyContent.length > 0 && !bodyContent.startsWith('\n') && !bodyContent.startsWith('\r\n')) {
          bodyContent = EOL + bodyContent;
      } else if (bodyContent.length === 0 && content.length > 0 && parseResult.match) {
          // If there was frontmatter but no body, ensure a newline after new frontmatter
          bodyContent = EOL;
      }


      if (parseResult.match) {
        // Replace the existing block accurately using start/end indices
        updatedContent =
          content.substring(0, parseResult.match.startIndex) + // Content before frontmatter
          newFrontmatterBlock + // New frontmatter
          bodyContent; // Content after frontmatter (with adjusted leading newline)
      } else {
        // No frontmatter found, prepend the new block
        updatedContent = newFrontmatterBlock + bodyContent;
      }

      // Update file content via client
      // Trim trailing whitespace from the final content before saving
      await this.client.updateContent(filepath, updatedContent.trimEnd() + EOL);
      logger.debug(`Successfully updated properties for ${filepath}`);

      return {
        success: true,
        message: 'Properties updated successfully',
        properties: mergedProperties // Return the final merged properties
      };
    } catch (error) {
      // Catch errors from getFileContents, generateProperties, updateContent, etc.
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to update properties for ${filepath}:`, err);
      return {
        success: false,
        message: `Failed to update properties: ${err.message}`,
        errors: [err.message]
      };
    }
  }
}

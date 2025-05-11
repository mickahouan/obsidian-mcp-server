// src/utils/internal/asyncUtils.ts
import { McpError, BaseErrorCode } from '../../types-global/errors.js';
import { logger } from './logger.js';
import { RequestContext } from './requestContext.js';

/**
 * Configuration for the retryWithDelay function.
 */
export interface RetryConfig<T> {
  operationName: string;
  context: RequestContext;
  maxRetries: number;
  delayMs: number;
  /** Optional function to determine if a retry should occur based on the error. */
  shouldRetry?: (error: unknown) => boolean;
  /** Optional function to execute before each retry attempt (e.g., for logging). */
  onRetry?: (attempt: number, error: unknown) => void;
}

/**
 * Executes an asynchronous operation with a retry mechanism.
 *
 * @template T The expected return type of the operation.
 * @param {() => Promise<T>} operation - The asynchronous function to execute.
 * @param {RetryConfig<T>} config - Configuration for the retry behavior.
 * @returns {Promise<T>} A promise that resolves with the result of the operation if successful.
 * @throws {McpError} Throws an McpError if the operation fails after all retries, or if an unexpected error occurs.
 */
export async function retryWithDelay<T>(
  operation: () => Promise<T>,
  config: RetryConfig<T>
): Promise<T> {
  const {
    operationName,
    context,
    maxRetries,
    delayMs,
    shouldRetry = () => true, // Default: retry on any error
    onRetry,
  } = config;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryContext = { ...context, operation: operationName, attempt, maxRetries };

      if (attempt < maxRetries && shouldRetry(error)) {
        if (onRetry) {
          onRetry(attempt, error);
        } else {
          const errorMsg = error instanceof Error ? error.message : String(error);
          logger.warning(
            `Operation '${operationName}' failed on attempt ${attempt}/${maxRetries}. Error: ${errorMsg}. Retrying in ${delayMs}ms...`,
            retryContext
          );
        }
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } else {
        // Max retries reached or shouldRetry returned false
        const finalErrorMsg = `Operation '${operationName}' failed after ${attempt} attempt(s).`;
        logger.error(finalErrorMsg, error instanceof Error ? error : undefined, retryContext);
        if (error instanceof McpError) {
          throw error; // Re-throw original McpError
        }
        throw new McpError(
          BaseErrorCode.SERVICE_UNAVAILABLE, // Or a more specific code if determinable
          `${finalErrorMsg} Last error: ${error instanceof Error ? error.message : String(error)}`,
          { ...retryContext, originalError: error instanceof Error ? { message: error.message, stack: error.stack } : String(error) }
        );
      }
    }
  }
  // This part should ideally not be reached if logic is correct,
  // but as a fallback, throw based on the last error.
  throw new McpError(
    BaseErrorCode.INTERNAL_ERROR,
    `Operation '${operationName}' failed unexpectedly after all retries. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    { ...context, originalError: lastError instanceof Error ? { message: lastError.message, stack: lastError.stack } : String(lastError) }
  );
}

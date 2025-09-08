/**
 * @module SearchMethods
 * @description
 * Methods for performing searches via the Obsidian REST API.
 */

import { RequestContext } from "../../../utils/index.js";
import {
  SimpleSearchResult,
  ComplexSearchResult,
  RequestFunction,
  SmartSearchArgs,
  SmartSearchResponse,
} from "../types.js";

/**
 * Performs a simple text search across the vault.
 * @param _request - The internal request function from the service instance.
 * @param query - The text query string.
 * @param contextLength - Number of characters surrounding each match (default 100).
 * @param context - Request context.
 * @returns An array of search results.
 */
export async function searchSimple(
  _request: RequestFunction,
  query: string,
  contextLength: number = 100,
  context: RequestContext,
): Promise<SimpleSearchResult[]> {
  return _request<SimpleSearchResult[]>(
    {
      method: "POST",
      url: "/search/simple/",
      params: { query, contextLength }, // Send as query parameters
    },
    context,
    "searchSimple",
  );
}

/**
 * Performs a complex search using Dataview DQL or JsonLogic.
 * @param _request - The internal request function from the service instance.
 * @param query - The query string (DQL) or JSON object (JsonLogic).
 * @param contentType - The content type header indicating the query format.
 * @param context - Request context.
 * @returns An array of search results.
 */
export async function searchComplex(
  _request: RequestFunction,
  query: string | object,
  contentType:
    | "application/vnd.olrapi.dataview.dql+txt"
    | "application/vnd.olrapi.jsonlogic+json",
  context: RequestContext,
): Promise<ComplexSearchResult[]> {
  return _request<ComplexSearchResult[]>(
    {
      method: "POST",
      url: "/search/",
      headers: { "Content-Type": contentType },
      data: query,
    },
    context,
    "searchComplex",
  );
}

/**
 * Performs a semantic smart search via the Smart Connections plugin.
 * @param _request - Internal request function from the service instance.
 * @param args - Search arguments.
 * @param context - Request context.
 * @returns Results from the smart search endpoint.
 */
export async function searchSmart(
  _request: RequestFunction,
  args: SmartSearchArgs,
  context: RequestContext,
): Promise<SmartSearchResponse> {
  return _request<SmartSearchResponse>(
    {
      method: "POST",
      url: "/search/smart/",
      data: args,
    },
    context,
    "searchSmart",
  );
}

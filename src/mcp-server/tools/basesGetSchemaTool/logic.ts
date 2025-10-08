/**
 * @fileoverview Logic for the `bases_get_schema` MCP tool.
 */

import { z } from "zod";
import { ObsidianRestApiService } from "../../../services/obsidianRestAPI/index.js";
import { BaseSchemaResponse } from "../../../services/obsidianRestAPI/types.js";
import {
  logger,
  RequestContext,
  requestContextService,
} from "../../../utils/index.js";

export const BasesGetSchemaInputSchema = z
  .object({
    base_id: z
      .string()
      .min(1)
      .describe("Identifiant (chemin) de la base, par ex. 'Content/plan.base'."),
  })
  .describe(
    "Récupère le schéma (propriétés, vues, formules) d'une base déclarée dans un fichier .base.",
  );

export type BasesGetSchemaInput = z.infer<typeof BasesGetSchemaInputSchema>;

export async function processBasesGetSchema(
  params: BasesGetSchemaInput,
  parentContext: RequestContext,
  obsidianService: ObsidianRestApiService,
): Promise<BaseSchemaResponse> {
  const context = requestContextService.createRequestContext({
    parentContext,
    operation: "BasesGetSchema",
    params,
  });
  logger.debug("Fetching Base schema via REST bridge", context);
  return obsidianService.getBaseSchema(params.base_id, context);
}

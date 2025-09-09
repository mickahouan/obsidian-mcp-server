import { smartSearch } from "../src/search/smartSearch.js";

const args = process.argv.slice(2);
function getArg(name: string) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const query = getArg("query");
const fromPath = getArg("fromPath");
const limit = Number(getArg("limit") || "10");
if (!(query || fromPath)) {
  console.error(
    'Usage: node --loader ts-node/esm scripts/try-smart-search.ts --query "..." | --fromPath "..."',
  );
  process.exit(2);
}
const res = await smartSearch({ query, fromPath, limit });
console.log(JSON.stringify(res, null, 2));

# Obsidian MCP Server

[![TypeScript](https://img.shields.io/badge/TypeScript-^5.8.3-blue.svg)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP%20SDK-^1.13.0-green.svg)](https://modelcontextprotocol.io/)
[![Version](https://img.shields.io/badge/Version-2.0.7-blue.svg)](./CHANGELOG.md)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub](https://img.shields.io/github/stars/cyanheads/obsidian-mcp-server?style=social)](https://github.com/cyanheads/obsidian-mcp-server)

> Compatibilité : Codex ≥ 0.45 • MCP Inspector • Claude Desktop

## ⚡ TL;DR — Quickstart (60s)

```bash
git clone https://github.com/cyanheads/obsidian-mcp-server.git
cd obsidian-mcp-server
npm i && npm run build
npm run inspect   # ouvre MCP Inspector
```

Dans MCP Inspector → **New STDIO session**

- Command : `node`
- Args : `dist/index.js`
- Env requis : `SMART_ENV_DIR=/mnt/f/OBSIDIAN/ÉLYSIA/.smart-env`, `ENABLE_QUERY_EMBEDDING=true`, `QUERY_EMBEDDER=xenova`, `QUERY_EMBEDDER_MODEL_HINT=bge-384`, `TRANSFORMERS_CACHE=/home/<user>/.cache/transformers`
- (Optionnel REST) `OBSIDIAN_BASE_URL=http://127.0.0.1:27123`, `OBSIDIAN_API_KEY=...`, `OBSIDIAN_VERIFY_SSL=false`

> 🔐 **Note SSL** : le plugin Obsidian REST utilise un certificat auto-signé. Pour éviter les erreurs locales, définissez `OBSIDIAN_VERIFY_SSL=false`. En production, configurez un certificat de confiance et repassez à `true`.

## 1) Pitch & scope

**Obsidian MCP Server** est un serveur [Model Context Protocol](https://modelcontextprotocol.io/) qui connecte vos agents IA et outils compatibles MCP à votre coffre Obsidian. Il combine les outils historiques (lecture, écriture, frontmatter, tags, recherche globale…) avec une **recherche sémantique locale** basée sur les embeddings Smart Connections, le tout utilisable depuis Codex, les IDE ou l'[MCP Inspector](https://github.com/modelcontextprotocol/inspector).

### Points forts

- Pilotage complet du coffre : lecture/écriture de notes, frontmatter, tags, suppression, recherche globale et canvas via l’API REST Obsidian.
- **Recherche sémantique** sur les embeddings `.smart-env` du plugin Smart Connections, avec encodage des requêtes par **Xenova/BGE-small (384d)** et snippets optionnels.
- Résolution automatique des chemins Windows → WSL pour garantir la lecture des snippets lorsque le coffre est sur un disque Windows.
- Transport STDIO prêt pour Codex ≥ 0.45, avec scripts d’inspection pour le débogage via MCP Inspector.

## 2) Prérequis

- **Node.js 18+** (recommandé : 20+).
- **Obsidian** avec le plugin **Smart Connections** (menu **Build index** pour générer les embeddings `.smart-env`).
- (Optionnel) Plugin **Obsidian Local REST API** pour activer les outils REST (lecture/écriture via HTTP).
- (Optionnel) **WSL** si le coffre est stocké sur un disque Windows (F:\, E:\, …).

## 3) Installation

```bash
git clone https://github.com/cyanheads/obsidian-mcp-server.git
cd obsidian-mcp-server
npm install
```

## 4) Build & scripts NPM

```json
{
  "scripts": {
    "build": "tsc && node --loader ts-node/esm scripts/make-executable.ts dist/index.js",
    "start:stdio": "node dist/index.js",
    "inspect": "DANGEROUSLY_OMIT_AUTH=true npx @modelcontextprotocol/inspector --open",
    "prewarm:xenova": "node -e \"import('@xenova/transformers').then(async({pipeline})=>{const e=await pipeline('feature-extraction','Xenova/bge-small-en-v1.5');await e('warmup');console.log('embedder ok')})\""
  }
}
```

- `npm run build` : compile `src/` → `dist/` et rend l’entrypoint exécutable.
- `npm run start:stdio` : lance le serveur MCP en STDIO.
- `npm run prewarm:xenova` : télécharge et initialise le modèle d’embedding (utile hors-ligne / pour réduire le cold start).
- `npm run inspect` : ouvre MCP Inspector en mode développement.

## 5) Configuration Codex (TOML)

Ajoutez ceci à `~/.codex/config.toml` (adaptez les chemins absolus).

```toml
[mcp_servers.obsidian-mcp-server-stdio]
type = "stdio"
command = "node"
args = ["/ABSOLUTE/PATH/obsidian-mcp-server/dist/index.js"]
tool_timeout_sec = 900

[mcp_servers.obsidian-mcp-server-stdio.env]
# === Smart Connections (.smart-env) ===
SMART_ENV_DIR = "/mnt/f/OBSIDIAN/ÉLYSIA/.smart-env"   # racine (sans /multi)
OBSIDIAN_VAULT = "/mnt/f/OBSIDIAN/ÉLYSIA"             # pour lire les snippets en WSL

# === Encodage requête (BGE small 384d - Xenova) ===
ENABLE_QUERY_EMBEDDING = "true"
QUERY_EMBEDDER = "xenova"
QUERY_EMBEDDER_MODEL_HINT = "bge-384"
TRANSFORMERS_CACHE = "/home/<user>/.cache/transformers"

# === Logs (optionnel) ===
MCP_LOG_LEVEL = "info"
```

> Pour activer aussi les outils REST Obsidian, ajoutez `OBSIDIAN_BASE_URL` et `OBSIDIAN_API_KEY`.

## 6) Outils MCP exposés

### 6.1 Recherche sémantique (Smart Connections)

- **Nom canonique** : `smart_semantic_search`
- **Alias** : `smart_search`, `smart-search`
- **Description** : recherche sémantique locale utilisant les embeddings Smart Connections. Encode la requête via Xenova/BGE-small (384d), applique une similarité cosinus, filtre par dossiers/tags, et renvoie les meilleures notes avec snippets optionnels.

#### Entrée (JSON Schema “Codex-friendly”)

```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string", "minLength": 2 },
    "top_k": { "type": "number", "minimum": 1, "maximum": 100, "default": 20 },
    "folders": { "type": "array", "items": { "type": "string" } },
    "tags": { "type": "array", "items": { "type": "string" } },
    "with_snippets": { "type": "boolean", "default": true }
  },
  "required": ["query"]
}
```

#### Sortie

```json
{
  "type": "object",
  "properties": {
    "model": { "type": "string" },
    "dim": { "type": "number" },
    "results": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "path": { "type": "string" },
          "score": { "type": "number" },
          "title": { "type": "string" },
          "snippet": { "type": "string" }
        },
        "required": ["path", "score"]
      }
    }
  },
  "required": ["results"]
}
```

#### Exemples d’appels (Codex – chat)

- Top-k rapide : `{"query":"mcp","top_k":5,"with_snippets":false}`
- Requête filtrée : `{"query":"canvas","top_k":10,"folders":["Notes/PKM","Nexus/"],"with_snippets":false}`

> Implémentation : chargement tolérant des fichiers `.ajson/.json/.jsonl/.ndjson`, cache mémoire avec TTL, résolveur de chemins Windows→WSL, encodeur Xenova sélectionné automatiquement selon `QUERY_EMBEDDER_MODEL_HINT` ou la dimension détectée (`384`, `768`, `1024`, etc.).

### 6.2 Autres outils REST Obsidian

> **Requiert `OBSIDIAN_BASE_URL` + `OBSIDIAN_API_KEY` actifs**.

| Outil | Description | Entrée (JSON) | Sortie |
| --- | --- | --- | --- |
| `obsidian_read_note` | Lit le contenu d’une note (markdown ou JSON) avec fallback insensible à la casse et stats optionnelles. | `{"filePath":"Note.md","format":"markdown","includeStat":false}` (`format`: `markdown` \| `json`). | `{"content":"...","stats":{...}}` ou `{"content":{...NoteJson...}}`. |
| `obsidian_update_note` | Opérations whole-file (`append`,`prepend`,`overwrite`) sur une note ciblée par chemin, note active ou note périodique. Création conditionnelle, retour de contenu possible. | `{"targetType":"filePath","targetIdentifier":"Notes/Log.md","modificationType":"wholeFile","wholeFileMode":"append","content":"...","createIfNeeded":true,"returnContent":false}` | `{"status":"success","message":"...","finalContent":"..."?}` |
| `obsidian_search_replace` | Recherche/remplacement dans une note avec options regex, casse, whole word et aperçu du diff. | `{"filePath":"Notes/Idea.md","searchPattern":"TODO","replaceWith":"✅","useRegex":false,"replaceAll":true}` | `{"replacements":3,"contentPreview":"..."}` |
| `obsidian_global_search` | Recherche texte ou regex sur tout le coffre, filtrable par chemin/date, avec pagination et fallback cache. | `{"query":"#project","useRegex":false,"maxResults":50,"pathFilter":"Projects/","modifiedAfter":"2024-01-01"}` | `{"results":[{"path":"...","matches":[...]},...]}` |
| `obsidian_list_notes` | Liste un dossier du coffre avec filtres d’extension/regex et représentation arborescente. | `{"root":"Notes","depth":2,"includeFiles":true,"includeDirectories":false,"extensionFilter":[".md"],"nameRegex":".*"}` | `{"tree":"- Notes\n  - Projects\n    - Idea.md"}` |
| `obsidian_manage_frontmatter` | Lecture/écriture/suppression de clés YAML sans réécrire tout le fichier. | `{"filePath":"Notes/Card.md","operation":"set","data":{"status":"draft"}}` (`operation`: `get` \| `set` \| `delete`). | Selon l’opération : frontmatter actuel, confirmation de mise à jour, ou clés supprimées. |
| `obsidian_manage_tags` | Ajout/suppression/lecture des tags (frontmatter et inline). | `{"filePath":"Notes/Idea.md","operation":"add","tags":["idea","mcp"]}` (`operation`: `add` \| `remove` \| `list`). | Liste mise à jour ou confirmation. |
| `obsidian_delete_note` | Supprime une note avec fallback insensible à la casse et confirmation explicite. | `{"filePath":"Archive/Old.md","requireConfirmation":true}` | `{"deleted":true,"path":"Archive/Old.md"}` |

> Consultez `src/mcp-server/tools/**/logic.ts` pour les schémas Zod détaillés et toutes les options (dates relatives, filtres avancés, etc.).

## 7) Démarrage avec MCP Inspector (debug)

```bash
npm run inspect
```

1. UI → **Connections → New STDIO session**.
2. Command : `node`, Args : `dist/index.js`.
3. Env : `SMART_ENV_DIR=...`, `OBSIDIAN_VAULT=...`, `ENABLE_QUERY_EMBEDDING=true`, `QUERY_EMBEDDER=xenova`, `QUERY_EMBEDDER_MODEL_HINT=bge-384`, `TRANSFORMERS_CACHE=...`, `OBSIDIAN_BASE_URL=...`, `OBSIDIAN_API_KEY=...` (si REST activé).
4. **Tools → List tools** puis tester `smart_semantic_search`.

> Astuce : certains clients gèrent mal `--env` en CLI. Préférez la saisie des variables directement dans l’UI Inspector.

## 8) Bonnes pratiques Codex (0.45)

- Transport recommandé : **STDIO** (`type = "stdio"`).
- Dans le chat, invoquez les outils sous la forme `obsidian-mcp-server-stdio/<tool_name>`.
- Préférez des schémas JSON simples (pas d’`integer`, pas d’unions `oneOf`). Racine toujours `type:"object"`.
- Augmentez `tool_timeout_sec` (ex. `900`) pour les opérations lourdes et exécutez `npm run prewarm:xenova` pour réduire la latence du premier appel.

## 9) Résolution de problèmes (FAQ)

| Problème | Diagnostic | Solution |
| --- | --- | --- |
| `tool not found` | Mauvais chemin ou build absent. | Recompiler (`npm run build`) et vérifier l’entrypoint `dist/index.js`. |
| `No embeddings found` | `SMART_ENV_DIR` mal renseigné ou index vide. | Pointer sur la racine `.smart-env` (sans `/multi`), relancer la génération Smart Connections. |
| Snippets en erreur | Coffre sur disque Windows sans mapping. | Définir `OBSIDIAN_VAULT`, laisser le resolver convertir `F:\` → `/mnt/f/...`, ou passer `with_snippets:false`.
| Démarrage lent | Téléchargement du modèle à la volée. | Précharger via `npm run prewarm:xenova` et définir `TRANSFORMERS_CACHE`. |
| Formats `.ajson` exotiques | JSON5/NDJSON non standard. | Le loader “anti-fragile” gère la plupart des variantes ; ouvrez un ticket si nécessaire avec un extrait. |

## 10) Roadmap

- Index ANN (HNSW) si > 50k vecteurs (intégration `hnswlib-node`).
- Auto-détection du modèle selon `model/dim` présents dans `.smart-env`.
- Fallback TF-IDF lorsque l’embedder est indisponible.
- Chaînes d’outils prêtes à l’emploi (ex : `semantic_search → read_note → backlinks → update_note`).

## 11) Licence & contributions

- Licence : [Apache 2.0](./LICENSE).
- Contributions bienvenues ! Respectez les conventions TypeScript/JSON Schema, ajoutez des tests via MCP Inspector, et documentez vos outils.

---

## Annexe – Tableau des variables d’environnement

| Variable | Obligatoire | Exemple | Rôle |
| --- | --- | --- | --- |
| `SMART_ENV_DIR` | Oui (si recherche sémantique) | `/mnt/f/OBSIDIAN/ÉLYSIA/.smart-env` | Racine des embeddings Smart Connections (sans `/multi`). |
| `OBSIDIAN_VAULT` | Recommandé | `/mnt/f/OBSIDIAN/ÉLYSIA` | Résolution absolue pour lire les snippets. |
| `ENABLE_QUERY_EMBEDDING` | Oui | `true` | Active l’encodage de la requête sémantique. |
| `QUERY_EMBEDDER` | Oui | `xenova` | Choix de l’embedder local. |
| `QUERY_EMBEDDER_MODEL_HINT` | Recommandé | `bge-384` | Alignement avec la dimension des vecteurs Smart Connections. |
| `TRANSFORMERS_CACHE` | Recommandé | `/home/<user>/.cache/transformers` | Cache des modèles Xenova (offline-friendly). |
| `OBSIDIAN_BASE_URL` | Optionnel | `http://127.0.0.1:27123` | Point de terminaison du plugin REST (requis pour les outils REST). |
| `OBSIDIAN_API_KEY` | Optionnel | `sk-...` | Clé API du plugin REST. |
| `OBSIDIAN_VERIFY_SSL` | Optionnel | `false` | Désactiver la vérification SSL pour les certificats auto-signés. |
| `OBSIDIAN_ENABLE_CACHE` | Optionnel | `true` | Active le cache en mémoire du coffre. |
| `SMART_ENV_CACHE_TTL_MS` | Optionnel | `60000` | TTL du cache embeddings en millisecondes. |
| `MCP_LOG_LEVEL` | Optionnel | `info` | Niveau de logs MCP. |
| `MCP_TRANSPORT_TYPE` | Optionnel | `stdio` | Transport MCP (`stdio` ou `http`). |

---

## Bloc “How-to” pour Codex

> **Exécuter une recherche et proposer des backlinks**
> 
> 1. Call `obsidian-mcp-server-stdio/smart_semantic_search` with: `{"query":"mcp","top_k":8,"with_snippets":false}`
> 2. For the **top 3 paths**, call the note-reading tool (see `tools/list` for exact name).
> 3. Propose **2 backlinks** per note (distinct targets in the vault) with **1 sentence of context**.
> 4. Return strict JSON:
> 
> ```json
> { "query":"mcp", "dim":384, "results":[ 
>   {"path":"...", "backlinks":[ 
>     {"target":"...", "anchor":"...", "context":"..."}, 
>     {"target":"...", "anchor":"...", "context":"..."} 
>   ]} 
> ] }
> ```


# Obsidian MCP Optimike

Serveur MCP unifié pour Obsidian permettant aux agents IA d'interagir avec votre coffre local. Il expose des outils via le protocole MCP et peut fonctionner en mode STDIO (par défaut, idéal pour Codex ou Claude CLI) ou via HTTP + SSE.

## Fonctionnalités

- Lecture et écriture de notes du vault via l'API REST locale ou en accès direct au fichier.
- Recherche texte classique et **recherche sémantique** avec fallback TF‑IDF lorsque les embeddings ne sont pas disponibles.
- Exécution de templates Obsidian avec substitution de variables `{{...}}`.
- Création de fichiers **.base** pour le plugin Bases (tables dynamiques) et de fichiers **.canvas** pour les canvases Obsidian.
- Autres utilitaires: vérification de santé, liste des modèles, etc.

## Installation

**Prérequis : Node.js 22.**

```bash
npm install -g obsidian-mcp-optimike
```

ou exécution directe sans installation:

```bash
npx -y obsidian-mcp-optimike --stdio
```

Binaire disponible pour Windows, macOS et Linux.

Pour exécuter depuis les sources, compilez puis lancez le fichier généré dans `dist/` :

```bash
npm run build
node dist/index.js --stdio
```

## Usage

### Mode STDIO

```bash
obsidian-mcp-optimike --stdio
```

### Mode HTTP

```bash
obsidian-mcp-optimike --port 27123
```

### Outils CLI principaux

- `read-file <chemin>`
- `write-file <chemin> --content "..."`
- `search <requête>`
- `smart-search --query <texte>` ou `smart-search --from-path <note.md>`
- `run-template <template> --vars '{"nom":"Bob"}'`
- `create-base --file Tasks.base --filters '["tag=task"]' --order '["note.status"]'`
- `create-canvas --name Graph --nodes '[{"type":"file","file":"A.md"},{"type":"file","file":"B.md"}]' --edges '[{"fromNode":"A","toNode":"B"}]'`

#### Exemples d'appels

```bash
smart-search {"query":"mcp","limit":10}
smart-search {"fromPath":"/mnt/f/.../Note.md","limit":10}
```

## Configuration

### Variables d'environnement

#### Plugin

- `OBSIDIAN_BASE_URL` : URL de l'API REST locale (défaut `http://127.0.0.1:27123`).
- `OBSIDIAN_API_KEY` : clé issue du plugin Local REST API.
- `PLUGIN_TIMEOUT_MS` : délai maximal d'attente des appels au plugin (ms).
- `PLUGIN_RETRIES` : nombre de tentatives en cas d'échec.

#### Embeddings

- `SMART_SEARCH_MODE` : `auto` (défaut, plugin ➜ files ➜ lexical), `plugin`, `files` ou `lexical`.
- `SMART_ENV_DIR` : chemin vers le dossier `.smart-env` de votre vault (ex. `/chemin/vers/vault/.smart-env`). En mode `files`, seule la recherche de notes similaires via `fromPath` est possible.
- `SMART_ENV_CACHE_TTL_MS` : durée de vie en cache des vecteurs `.ajson` (ms, défaut 60000).
- `SMART_ENV_CACHE_MAX` : limite maximale d'items chargés (0 = illimité).
- `SMART_CONNECTIONS_API` : URL du service Smart Connections si disponible.

#### Xenova

- `ENABLE_QUERY_EMBEDDING` : `true` pour encoder localement les requêtes.
- `QUERY_EMBEDDER` : `xenova` (valeur par défaut).
- `TRANSFORMERS_CACHE` : chemin optionnel du cache des modèles.
- `EMBED_MAX_CONCURRENCY` : nombre maximal d'encodages simultanés.
- `EMBED_TIMEOUT_MS` : délai maximal pour chaque encodage (ms).

L'outil `create-base` produit un YAML minimal centré sur `views:` et peut définir `properties` (objets de configuration comme `displayName`) et `formulas`.

## Sécurité & Confidentialité

Toutes les opérations se font en local. Aucune donnée n'est envoyée vers l'extérieur. La clé API n'est jamais journalisée.

## Développement

```bash
npm test
npm run build
```

Les contributions sont les bienvenues (licence MIT).

### Harness de test

```bash
# ENV requis dans le shell :
export SMART_ENV_DIR=/mnt/f/OBSIDIAN/ÉLYSIA/.smart-env
export SMART_SEARCH_MODE=files
export OBSIDIAN_BASE_URL=http://localhost:27123
export OBSIDIAN_API_KEY=<clé>

# 1) Vecteurs AJSON visibles ?
node --loader ts-node/esm scripts/print-smart-env.ts

# 2) Voisins (sémantique locale, pas d’encodeur)
node --loader ts-node/esm scripts/try-smart-search.ts --fromPath "Chemin/Note.md" --limit 10

# 3) Query (encodeur OFF -> lexical)
node --loader ts-node/esm scripts/try-smart-search.ts --query "diagnostic mcp obsidian" --limit 10

# 4) Activer encodeur 384‑d (xenova)
npm i -S onnxruntime-node # optionnel, accélère l'encodage
export ENABLE_QUERY_EMBEDDING=true
export QUERY_EMBEDDER=xenova
node --loader ts-node/esm scripts/try-smart-search.ts --query "diagnostic mcp obsidian" --limit 10
```

## Feuille de route

- Support amélioré des embeddings locaux
- Transport WebSocket
- Indexation incrémentale pour de grands vaults

## Remerciements

Basé sur les plugins communautaires Obsidian (Local REST API, Smart Connections) et des travaux open source associés.

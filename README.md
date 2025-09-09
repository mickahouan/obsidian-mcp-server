# Obsidian MCP Optimike

Serveur MCP unifié pour Obsidian permettant aux agents IA d'interagir avec votre coffre local. Il expose des outils via le protocole MCP et peut fonctionner en mode STDIO (par défaut, idéal pour Codex ou Claude CLI) ou via HTTP + SSE.

## Fonctionnalités

- Lecture et écriture de notes du vault via l'API REST locale ou en accès direct au fichier.
- Recherche texte classique et **recherche sémantique** avec fallback TF‑IDF lorsque les embeddings ne sont pas disponibles.
- Exécution de templates Obsidian avec substitution de variables `{{...}}`.
- Création de fichiers **.base** pour le plugin Bases (tables dynamiques) et de fichiers **.canvas** pour les canvases Obsidian.
- Autres utilitaires: vérification de santé, liste des modèles, etc.

## Installation

```bash
npm install -g obsidian-mcp-optimike
```

ou exécution directe sans installation:

```bash
npx -y obsidian-mcp-optimike --stdio
```

Binaire disponible pour Windows, macOS et Linux.

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

## Configuration

- **Clé API REST Obsidian** : exporter la variable `OBSIDIAN_API_KEY` issue du plugin Local REST API.
- **Chemin du vault** : détecté automatiquement, peut être surchargé via les paramètres du serveur.
  - **SMART_SEARCH_MODE** : `auto` (défaut, plugin ➜ files ➜ lexical), `plugin`, `files` ou `lexical`.
  - **SMART_CONNECTIONS_API** : URL du service Smart Connections si disponible.
  - **SMART_ENV_DIR** : chemin vers le dossier `.smart-env` (ex. `F:\\OBSIDIAN\\ÉLYSIA\\.smart-env` sous Windows ou `/mnt/f/OBSIDIAN/ÉLYSIA/.smart-env` sous WSL).
    En mode `files`, seule la recherche de notes similaires via `fromPath` est possible.
  - **ENABLE_QUERY_EMBEDDING** : `true` pour encoder localement les requêtes (modèle `TaylorAI/bge-micro-v2` via `@xenova/transformers`).
    Sans cette variable, la recherche textuelle utilise le fallback lexical TF‑IDF.
  - **QUERY_EMBEDDER** : `xenova` (valeur par défaut, inutile de la modifier pour l'instant).
  - **SMART_ENV_CACHE_TTL_MS** : durée de vie en cache des vecteurs `.ajson` (ms, défaut 60000).
  - **SMART_ENV_CACHE_MAX** : limite maximale d'items chargés (0 = illimité).
  - **TRANSFORMERS_CACHE** : chemin optionnel où seront mis en cache les modèles téléchargés lors de la première exécution.
- L'outil `create-base` produit un YAML minimal centré sur `views:` et peut définir `properties` (objets de configuration comme `displayName`) et `formulas`.
  Pour les détails complets de la syntaxe Bases, voir la documentation officielle :
  [views](https://help.obsidian.md/bases/views), [functions](https://help.obsidian.md/bases/functions), [syntax](https://help.obsidian.md/bases/syntax).

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

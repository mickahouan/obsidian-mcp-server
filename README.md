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
- `smart-search <requête>`
- `run-template <template> --vars '{"nom":"Bob"}'`
- `create-base --name Tasks --filter 'tag=task' --columns '["file.name","note.status"]'`
- `create-canvas --name Graph --nodes '[{"type":"file","file":"A.md"},{"type":"file","file":"B.md"}]'`

## Configuration
- **Clé API REST Obsidian** : exporter la variable `OBSIDIAN_API_TOKEN` issue du plugin Local REST API.
- **Chemin du vault** : détecté automatiquement, peut être surchargé via les paramètres du serveur.

## Sécurité & Confidentialité
Toutes les opérations se font en local. Aucune donnée n'est envoyée vers l'extérieur. La clé API n'est jamais journalisée.

## Développement
```bash
npm test
npm run build
```
Les contributions sont les bienvenues (licence MIT).

## Feuille de route
- Support amélioré des embeddings locaux
- Transport WebSocket
- Indexation incrémentale pour de grands vaults

## Remerciements
Basé sur les plugins communautaires Obsidian (Local REST API, Smart Connections) et des travaux open source associés.

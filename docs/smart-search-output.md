# Exemples de sorties Smart Search

Après `npm run build` :

## 1. `node dist/scripts/print-smart-env.js`

```
vecCount = 3
sample = [
  { path: 'Alpha.md', dim: 384 },
  { path: 'Beta.md', dim: 384 },
  { path: 'Gamma.md', dim: 384 }
]
```

## 2. `node dist/scripts/try-smart-search.js --fromPath "Alpha.md" --limit 10`

```
{
  "method": "files",
  "results": [
    { "path": "Beta.md", "score": 0.7391 },
    { "path": "Gamma.md", "score": 0.7356 }
  ]
}
```

La note ancre `Alpha.md` est absente des résultats.

## 3. `node dist/scripts/try-smart-search.js --query "diagnostic mcp obsidian" --limit 10`

```
{
  "method": "lexical",
  "results": []
}
```

_Comportement attendu_: `method` devrait valoir `files` avec l'encodeur `TaylorAI/bge-micro-v2` (xenova, ~384 dimensions). L'absence de modèle local a provoqué un repli lexical.

## 4. `SMART_SEARCH_MODE=plugin node dist/scripts/try-smart-search.js --query "mcp" --limit 5`

```
{
  "method": "lexical",
  "results": []
}
```

# obsidian-mcp-server - Directory Structure

Generated on: 2025-05-28 23:58:18

```
obsidian-mcp-server
├── .github
│   └── workflows
│       └── publish.yml
├── docs
│   ├── obsidian-api
│   │   ├── obsidian_rest_api_spec.json
│   │   └── obsidian_rest_api_spec.yaml
│   ├── obsidian_mcp_tools_spec.md
│   └── tree.md
├── examples
├── scripts
│   ├── clean.ts
│   ├── fetch-openapi-spec.ts
│   ├── make-executable.ts
│   └── tree.ts
├── src
│   ├── config
│   │   └── index.ts
│   ├── mcp-server
│   │   ├── tools
│   │   │   ├── obsidianDeleteFileTool
│   │   │   │   ├── index.ts
│   │   │   │   ├── logic.ts
│   │   │   │   └── registration.ts
│   │   │   ├── obsidianGlobalSearchTool
│   │   │   │   ├── index.ts
│   │   │   │   ├── logic.ts
│   │   │   │   └── registration.ts
│   │   │   ├── obsidianListFilesTool
│   │   │   │   ├── index.ts
│   │   │   │   ├── logic.ts
│   │   │   │   └── registration.ts
│   │   │   ├── obsidianReadFileTool
│   │   │   │   ├── index.ts
│   │   │   │   ├── logic.ts
│   │   │   │   └── registration.ts
│   │   │   ├── obsidianSearchReplaceTool
│   │   │   │   ├── index.ts
│   │   │   │   ├── logic.ts
│   │   │   │   └── registration.ts
│   │   │   └── obsidianUpdateFileTool
│   │   │       ├── index.ts
│   │   │       ├── logic.ts
│   │   │       └── registration.ts
│   │   ├── transports
│   │   │   ├── authentication
│   │   │   │   └── authMiddleware.ts
│   │   │   ├── httpTransport.ts
│   │   │   └── stdioTransport.ts
│   │   └── server.ts
│   ├── services
│   │   ├── obsidianRestAPI
│   │   │   ├── methods
│   │   │   │   ├── activeFileMethods.ts
│   │   │   │   ├── commandMethods.ts
│   │   │   │   ├── openMethods.ts
│   │   │   │   ├── patchMethods.ts
│   │   │   │   ├── periodicNoteMethods.ts
│   │   │   │   ├── searchMethods.ts
│   │   │   │   └── vaultMethods.ts
│   │   │   ├── index.ts
│   │   │   ├── service.ts
│   │   │   └── types.ts
│   │   └── vaultCache
│   │       ├── index.ts
│   │       └── service.ts
│   ├── types-global
│   │   └── errors.ts
│   ├── utils
│   │   ├── internal
│   │   │   ├── asyncUtils.ts
│   │   │   ├── errorHandler.ts
│   │   │   ├── index.ts
│   │   │   ├── logger.ts
│   │   │   └── requestContext.ts
│   │   ├── metrics
│   │   │   ├── index.ts
│   │   │   └── tokenCounter.ts
│   │   ├── obsidian
│   │   │   ├── index.ts
│   │   │   └── obsidianStatUtils.ts
│   │   ├── parsing
│   │   │   ├── dateParser.ts
│   │   │   ├── index.ts
│   │   │   └── jsonParser.ts
│   │   ├── security
│   │   │   ├── idGenerator.ts
│   │   │   ├── index.ts
│   │   │   ├── rateLimiter.ts
│   │   │   └── sanitization.ts
│   │   └── index.ts
│   └── index.ts
├── .clinerules
├── .gitignore
├── .ncurc.json
├── CHANGELOG.md
├── Dockerfile
├── env.json
├── LICENSE
├── mcp-client-config.example.json
├── mcp.json
├── package-lock.json
├── package.json
├── README.md
├── repomix.config.json
├── smithery.yaml
├── tsconfig.json
└── typedoc.json
```

_Note: This tree excludes files and directories matched by .gitignore and default patterns._

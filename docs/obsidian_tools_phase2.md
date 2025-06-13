#### 1. `obsidian_manage_frontmatter`

- **Purpose**: To read, add, update, or remove specific keys from a note's YAML frontmatter without having to parse and rewrite the entire file content.
- **Input Schema**:
  - `filePath`: `z.string()` - Path to the target note.
  - `operation`: `z.enum(['get', 'set', 'delete'])` - The action to perform.
  - `key`: `z.string()` - The frontmatter key to target (e.g., "status").
  - `value`: `z.any().optional()` - The value to set for the key (required for `set`).
- **Output**: `{ success: true, message: "...", value: ... }` (returns the value for 'get', or the updated frontmatter).
- **Why it's useful**: This is far more robust and reliable than using `search_replace` on the raw text of the frontmatter. An agent could manage a note's status, due date, or other metadata fields programmatically.

#### 2. `obsidian_manage_tags`

- **Purpose**: To add or remove tags from a note. The tool's logic would be smart enough to handle tags in both the frontmatter (`tags: [tag1, tag2]`) and inline (`#tag3`).
- **Input Schema**:
  - `filePath`: `z.string()` - Path to the target note.
  - `operation`: `z.enum(['add', 'remove', 'list'])` - The action to perform.
  - `tags`: `z.array(z.string())` - An array of tags to add or remove (without the '#').
- **Output**: `{ success: true, message: "...", currentTags: ["tag1", "tag2", "tag3"] }`
- **Why it's useful**: Provides a semantic way to categorize notes, which is a core Obsidian workflow. The agent could tag notes based on their content or as part of a larger task.

#### 3. `obsidian_dataview_query`

- **Purpose**: To execute a Dataview query (DQL) and return the structured results. This is the most powerful querying tool in the Obsidian ecosystem.
- **Input Schema**:
  - `query`: `z.string()` - The Dataview Query Language (DQL) string.
- **Output**: A JSON representation of the Dataview table or list result. `{ success: true, results: [{...}, {...}] }`
- **Why it's useful**: The agent could answer questions like:
  - "List all unfinished tasks from my project notes." (`TASK from #project WHERE !completed`)
  - "Show me all books I rated 5 stars." (`TABLE rating from #book WHERE rating = 5`)
  - "Find all meeting notes from the last 7 days." (`LIST from #meeting WHERE file.cday >= date(today) - dur(7 days)`)

This tool would be incredibly potent but requires the user to have the Dataview plugin installed. It would leverage the `searchComplex` method already in your `ObsidianRestApiService`.

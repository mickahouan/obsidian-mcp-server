process.env.OBSIDIAN_API_KEY = 'test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';

class MockServer { tool(_n,_d,_s,h){ this.handler = h; } }

describe('createBaseTool', () => {
  test('writes base file', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-'));
    const obsidian = {
      updateFileContent: (p, c) => fs.writeFile(path.join(dir, p), c, 'utf8')
    };
    const server = new MockServer();
    const { registerCreateBaseTool } = await import('../../dist/tools/createBaseTool.js');
    await registerCreateBaseTool(server, obsidian);
    await server.handler({ name: 'Tasks', filters: { tag: 'task' }, columns: ['file.name', 'note.status'], sort: 'note.status' }, {});
    const content = await fs.readFile(path.join(dir, 'Tasks.base'), 'utf8');
    const parsed = yaml.load(content);
    expect(parsed.filters.tag).toBe('task');
    expect(parsed.columns).toContain('note.status');
  });
});

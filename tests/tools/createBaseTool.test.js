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
    await server.handler(
      {
        filePath: 'Tasks.base',
        name: 'Tasks',
        filters: ['tag=task'],
        order: ['note.status'],
        viewType: 'table',
        properties: { status: { displayName: 'Status', default: 'todo' } },
        formulas: { isDone: 'status = "done"' },
      },
      {},
    );
    const content = await fs.readFile(path.join(dir, 'Tasks.base'), 'utf8');
    const parsed = yaml.load(content);
    expect(parsed.views[0].filters).toBe('tag=task');
    expect(parsed.views[0].order[0]).toBe('note.status');
    expect(parsed.properties.status.displayName).toBe('Status');
    expect(parsed.properties.status.default).toBe('todo');
    expect(parsed.formulas.isDone).toBe('status = "done"');
  });
});

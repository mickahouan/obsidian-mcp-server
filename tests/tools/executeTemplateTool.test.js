process.env.OBSIDIAN_API_KEY = 'test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

class MockServer {
  tool(_n,_d,_s,h){ this.handler = h; }
}

describe('executeTemplateTool', () => {
  test('fills placeholders', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-'));
    await fs.mkdir(path.join(dir, 'Templates'), { recursive: true });
    await fs.writeFile(path.join(dir, 'Templates', 'greet.md'), 'Hello {{name}}');
    const obsidian = {
      getFileContent: (p) => fs.readFile(path.join(dir, p), 'utf8'),
      updateFileContent: (p, c) => fs.writeFile(path.join(dir, p), c, 'utf8')
    };
    const server = new MockServer();
    const { registerExecuteTemplateTool } = await import('../../dist/tools/executeTemplateTool.js');
    await registerExecuteTemplateTool(server, obsidian);
    const res = await server.handler({ template: 'greet.md', variables: { name: 'World' } }, {});
    expect(res.content[0].json.content).toBe('Hello World');
  });

  test('throws when template missing', async () => {
    const obsidian = {
      getFileContent: () => { throw new Error('not found'); },
      updateFileContent: () => {}
    };
    const server = new MockServer();
    const { registerExecuteTemplateTool } = await import('../../dist/tools/executeTemplateTool.js');
    await registerExecuteTemplateTool(server, obsidian);
    await expect(server.handler({ template: 'missing' }, {})).rejects.toThrow('Template not found');
  });
});

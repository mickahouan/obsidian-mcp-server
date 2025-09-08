process.env.OBSIDIAN_API_KEY = 'test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

class MockServer { tool(_n,_d,_s,h){ this.handler = h; } }

describe('createCanvasTool', () => {
  test('writes canvas file', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-'));
    const obsidian = {
      updateFileContent: (p, c) => fs.writeFile(path.join(dir, p), c, 'utf8')
    };
    const server = new MockServer();
    const { registerCreateCanvasTool } = await import('../../dist/tools/createCanvasTool.js');
    await registerCreateCanvasTool(server, obsidian);
    await server.handler({
      name: 'Graph',
      nodes: [{ id: 'A', type: 'file', file: 'A.md' }, { id: 'B', type: 'file', file: 'B.md' }],
      edges: [{ from: 'A', to: 'B', label: 'relates' }]
    }, {});
    const content = await fs.readFile(path.join(dir, 'Graph.canvas'), 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.edges[0].from).toBe('A');
    expect(parsed.edges[0].to).toBe('B');
  });
});

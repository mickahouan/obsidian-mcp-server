import { rankDocumentsTFIDF } from '../../dist/services/search/tfidfFallback.js';

describe('rankDocumentsTFIDF', () => {
  test('returns most relevant doc', () => {
    const docs = [
      { path: 'a.md', text: 'hello world' },
      { path: 'b.md', text: 'another file' },
      { path: 'c.md', text: 'world of code' }
    ];
    const results = rankDocumentsTFIDF('hello', docs);
    expect(results[0].path).toBe('a.md');
  });
});

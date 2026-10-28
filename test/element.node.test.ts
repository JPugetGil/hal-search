// Node environment on purpose (no DOM globals): the SSR imports the library in Node,
// so importing element.ts / index.ts / cdn.ts must not touch HTMLElement, customElements, window or document.
import { describe, expect, it } from 'vitest';

describe('Node import safety', () => {
  it('runs without DOM globals', () => {
    expect(typeof HTMLElement).toBe('undefined');
    expect(typeof customElements).toBe('undefined');
    expect(typeof document).toBe('undefined');
  });

  it('imports the element module and defineHalSearchElement is a no-op', async () => {
    const mod = await import('../src/element');
    expect(() => mod.defineHalSearchElement()).not.toThrow();
    expect(mod.attributesToUrlParams({ getAttribute: (n: string) => (n === 'id-hal' ? 'jdupont' : null) }).toString()).toBe(
      'idHal=jdupont',
    );
  });

  it('observes exactly the attributes emitted by buildWebComponentSnippet', async () => {
    const { HAL_SEARCH_ATTRIBUTES, attributesToUrlParams } = await import('../src/element');
    const { WEB_COMPONENT_ATTRIBUTES } = await import('../src/embed');
    for (const [param, attr] of Object.entries(WEB_COMPONENT_ATTRIBUTES)) {
      expect(HAL_SEARCH_ATTRIBUTES).toContain(attr);
      const params = attributesToUrlParams({ getAttribute: (n: string) => (n === attr ? 'v' : null) });
      expect(params.get(param)).toBe('v');
    }
    const urlAttributes = HAL_SEARCH_ATTRIBUTES.filter((a) => !['heading-level', 'labels', 'api-base', 'structured-data'].includes(a));
    expect(urlAttributes.sort()).toEqual(Object.values(WEB_COMPONENT_ATTRIBUTES).sort());
  });

  it('feeds the shared URL parser', async () => {
    const { attributesToUrlParams } = await import('../src/element');
    const { parseUrlParams } = await import('../src/url-params');
    const attrs: Record<string, string> = { 'id-hal': 'jdupont', 'svg-title': 'My papers', lvl: '2', 'doc-types': 'ART,COMM', oa: '' };
    const state = parseUrlParams(attributesToUrlParams({ getAttribute: (n: string) => attrs[n] ?? null }));
    expect(state).toMatchObject({ query: { idHal: 'jdupont' }, title: 'My papers', lvl: 2, filters: { docTypes: ['ART', 'COMM'], openAccess: true } });
  });

  it('imports the main entry and the CDN entry', async () => {
    const index = await import('../src/index');
    expect(typeof index.HalSearch).toBe('function');
    expect(typeof index.defineHalSearchElement).toBe('function');
    const cdn = await import('../src/cdn');
    expect(cdn.HalSearch).toBe(index.HalSearch);
  });
});

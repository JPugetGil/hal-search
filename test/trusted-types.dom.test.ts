// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HalSearch } from '../src/HalSearch';
import { createStructuredDataScript, serializeJsonLd } from '../src/structured-data';
import { TRUSTED_TYPES_POLICY } from '../src/trusted-types';
import type { HalDoc } from '../src/types';

// Trusted Types are not implemented by happy-dom: a fake `window.trustedTypes` records what goes through it.

/** A trusted value as browsers make it: an object, not a string. */
class FakeTrusted {
  constructor(
    readonly kind: 'html' | 'script',
    readonly value: string,
  ) {}

  toString(): string {
    return this.value;
  }
}

interface FakeFactory {
  createPolicy: ReturnType<typeof vi.fn>;
}

const win = () => document.defaultView as unknown as { trustedTypes?: FakeFactory };

/** Installs a fake factory; `refuse` makes createPolicy throw like a page whose `trusted-types` excludes the name. */
function installTrustedTypes({ refuse = false } = {}): FakeFactory {
  const factory: FakeFactory = {
    createPolicy: vi.fn((name: string, rules: { createHTML: (s: string) => string; createScript: (s: string) => string }) => {
      if (refuse) throw new TypeError(`Policy "${name}" disallowed.`);
      return {
        createHTML: (input: string) => new FakeTrusted('html', rules.createHTML(input)),
        createScript: (input: string) => new FakeTrusted('script', rules.createScript(input)),
      };
    }),
  };
  win().trustedTypes = factory;
  return factory;
}

const innerHtml = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML') as PropertyDescriptor;

/**
 * Simulates `require-trusted-types-for 'script'` on innerHTML: a string throws a TypeError, a trusted value is
 * inserted (happy-dom parses its string). Returns the spy of the setter.
 */
function enforceTrustedHtml() {
  return vi.spyOn(Element.prototype, 'innerHTML', 'set').mockImplementation(function (this: Element, value: unknown) {
    if (typeof value === 'string' && value !== '') {
      throw new TypeError("Failed to set the 'innerHTML' property on 'Element': This document requires 'TrustedHTML' assignment.");
    }
    innerHtml.set?.call(this, String(value));
  });
}

afterEach(() => {
  delete win().trustedTypes;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

describe('createStructuredDataScript under Trusted Types', () => {
  const data = { '@type': 'ItemList', name: '</script><b>' };

  it('sets the script text through the hal-search policy, created once', () => {
    const factory = installTrustedTypes();
    const setText = vi.spyOn(HTMLScriptElement.prototype, 'text', 'set');

    const script = createStructuredDataScript(document, data);
    createStructuredDataScript(document, data);

    expect(factory.createPolicy).toHaveBeenCalledTimes(1);
    expect(factory.createPolicy.mock.calls[0][0]).toBe(TRUSTED_TYPES_POLICY);
    expect(setText).toHaveBeenCalledTimes(2);
    const value = setText.mock.calls[0][0] as unknown;
    expect(value).toBeInstanceOf(FakeTrusted);
    expect(value).toMatchObject({ kind: 'script', value: serializeJsonLd(data) });
    expect(script.type).toBe('application/ld+json');
    expect(script.textContent).toBe(serializeJsonLd(data));
  });

  it('falls back to a text node when the page refuses the policy (asked once)', () => {
    const factory = installTrustedTypes({ refuse: true });
    const setText = vi.spyOn(HTMLScriptElement.prototype, 'text', 'set');

    const script = createStructuredDataScript(document, data);
    createStructuredDataScript(document, data);

    expect(factory.createPolicy).toHaveBeenCalledTimes(1);
    expect(setText).not.toHaveBeenCalled();
    expect(script.childNodes).toHaveLength(1);
    expect(JSON.parse(script.textContent ?? '')).toEqual(data);
  });

  it('uses a text node without Trusted Types', () => {
    const setText = vi.spyOn(HTMLScriptElement.prototype, 'text', 'set');
    const script = createStructuredDataScript(document, data);
    expect(setText).not.toHaveBeenCalled();
    expect(script.textContent).toBe(serializeJsonLd(data));
  });
});

// ---------------------------------------------------------------------------
// Inline SVG (HalSearch output 'svg')
// ---------------------------------------------------------------------------

describe('HalSearch output svg under Trusted Types', () => {
  const docs: HalDoc[] = [{ docid: '1', uri_s: 'https://hal.science/hal-1', title_s: ['Graph versioning'], producedDateY_i: 2024 }];

  function setup(): HTMLElement {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ responseHeader: { status: 0 }, response: { numFound: 1, start: 0, docs } }))),
    );
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
  }

  it('inserts the SVG markup as TrustedHTML of the hal-search policy', async () => {
    const factory = installTrustedTypes();
    const el = setup();
    const setter = enforceTrustedHtml();
    const onError = vi.fn();
    await new HalSearch({ container: el, output: 'svg', injectStyles: false, onError }).search({ query: { idHal: 'x' } });

    expect(onError).not.toHaveBeenCalled();
    expect(factory.createPolicy).toHaveBeenCalledTimes(1);
    const values = setter.mock.calls.map(([value]) => value as unknown).filter((value) => value instanceof FakeTrusted);
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({ kind: 'html' });
    expect(String(values[0])).toMatch(/^<svg /);
    expect(el.querySelector('svg > title')?.textContent).toBe('Publications – 1 result');
  });

  it('shows a clear error, and calls onError, when the page refuses the policy', async () => {
    installTrustedTypes({ refuse: true });
    const el = setup();
    enforceTrustedHtml();
    const onError = vi.fn();
    const onResults = vi.fn();
    const result = await new HalSearch({ container: el, output: 'svg', injectStyles: false, onError, onResults }).search({
      query: { idHal: 'x' },
    });

    expect(result).toBeUndefined();
    expect(el.querySelector('svg')).toBeNull();
    expect(onResults).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    const message = (onError.mock.calls[0][0] as Error).message;
    expect(message).toContain('Trusted Types');
    expect(message).toContain(`"${TRUSTED_TYPES_POLICY}"`);
    expect(message).toContain("output 'html'");
    expect(el.querySelector('[role="alert"], .hal-error')?.textContent).toContain(message);
  });
});

// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStructuredDataScript, serializeJsonLd } from '../src/structured-data';
import { TRUSTED_TYPES_POLICY } from '../src/trusted-types';

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

afterEach(() => {
  delete win().trustedTypes;
  vi.restoreAllMocks();
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

// Entry of the CDN bundle (dist/hal-search.min.js, minified IIFE exposing the global `HalSearch`).
// Unlike the main entry, it has a side effect: it registers <hal-search>, so that
//   <script src="https://cdn.jsdelivr.net/npm/hal-search@0.5"></script>
//   <hal-search id-hal="jdupont"></hal-search>
// just works. Registration is a no-op outside the browser.
import { defineHalSearchElement } from './element';

export * from './index';

defineHalSearchElement();

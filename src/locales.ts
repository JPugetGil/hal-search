import type { HalDoc, Labels } from './types';
import { DOC_TYPE_LABELS } from './doctypes';

// Built-in languages. Adding one is a change to this file only: an entry in LOCALES (every Labels
// key, and a docTypes label for every DOC_TYPE_LABELS code; test/locales.test.ts checks both) and in
// SNIPPET_TITLES, plus HAL_DOMAIN_LANGUAGES when HAL translates its domains into it. It is then accepted
// by the `locale` option, the `lang` URL param (embed page, SVG service) and the `lang` attribute of
// <hal-search>. Numbers and plural forms come from Intl. (The SVG service's error messages are
// translated in ssr-app/src/render.ts; a language missing there falls back to English.)

/** Language used when no (or no supported) locale is given. */
export const DEFAULT_LOCALE = 'en';

// ---------------------------------------------------------------------------
// English
// ---------------------------------------------------------------------------

const EN: Labels = {
  loading: 'Loading…',
  empty: 'No results found.',
  error: 'Error: {message}',
  previous: 'Previous',
  next: 'Next',
  pageInfo: 'Page {page} of {pages}',
  resultCount: '{count} results',
  resultCountOne: '{count} result',
  pagination: 'Search results pages',
  openAccess: 'Open Access',
  abstract: 'Abstract',
  showMore: 'Show more',
  showLess: 'Show less',
  untitled: 'Untitled',
  etAl: 'et al.',
  pdf: 'PDF',
  doi: 'DOI',
  bibtex: 'BibTeX',
  copyCitation: 'Copy citation',
  copied: 'Copied!',
  viewOnHal: 'View all {count} publications on HAL',
  viewOnHalOne: 'View this publication on HAL',
  title: 'Publications',
  opensInNewTab: '(opens in a new tab)',
  undated: 'Undated',
  missingQuery: 'No search criterion given.',
  docTypes: DOC_TYPE_LABELS,
};

// ---------------------------------------------------------------------------
// French
// ---------------------------------------------------------------------------

/**
 * HAL's own French wording (https://api.archives-ouvertes.fr/ref/doctype/?lang=fr), in the singular;
 * REPORT_* (HCERES evaluation reports) follow the wording of their HAL records.
 */
const FR_DOC_TYPES: Record<string, string> = {
  ART: 'Article dans une revue',
  COMM: 'Communication dans un congrès',
  COUV: 'Chapitre d’ouvrage',
  THESE: 'Thèse',
  OUV: 'Ouvrage',
  MEM: 'Mémoire d’étudiant',
  POSTER: 'Poster de conférence',
  OTHER: 'Autre publication scientifique',
  REPORT: 'Rapport',
  IMG: 'Image',
  ISSUE: 'Numéro spécial de revue',
  BLOG: 'Article de blog scientifique',
  NOTICE: 'Notice d’encyclopédie ou de dictionnaire',
  PROCEEDINGS: 'Recueil des communications',
  HDR: 'HDR',
  PATENT: 'Brevet',
  VIDEO: 'Vidéo',
  LECTURE: 'Cours',
  REPORT_LABO: 'Rapport d’évaluation d’une entité de recherche',
  TRAD: 'Traduction',
  REPORT_MAST: 'Rapport d’évaluation d’un master',
  REPORT_LPRO: 'Rapport d’évaluation d’une licence professionnelle',
  REPORT_LICE: 'Rapport d’évaluation d’une licence',
  SOFTWARE: 'Logiciel',
  PRESCONF: 'Document associé à des manifestations scientifiques',
  SON: 'Son',
  CREPORT: 'Chapitre de rapport',
  MAP: 'Carte',
  REPORT_DOCT: 'Rapport d’évaluation d’une école doctorale',
  REPORT_ETAB: 'Rapport d’évaluation d’un établissement',
  REPORT_FORM: 'Rapport d’évaluation d’un champ de formations',
  REPORT_GMAST: 'Rapport d’évaluation d’un grade master',
  NOTE: 'Note de lecture',
  SYNTHESE: 'Note de synthèse',
  REPORT_FPROJ: 'Rapport d’un champ de formations (projet)',
  ETABTHESE: 'Thèse d’établissement',
  REPORT_GLICE: 'Rapport d’évaluation d’un grade licence',
  REPACT: 'Rapport d’activité',
  MEMLIC: 'Mémoire de licence',
};

/** French typography: no-break space before ':' and a narrow one before '!'. */
const FR: Labels = {
  loading: 'Chargement…',
  empty: 'Aucun résultat.',
  error: 'Erreur\u00a0: {message}',
  previous: 'Précédent',
  next: 'Suivant',
  pageInfo: 'Page {page} sur {pages}',
  resultCount: '{count} résultats',
  resultCountOne: '{count} résultat',
  pagination: 'Pages de résultats',
  openAccess: 'Libre accès',
  abstract: 'Résumé',
  showMore: 'Voir plus',
  showLess: 'Voir moins',
  untitled: 'Sans titre',
  etAl: 'et al.',
  pdf: 'PDF',
  doi: 'DOI',
  bibtex: 'BibTeX',
  copyCitation: 'Copier la citation',
  copied: 'Copié\u202f!',
  viewOnHal: 'Voir les {count} publications sur HAL',
  viewOnHalOne: 'Voir cette publication sur HAL',
  title: 'Publications',
  opensInNewTab: '(s’ouvre dans un nouvel onglet)',
  undated: 'Sans date',
  missingQuery: 'Aucun critère de recherche indiqué.',
  docTypes: Object.freeze(FR_DOC_TYPES) as Record<string, string>,
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Built-in label sets, by lowercase ISO 639 language code. */
export const LOCALES: Readonly<Record<string, Labels>> = Object.freeze({
  en: Object.freeze(EN) as Labels,
  fr: Object.freeze(FR) as Labels,
});

/** Default alt text / iframe title of the embed snippets (src/embed.ts), per built-in locale. */
export const SNIPPET_TITLES: Readonly<Record<string, string>> = Object.freeze({
  en: 'Publications from HAL',
  fr: 'Publications sur HAL',
});

/** Language tag: primary subtag, then optional region/script/variant subtags ('fr', 'fr-FR', 'fr_CA'). */
const LANGUAGE_TAG_RE = /^([a-z]{2,3})(?:[-_][a-z0-9]{1,8})*$/i;

function has(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/**
 * Built-in locale of a language tag, matched on its primary language subtag
 * ('fr', 'FR', 'fr-FR', 'fr-CA' → 'fr'), or undefined when that language is not built in.
 */
export function matchLocale(tag: unknown): string | undefined {
  if (typeof tag !== 'string') return undefined;
  const m = LANGUAGE_TAG_RE.exec(tag.trim());
  if (!m) return undefined;
  const code = m[1].toLowerCase();
  return has(LOCALES, code) ? code : undefined;
}

/** Built-in locale of a language tag ('fr-FR' → 'fr'); unknown or missing tags give DEFAULT_LOCALE ('en'). */
export function resolveLocale(tag?: string): string {
  return matchLocale(tag) ?? DEFAULT_LOCALE;
}

/** Languages in which HAL labels its scientific domains (`{lang}_domainAllCodeLabel_fs`). */
const HAL_DOMAIN_LANGUAGES: readonly string[] = ['en', 'fr'];

/**
 * HAL field holding the domain labels in the language of a locale ('fr_domainAllCodeLabel_fs');
 * English for locales HAL does not translate domains into.
 */
export function domainLabelField(locale?: string): string {
  const code = resolveLocale(locale);
  return `${HAL_DOMAIN_LANGUAGES.includes(code) ? code : DEFAULT_LOCALE}_domainAllCodeLabel_fs`;
}

/**
 * HAL's domain label entries of a document (input of normalizeDomains), in the language of `locale`
 * (the field fetched by resolveFields), else in English; undefined when the document has none.
 */
export function getDomainLabels(doc: HalDoc, locale?: string): string[] | undefined {
  for (const field of [domainLabelField(locale), domainLabelField(DEFAULT_LOCALE)]) {
    const entries = doc?.[field];
    if (Array.isArray(entries) && entries.length > 0) return entries.filter((e): e is string => typeof e === 'string');
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Numbers and plurals
// ---------------------------------------------------------------------------

const numberFormats = new Map<string, Intl.NumberFormat>();
const pluralRules = new Map<string, Intl.PluralRules>();

/**
 * Formats a count for a locale: '9,183' (en), '9 183' with a narrow no-break space (fr).
 * Any BCP 47 tag works; without Intl or with an invalid tag, falls back to English grouping.
 * Negative and non-finite values count as 0, fractions are rounded.
 */
export function formatNumber(value: number, locale: string = DEFAULT_LOCALE): string {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  try {
    let format = numberFormats.get(locale);
    if (!format) {
      format = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
      numberFormats.set(locale, format);
    }
    return format.format(n);
  } catch {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
}

/**
 * True when `count` takes the singular form in the locale (CLDR plural category 'one'):
 * only 1 in English, 0 and 1 in French. Falls back to `count === 1` without Intl.
 */
export function isSingular(count: number, locale: string = DEFAULT_LOCALE): boolean {
  try {
    let rules = pluralRules.get(locale);
    if (!rules) {
      rules = new Intl.PluralRules(locale);
      pluralRules.set(locale, rules);
    }
    return rules.select(count) === 'one';
  } catch {
    return count === 1;
  }
}

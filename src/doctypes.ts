// ---------------------------------------------------------------------------
// HAL document types
// ---------------------------------------------------------------------------

/**
 * English labels for HAL docType_s codes (singular, as shown next to one document).
 * Based on HAL's own reference (https://api.archives-ouvertes.fr/ref/doctype/?lang=en);
 * REPORT_* codes are HCERES evaluation reports.
 */
export const DOC_TYPE_LABELS: Record<string, string> = {
  ART: 'Journal article',
  COMM: 'Conference paper',
  COUV: 'Book chapter',
  THESE: 'Thesis',
  OUV: 'Book',
  MEM: "Master's thesis",
  POSTER: 'Poster',
  OTHER: 'Other publication',
  REPORT: 'Report',
  IMG: 'Image',
  ISSUE: 'Special issue',
  BLOG: 'Blog post',
  NOTICE: 'Dictionary entry',
  PROCEEDINGS: 'Proceedings',
  HDR: 'Habilitation thesis',
  PATENT: 'Patent',
  VIDEO: 'Video',
  LECTURE: 'Lecture',
  REPORT_LABO: 'Research unit evaluation report',
  TRAD: 'Translation',
  REPORT_MAST: "Master's programme evaluation report",
  REPORT_LPRO: 'Professional bachelor evaluation report',
  REPORT_LICE: "Bachelor's programme evaluation report",
  SOFTWARE: 'Software',
  PRESCONF: 'Conference document',
  SON: 'Audio',
  CREPORT: 'Report chapter',
  MAP: 'Map',
  REPORT_DOCT: 'Doctoral school evaluation report',
  REPORT_ETAB: 'Institution evaluation report',
  REPORT_FORM: 'Study field evaluation report',
  REPORT_GMAST: "Master's degree evaluation report",
  NOTE: 'Book review',
  SYNTHESE: 'Synthesis note',
  REPORT_FPROJ: 'Study field project report',
  ETABTHESE: 'Institutional thesis',
  REPORT_GLICE: "Bachelor's degree evaluation report",
  REPACT: 'Activity report',
  MEMLIC: "Bachelor's thesis",
};

/** Codes that carry no meaningful type (HAL uses UNDEFINED for preprints / working papers). */
const HIDDEN_CODES = new Set(['', 'UNDEFINED']);

function own(record: Record<string, string> | undefined, key: string): string | undefined {
  return record && Object.prototype.hasOwnProperty.call(record, key) && record[key] ? record[key] : undefined;
}

/** 'REPORT_XYZ' → 'Report xyz', for codes HAL may add after this list was written. */
function humanise(code: string): string {
  const words = code.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Returns a readable label for a docType_s code, or undefined for 'UNDEFINED'/empty codes.
 * Non-empty `overrides` (e.g. Labels.docTypes) take precedence, even for UNDEFINED
 * (e.g. `{ UNDEFINED: 'Preprint' }`); unknown codes are humanised, never shown raw.
 */
export function docTypeLabel(code: string | undefined, overrides?: Record<string, string>): string | undefined {
  const key = typeof code === 'string' ? code.trim() : '';
  if (!key) return undefined;
  const override = own(overrides, key);
  if (override) return override;
  if (HIDDEN_CODES.has(key.toUpperCase())) return undefined;
  return own(DOC_TYPE_LABELS, key) ?? (humanise(key) || undefined);
}

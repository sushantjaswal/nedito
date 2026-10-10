// Tunable limits and wire keys for share links. Kept in one file on purpose: the thresholds
// below are judgement calls about other people's software (mail clients, wikis, chat apps
// truncating long URLs), so they will need adjusting as we learn where links actually break.

/**
 * Below this, a link is unremarkable — every tool we know of carries it intact.
 * IE's old 2,083-character limit is long dead; modern browsers accept far more, and the real
 * risk is intermediaries (mail clients, chat previews, wiki markup) rather than browsers.
 */
export const SHARE_URL_WARN_CHARS = 8_000;

/**
 * Above this we refuse to produce a link at all and offer the file download instead. A link
 * that silently gets truncated in transit is worse than no link: the recipient sees a damaged
 * payload and blames the app, with nothing to act on.
 */
export const SHARE_URL_MAX_CHARS = 16_000;

/** Fragment parameter holding the gzipped, base64url-encoded document. */
export const SHARE_PARAM_DOC = "d";

/**
 * Fragment parameter holding the document's formatVersion, duplicated outside the payload so a
 * link written by a newer app can be rejected with a clear message without spending time
 * decompressing something we already know we cannot read.
 */
export const SHARE_PARAM_VERSION = "v";

/**
 * Fragment parameter naming the diagram the recipient should land on ("Open at this level").
 * A single diagram id is enough: the document is a tree, so `model/nesting.ts`'s
 * findDiagramPath reconstructs the whole breadcrumb trail from it, and storing the full path
 * would only be a longer way of saying the same thing.
 */
export const SHARE_PARAM_PATH = "p";

/**
 * Characters per "KB" in the link-size indicator. 1000, not 1024: the payload is base64url, so
 * one character is one byte, and the limits either side of this number (SHARE_URL_WARN_CHARS,
 * SHARE_URL_MAX_CHARS) are round decimal figures. Dividing by 1024 would render a 16,000-char
 * ceiling as "15.6 KB", which reads like an arbitrary number rather than the limit it is.
 */
export const SHARE_CHARS_PER_KB = 1000;

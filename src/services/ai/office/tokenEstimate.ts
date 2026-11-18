/**
 * Phase 38 D-07/D-10: local token estimation, used only for WARNING and for charging a
 * request the provider reported nothing about (D-10 — a request is never free).
 *
 * ponytail: ceiling is "estimates are model-family approximations" — `o200k_base` is the
 * gpt-4o family encoding, so a different family's count drifts. Upgrade path: swap the
 * encoding constant below if the default model stops being gpt-4o.
 *
 * Both imports are dynamic and use the package's `lite` + single-rank subpaths (never the
 * package root, whose entry point is ~5 MB), so Vite emits the encoder as its own lazily
 * loaded chunk and the startup bundle does not grow. A load failure degrades to chars÷4.
 */
export type EncoderKind = 'tiktoken' | 'chars-div-4';

/** Minimal shape of the encoder this module consumes; narrowed locally, never trusted. */
interface LocalEncoder {
  encode(text: string, allowedSpecial?: Array<string> | 'all'): number[];
}

type EncoderLoader = () => Promise<LocalEncoder>;

let encoderKind: EncoderKind = 'chars-div-4';
let encoderPromise: Promise<LocalEncoder | null> | null = null;
let loaderOverride: EncoderLoader | null = null;

const defaultLoader: EncoderLoader = async () => {
  const [{ Tiktoken }, ranks] = await Promise.all([
    import('js-tiktoken/lite'),
    import('js-tiktoken/ranks/o200k_base'),
  ]);
  return new Tiktoken(ranks.default);
};

function loadEncoder(): Promise<LocalEncoder | null> {
  if (encoderPromise === null) {
    const loader = loaderOverride ?? defaultLoader;
    encoderPromise = loader().then(
      (encoder) => {
        encoderKind = 'tiktoken';
        return encoder;
      },
      () => null
    );
  }
  return encoderPromise;
}

/**
 * D-10: token count for `text`. Never throws — an absent or failing encoder degrades to the
 * chars÷4 heuristic, and every value it produces is still marked estimated by the caller.
 */
export async function estimateTokens(text: string): Promise<number> {
  if (text.length === 0) return 0;
  const encoder = await loadEncoder();
  if (encoder !== null) {
    try {
      return encoder.encode(text).length;
    } catch {
      // WR-14: `js-tiktoken` throws on a special token unless it is allowed. One bad token
      // in a large payload must not throw away a working encoder, so retry once treating
      // special tokens as ordinary text — then fall back to the heuristic.
      try {
        return encoder.encode(text, 'all').length;
      } catch {
        /* fall through to the heuristic */
      }
    }
  }
  return Math.ceil(text.length / 4);
}

/** Which estimator is live — `chars-div-4` only when the tokenizer failed to load. */
export function getEncoderKind(): EncoderKind {
  return encoderKind;
}

/** Test seam: force a loader (e.g. one that throws) so the never-blocks path is provable. */
export function setEncoderLoaderForTests(loader: EncoderLoader | null): void {
  loaderOverride = loader;
  encoderPromise = null;
  encoderKind = 'chars-div-4';
}

/** Test seam: drop the cached singleton so a fresh load is observable. */
export function resetTokenEstimatorForTests(): void {
  encoderPromise = null;
  encoderKind = 'chars-div-4';
  loaderOverride = null;
}

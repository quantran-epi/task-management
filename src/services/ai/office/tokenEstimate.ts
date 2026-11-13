/**
 * Phase 38 D-07/D-10: local token estimation, used only for WARNING and for charging a
 * request the provider reported nothing about (D-10 — a request is never free).
 *
 * ponytail: ceiling is chars÷4 — wrong by ±30% on non-English text and on models with a
 * different tokenizer. Upgrade path is plan 10: it installs `js-tiktoken` behind a blocking
 * checkpoint, then switches the two specifiers below to literal lazy subpaths so Vite
 * bundles the encoder chunks. The public shape (`estimateTokens`, `getEncoderKind`) does not
 * change, so nothing downstream moves.
 *
 * The two specifiers are deliberately widened `string` variables loaded through a dynamic
 * import with `@vite-ignore`: TypeScript resolves literal specifiers even inside a try/catch,
 * and Vite's import analysis rejects an absent package before the runtime fallback can run.
 * The strings are internal constants — no user-controlled module name ever reaches `import`.
 */
export type EncoderKind = 'tiktoken' | 'chars-div-4';

const LITE_SPECIFIER: string = 'js-tiktoken/lite';
const RANKS_SPECIFIER: string = 'js-tiktoken/ranks/o200k_base';

/** Minimal shape of the encoder this module consumes; narrowed locally, never trusted. */
interface LocalEncoder {
  encode(text: string): number[];
}

type EncoderLoader = () => Promise<LocalEncoder>;

let encoderKind: EncoderKind = 'chars-div-4';
let encoderPromise: Promise<LocalEncoder | null> | null = null;
let loaderOverride: EncoderLoader | null = null;

const defaultLoader: EncoderLoader = async () => {
  const lite = (await import(/* @vite-ignore */ LITE_SPECIFIER)) as {
    Tiktoken: new (ranks: unknown) => LocalEncoder;
  };
  const ranks = (await import(/* @vite-ignore */ RANKS_SPECIFIER)) as { default: unknown };
  return new lite.Tiktoken(ranks.default);
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
      /* fall through to the heuristic */
    }
  }
  return Math.ceil(text.length / 4);
}

/** Which estimator is live — `chars-div-4` until plan 10 installs the tokenizer. */
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

import {
  CHUNKING_POLICY_VERSION,
  TARGET_CHUNK_SIZE,
  HARD_ATOMIC_BLOCK_LIMIT,
  type EvidenceChunk,
} from '../../../knowledge-server/src/types/protocol';
import {
  chunkMarkdownSnapshot,
  OversizedAtomicBlockError,
} from '../../../knowledge-server/src/parser/sectionChunker';

export {
  CHUNKING_POLICY_VERSION,
  TARGET_CHUNK_SIZE,
  HARD_ATOMIC_BLOCK_LIMIT,
  type EvidenceChunk,
  chunkMarkdownSnapshot,
  OversizedAtomicBlockError,
};

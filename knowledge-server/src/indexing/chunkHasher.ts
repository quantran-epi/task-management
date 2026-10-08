/// <reference types="node" />
import { createHash, randomUUID } from 'node:crypto';
import {
  buildChunkHashInput,
  buildDocumentHashInput,
} from './chunkHashPolicy.js';

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function hashChunk(rawContent: string): string {
  return sha256(buildChunkHashInput(rawContent));
}

export function hashDocument(rawBody: string): string {
  return sha256(buildDocumentHashInput(rawBody));
}

export function createProjectionId(): string {
  return randomUUID();
}

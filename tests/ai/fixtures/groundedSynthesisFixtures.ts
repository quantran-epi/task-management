import type { EvidencePack, SourceRecord, ValidatedPath } from '../../../src/services/ai/evidencePack';

export interface GroundedClaimV2 {
  id: string;
  text: string;
  classification: 'DIRECT' | 'INFERRED';
  citationIds: string[];
  pathId: string | null;
}

export interface GroundedHypothesisV2 {
  text: string;
  justification: string;
}

export interface GroundedAnswerV2 {
  schemaVersion: 2;
  language: string;
  conclusion: string;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  confidenceReason: string;
  claims: GroundedClaimV2[];
  hypotheses: GroundedHypothesisV2[];
  unsupportedParts: string[];
}

export interface GroundedAnswerV1 {
  schemaVersion: 1;
  language: string;
  conclusion: string;
  claims: {
    id: string;
    text: string;
    classification: 'DIRECT' | 'INFERRED';
    citationIds: string[];
    pathId: string | null;
  }[];
  unsupportedParts: string[];
}

const SAMPLE_SOURCE_S1: SourceRecord = {
  citationId: 'S1',
  documentId: 'doc-001',
  documentTitle: '02-data-objects.md',
  sectionAnchor: '#fcl-cycle-counter',
  lineStart: 10,
  lineEnd: 24,
  authority: 'server',
  evidenceClass: 'OBSERVED',
  snapshotId: 'gsnap_0123456789abcdef',
  publishedContentHash: 'a'.repeat(64),
  citedExcerpt: 'MAIN1.FCL_CYCLE_COUNTER stores billing cycle execution counters.',
  setMemberships: [{ setId: 'set-001', setName: 'Core Banking Set' }],
};

const SAMPLE_SOURCE_S2: SourceRecord = {
  citationId: 'S2',
  documentId: 'doc-002',
  documentTitle: '04-cycles.md',
  sectionAnchor: '#cycle-definitions',
  lineStart: 45,
  lineEnd: 60,
  authority: 'server',
  evidenceClass: 'OBSERVED',
  snapshotId: 'gsnap_0123456789abcdef',
  publishedContentHash: 'b'.repeat(64),
  citedExcerpt: 'Container 60000006 invokes interest calculations sequentially.',
  setMemberships: [{ setId: 'set-001', setName: 'Core Banking Set' }],
};

const SAMPLE_PATH_P1: ValidatedPath = {
  pathId: 'P1',
  snapshotId: 'gsnap_0123456789abcdef',
  nodeUrns: [
    'urn:plannermate:smartvista:PRC_PROCESS:60000006',
    'urn:plannermate:smartvista:PRC_CONTAINER:60000006',
  ],
  edgeFactKeys: ['fact_process_to_container_60000006'],
  hopClassifications: ['OBSERVED'],
  hopCitationIds: [['S1']],
  classification: 'OBSERVED',
  hasConflict: false,
};

export const SYNTHESIS_FIXTURES = {
  directCited: {
    evidencePack: {
      authority: 'server' as const,
      citations: { S1: SAMPLE_SOURCE_S1 } as Record<string, SourceRecord>,
      paths: {},
      conflicts: [],
      promptEvidence: [{ id: 'S1', text: SAMPLE_SOURCE_S1.citedExcerpt }],
      contextTruncated: false,
      coverageWarnings: [],
    } satisfies EvidencePack,
    answerV2: {
      schemaVersion: 2 as const,
      language: 'vi',
      conclusion: 'MAIN1.FCL_CYCLE_COUNTER là bảng lưu trữ số đếm chu kỳ tính toán trong cơ sở dữ liệu.',
      confidence: 'high' as const,
      confidenceReason: 'Trực tiếp trích xuất từ tài liệu 02-data-objects.md với độ bao phủ đầy đủ.',
      claims: [
        {
          id: 'C1',
          text: 'MAIN1.FCL_CYCLE_COUNTER lưu trữ số đếm chu kỳ tính phí.',
          classification: 'DIRECT',
          citationIds: ['S1'],
          pathId: null,
        },
      ],
      hypotheses: [],
      unsupportedParts: [],
    } satisfies GroundedAnswerV2,
  },

  multiHopInferred: {
    evidencePack: {
      authority: 'server' as const,
      citations: { S1: SAMPLE_SOURCE_S1, S2: SAMPLE_SOURCE_S2 } as Record<string, SourceRecord>,
      paths: { P1: SAMPLE_PATH_P1 },
      conflicts: [],
      promptEvidence: [
        { id: 'S1', text: SAMPLE_SOURCE_S1.citedExcerpt },
        { id: 'S2', text: SAMPLE_SOURCE_S2.citedExcerpt },
      ],
      contextTruncated: false,
      coverageWarnings: [],
    } satisfies EvidencePack,
    answerV2: {
      schemaVersion: 2 as const,
      language: 'vi',
      conclusion: 'Quy trình 60000006 điều phối thực thi qua container tương ứng.',
      confidence: 'medium' as const,
      confidenceReason: 'Suy diễn dựa trên đường đi đồ thị P1 nối PRC_PROCESS và PRC_CONTAINER.',
      claims: [
        {
          id: 'C1',
          text: 'Tiến trình gọi sang container theo chuỗi quan hệ CONTAINS_STEP.',
          classification: 'INFERRED',
          citationIds: ['S1'],
          pathId: 'P1',
        },
      ],
      hypotheses: [],
      unsupportedParts: [],
    } satisfies GroundedAnswerV2,
  },

  zeroEvidenceAbstention: {
    evidencePack: {
      authority: 'server' as const,
      citations: {},
      paths: {},
      conflicts: [],
      promptEvidence: [],
      contextTruncated: false,
      coverageWarnings: [],
    } satisfies EvidencePack,
    answerV2: {
      schemaVersion: 2 as const,
      language: 'vi',
      conclusion: 'Không tìm thấy thông tin hoặc bằng chứng liên quan trong tài liệu và đồ thị tri thức hiện có.',
      confidence: 'unknown' as const,
      confidenceReason: 'Không có trích dẫn hoặc đường đi đồ thị nào khớp với câu hỏi.',
      claims: [],
      hypotheses: [],
      unsupportedParts: ['Toàn bộ yêu cầu về điện chuyển tiền SWIFT MT103 không có tài liệu đối chiếu'],
    } satisfies GroundedAnswerV2,
  },

  explicitSpeculation: {
    evidencePack: {
      authority: 'server' as const,
      citations: {},
      paths: {},
      conflicts: [],
      promptEvidence: [],
      contextTruncated: false,
      coverageWarnings: [],
    } satisfies EvidencePack,
    answerV2: {
      schemaVersion: 2 as const,
      language: 'vi',
      conclusion: 'Không có tài liệu chính thức về cổng thanh toán MT103, hệ thống đưa ra giả thuyết theo yêu cầu người dùng.',
      confidence: 'low' as const,
      confidenceReason: 'Người dùng yêu cầu suy đoán; không có dẫn chứng chính thức.',
      claims: [],
      hypotheses: [
        {
          text: 'Cổng thanh toán có thể chuyển tiếp thông điệp sang module hạch toán trung gian trước khi ghi nhận vào FCL_CYCLE_COUNTER.',
          justification: 'Dựa trên kiến trúc xử lý lô thẻ thông thường của hệ thống SmartVista.',
        },
      ],
      unsupportedParts: [],
    } satisfies GroundedAnswerV2,
  },

  legacyV1Answer: {
    schemaVersion: 1 as const,
    language: 'vi',
    conclusion: 'Kết quả v1 cũ được lưu trong lịch sử chat.',
    claims: [
      {
        id: 'C1',
        text: 'Nội dung v1 trực tiếp trích dẫn.',
        classification: 'DIRECT',
        citationIds: ['S1'],
        pathId: null,
      },
    ],
    unsupportedParts: [],
  } satisfies GroundedAnswerV1,
} as const;

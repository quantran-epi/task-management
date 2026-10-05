import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AI_DATABASE_TOOLS, executeAiTool } from '../aiTools';
import * as imageClientModule from '../imageGenerationClient';
import * as tokenServiceModule from '../nineRouterTokenService';

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

describe('aiTools generate_image', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('registers generate_image tool definition in AI_DATABASE_TOOLS with required parameters', () => {
    const tool = AI_DATABASE_TOOLS.find((t) => t.function.name === 'generate_image');
    expect(tool).toBeDefined();
    expect(tool?.function.description).toContain('image');

    const props = tool?.function.parameters.properties;
    expect(props?.prompt).toBeDefined();
    expect(props?.size).toBeDefined();
    expect(props?.style).toBeDefined();
    expect(props?.saveToDocId).toBeDefined();
    expect(tool?.function.parameters.required).toContain('prompt');
  });

  it('rejects execution when prompt is missing', async () => {
    const fakeDb = {} as any;
    const resNoPrompt = await executeAiTool('generate_image', {}, fakeDb);
    expect(JSON.parse(resNoPrompt)).toEqual({ error: 'prompt is required' });
  });

  it('calls generateImage and returns formatted markdown embed on success', async () => {
    const fakeDb = {} as any;

    vi.spyOn(tokenServiceModule, 'getImageConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'dall-e-3',
    });
    vi.spyOn(tokenServiceModule, 'getImageApiKey').mockResolvedValue('test-sk-key');

    const generateSpy = vi.spyOn(imageClientModule, 'generateImage').mockResolvedValue({
      model: 'dall-e-3',
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      b64Json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      revisedPrompt: 'A futuristic personal workspace dashboard with luminous widgets',
    });

    const resultStr = await executeAiTool(
      'generate_image',
      {
        prompt: 'a futuristic workspace dashboard',
        size: '1024x1024',
      },
      fakeDb
    );

    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'a futuristic workspace dashboard',
        endpoint: 'http://localhost:20128',
        apiKey: 'test-sk-key',
        model: 'dall-e-3',
        size: '1024x1024',
      })
    );

    const result = JSON.parse(resultStr);
    expect(result.success).toBe(true);
    expect(result.model).toBe('dall-e-3');
    expect(result.markdown).toContain('![A futuristic personal workspace dashboard with luminous widgets]');
    expect(result.markdown).toContain('data:image/png;base64,');
  });

  it('redacts API key in client error scenarios', async () => {
    const fakeDb = {} as any;

    vi.spyOn(tokenServiceModule, 'getImageConfig').mockResolvedValue({
      endpoint: 'http://localhost:20128',
      defaultModel: 'dall-e-3',
    });
    vi.spyOn(tokenServiceModule, 'getImageApiKey').mockResolvedValue('super-secret-key-12345');

    vi.spyOn(imageClientModule, 'generateImage').mockRejectedValue(
      new Error('Unauthorized: super-secret-key-12345 is invalid')
    );

    const resultStr = await executeAiTool(
      'generate_image',
      {
        prompt: 'cute robotic pet',
      },
      fakeDb
    );

    const result = JSON.parse(resultStr);
    expect(result.error).toBeDefined();
    expect(result.error).not.toContain('super-secret-key-12345');
  });

  afterEach(() => {
    delete (window as any).__TAURI_INTERNALS__;
    invokeMock.mockReset();
  });

  it('generateImage routes through Tauri AI proxy in desktop', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: JSON.stringify({
        data: [{ b64_json: 'aW1hZ2VkYXRh', revised_prompt: 'A prompt' }],
      }),
    });
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const res = await imageClientModule.generateImage({
      prompt: 'a scenic view',
      endpoint: 'http://10.4.97.70:30129',
      apiKey: 'sk-image-test',
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith('ai_proxy_request', {
      method: 'POST',
      url: 'http://10.4.97.70:30129/v1/images/generations',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer sk-image-test',
      },
      body: expect.stringContaining('"prompt":"a scenic view"'),
    });
    expect(res.b64Json).toBe('aW1hZ2VkYXRh');
    expect(res.dataUrl).toBe('data:image/png;base64,aW1hZ2VkYXRh');
  });

  it('testImageGenerationConnection routes through Tauri AI proxy in desktop', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    invokeMock.mockResolvedValue({
      status: 200,
      headers: {},
      body: JSON.stringify({
        data: [{ id: 'dall-e-3' }, { id: 'flux' }],
      }),
    });
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const res = await imageClientModule.testImageGenerationConnection({
      endpoint: 'http://10.4.97.70:30129',
      apiKey: 'sk-image-test',
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith('ai_proxy_request', {
      method: 'GET',
      url: 'http://10.4.97.70:30129/v1/models',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer sk-image-test',
      },
      body: undefined,
    });
    expect(res.ok).toBe(true);
    expect(res.models).toEqual(['dall-e-3', 'flux']);
  });
});

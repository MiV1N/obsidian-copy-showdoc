// Type definitions for multi-part-lite 1.0.0
// Project: https://github.com/strikeentco/multi-part-lite
// Definitions by: AI assistant

interface MultipartLiteOptions {
  boundary?: string;
  boundaryPrefix?: string;
  defaults?: {
    name?: string;
    ext?: string;
    type?: string;
  };
}

interface AppendOptions {
  filename?: string;
  contentType?: string;
}

interface Headers {
  'content-type': string;
  'transfer-encoding'?: string;
  'content-length'?: string;
}

declare class MultipartLite {
  constructor(options?: MultipartLiteOptions);
  static symbols: object;
  append(field: string | number, value: any, options?: AppendOptions): MultipartLite;
  getLength(cb?: (err: null | Error, length: number) => void): number;
  getBoundary(): string;
  getHeaders(chunked?: boolean): Headers;
  stream(): MultipartLite;
  buffer(): Promise<Buffer>;
  getFileName(value: any, defaults: any): string;
  getContentType(options: { filename?: string; contentType?: string }, defaults: any): string;
}

export default MultipartLite;
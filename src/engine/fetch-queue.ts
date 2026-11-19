import * as crypto from 'node:crypto';
import { gunzipSync } from 'node:zlib';

export const DEFAULT_USER_AGENT =
  'SiloSEO-AuditBot/1.0 (+https://github.com/thehubcontent/silo-seo/bot-exclusion; polite-ecommerce-auditor)';

export interface HttpFetchResult {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  redirectChain: string[];
  headers: Record<string, string>;
  bodyText: string;
  bodyBuffer: Buffer;
  contentType: string;
  etag: string | null;
  lastModified: string | null;
  fingerprint: string;
  durationMs: number;
  blockedOrUnavailable: boolean;
}

export type CustomFetcher = (url: string, headers?: Record<string, string>) => Promise<{
  status: number;
  headers: Record<string, string>;
  body: string | Buffer;
}>;

export class PoliteFetchQueue {
  private concurrency: number;
  private perHostDelayMs: number;
  private hostLastRequestTime = new Map<string, number>();
  private activeCount = 0;
  private queue: Array<() => void> = [];
  private customFetcher?: CustomFetcher;
  private cancelled = false;
  private paused = false;

  constructor(options: {
    concurrency?: number;
    perHostDelayMs?: number;
    customFetcher?: CustomFetcher;
  } = {}) {
    this.concurrency = options.concurrency ?? 4;
    this.perHostDelayMs = options.perHostDelayMs ?? 250;
    this.customFetcher = options.customFetcher;
  }

  public setPerHostDelay(ms: number): void {
    this.perHostDelayMs = Math.max(this.perHostDelayMs, ms);
  }

  public cancel(): void {
    this.cancelled = true;
  }

  public pause(): void {
    this.paused = true;
  }

  public resume(): void {
    this.paused = false;
  }

  public isCancelled(): boolean {
    return this.cancelled;
  }

  public isPaused(): boolean {
    return this.paused;
  }

  private async acquireSlot(host: string): Promise<void> {
    while (this.paused && !this.cancelled) {
      await new Promise((r) => setTimeout(r, 100));
    }
    if (this.cancelled) {
      throw new Error('Crawl cancelled');
    }
    if (this.activeCount >= this.concurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.activeCount++;

    const now = Date.now();
    const lastTime = this.hostLastRequestTime.get(host) ?? 0;
    const waitMs = Math.max(0, lastTime + this.perHostDelayMs - now);
    this.hostLastRequestTime.set(host, now + waitMs);
    if (waitMs > 0) {
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }

  private releaseSlot(): void {
    this.activeCount--;
    const next = this.queue.shift();
    if (next) next();
  }

  public async fetchUrl(
    url: string,
    options: {
      maxRedirects?: number;
      retries?: number;
      timeoutMs?: number;
      ifNoneMatch?: string | null;
      ifModifiedSince?: string | null;
    } = {}
  ): Promise<HttpFetchResult> {
    const maxRedirects = options.maxRedirects ?? 5;
    const maxRetries = options.retries ?? 2;
    const timeoutMs = options.timeoutMs ?? 12000;

    const redirectChain: string[] = [];
    let currentUrl = url;
    let firstRedirectStatus: number | null = null;
    const startTime = Date.now();

    for (let hop = 0; hop <= maxRedirects; hop++) {
      const parsed = new URL(currentUrl);
      await this.acquireSlot(parsed.hostname);

      try {
        let attempt = 0;
        while (true) {
          try {
            const reqHeaders: Record<string, string> = {
              'user-agent': DEFAULT_USER_AGENT,
              accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7',
              'accept-language': 'en-US,en;q=0.9',
            };
            if (options.ifNoneMatch) reqHeaders['if-none-match'] = options.ifNoneMatch;
            if (options.ifModifiedSince) reqHeaders['if-modified-since'] = options.ifModifiedSince;

            let status: number;
            let respHeaders: Record<string, string> = {};
            let bodyBuffer: Buffer;

            if (this.customFetcher) {
              const res = await this.customFetcher(currentUrl, reqHeaders);
              status = res.status;
              for (const [k, v] of Object.entries(res.headers)) {
                respHeaders[k.toLowerCase()] = v;
              }
              bodyBuffer = Buffer.isBuffer(res.body) ? res.body : Buffer.from(res.body, 'utf-8');
            } else {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), timeoutMs);
              try {
                const res = await fetch(currentUrl, {
                  method: 'GET',
                  headers: reqHeaders,
                  redirect: 'manual',
                  signal: controller.signal,
                });
                status = res.status;
                res.headers.forEach((v, k) => {
                  respHeaders[k.toLowerCase()] = v;
                });
                const ab = await res.arrayBuffer();
                bodyBuffer = Buffer.from(ab);
              } finally {
                clearTimeout(timer);
              }
            }

            if ((status === 429 || status === 503) && attempt < maxRetries) {
              attempt++;
              const backoffMs = Math.min(4000, 300 * Math.pow(2, attempt));
              await new Promise((r) => setTimeout(r, backoffMs));
              continue;
            }

            if (status >= 300 && status < 400 && respHeaders['location'] && hop < maxRedirects) {
              if (firstRedirectStatus === null) firstRedirectStatus = status;
              const nextUrl = new URL(respHeaders['location'], currentUrl).toString();
              redirectChain.push(nextUrl);
              currentUrl = nextUrl;
              break;
            }

            // Decompress gzip if sitemap.xml.gz
            let finalBuffer = bodyBuffer;
            if (
              currentUrl.toLowerCase().endsWith('.gz') ||
              (finalBuffer.length >= 2 && finalBuffer[0] === 0x1f && finalBuffer[1] === 0x8b)
            ) {
              try {
                finalBuffer = gunzipSync(finalBuffer);
              } catch {
                // Keep raw buffer if not valid gzip
              }
            }

            const bodyText = finalBuffer.toString('utf-8');
            const fingerprint = crypto.createHash('sha256').update(finalBuffer).digest('hex');
            const effectiveStatus = firstRedirectStatus ?? status;
            const blockedOrUnavailable = status === 403 || status === 429 || status === 503 || status === 0;

            return {
              requestedUrl: url,
              finalUrl: currentUrl,
              status: effectiveStatus,
              redirectChain,
              headers: respHeaders,
              bodyText,
              bodyBuffer: finalBuffer,
              contentType: respHeaders['content-type'] ?? 'text/html',
              etag: respHeaders['etag'] ?? null,
              lastModified: respHeaders['last-modified'] ?? null,
              fingerprint,
              durationMs: Date.now() - startTime,
              blockedOrUnavailable,
            };
          } catch (err) {
            if (attempt < maxRetries) {
              attempt++;
              await new Promise((r) => setTimeout(r, 250 * attempt));
              continue;
            }
            return {
              requestedUrl: url,
              finalUrl: currentUrl,
              status: 0,
              redirectChain,
              headers: {},
              bodyText: '',
              bodyBuffer: Buffer.alloc(0),
              contentType: '',
              etag: null,
              lastModified: null,
              fingerprint: '',
              durationMs: Date.now() - startTime,
              blockedOrUnavailable: true,
            };
          }
        }
      } finally {
        this.releaseSlot();
      }
    }

    return {
      requestedUrl: url,
      finalUrl: currentUrl,
      status: firstRedirectStatus ?? 301,
      redirectChain,
      headers: {},
      bodyText: '',
      bodyBuffer: Buffer.alloc(0),
      contentType: '',
      etag: null,
      lastModified: null,
      fingerprint: '',
      durationMs: Date.now() - startTime,
      blockedOrUnavailable: false,
    };
  }
}


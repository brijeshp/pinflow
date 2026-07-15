import {
  CLOSE_STREAM_FRAME,
  FINALIZE_FRAME,
  KEEPALIVE_FRAME,
  buildListenUrl,
  parseMessage,
} from './protocol';
import type { TranscriptionProvider, TranscriptionStream } from '../types';

const MODEL = 'nova-3';
const LANGUAGE = 'en';
const KEEPALIVE_MS = 4000;
// Ceiling on waiting for the from_finalize ack — fallback only, not a sleep.
const FINALIZE_FALLBACK_MS = 1000;
const OPEN_TIMEOUT_MS = 10000;

export type WebSocketFactory = (url: string, protocols: string[]) => WebSocket;

/**
 * Hand-rolled Deepgram streaming provider. Auth is the short-lived grant-token
 * JWT passed via the WS subprotocol (`['token', jwt]`) — browsers can't set
 * Authorization headers. KeepAlive every 4s; Finalize/CloseStream on teardown.
 */
export function createDeepgramProvider(
  token: string,
  wsFactory?: WebSocketFactory,
): TranscriptionProvider {
  const factory: WebSocketFactory =
    wsFactory ?? ((url, protocols) => new WebSocket(url, protocols));
  return {
    engine: `deepgram:${MODEL}`,
    open(opts) {
      return new Promise<TranscriptionStream>((resolve, reject) => {
        const ws = factory(buildListenUrl({ model: MODEL, language: LANGUAGE }), ['token', token]);
        ws.binaryType = 'arraybuffer';
        let keepalive = 0;
        let opened = false;
        // Pending finalize() resolver; fires on the from_finalize ack, socket
        // close, or the fallback timer — whichever comes first.
        let finalizeAck: (() => void) | null = null;
        // Pre-open failures must both reject AND close the socket.
        const fail = (err: Error): void => {
          reject(err);
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        };
        const timer = window.setTimeout(
          () => fail(new Error('voice websocket open timed out')),
          OPEN_TIMEOUT_MS,
        );

        const stream: TranscriptionStream = {
          sendPcm(frame) {
            if (ws.readyState === WebSocket.OPEN) ws.send(frame);
          },
          // Deepgram acks Finalize with a Results frame carrying
          // from_finalize:true — resolve on that (captures the sentence tail on
          // slow links) rather than blind-sleeping.
          finalize() {
            if (ws.readyState !== WebSocket.OPEN) return Promise.resolve();
            ws.send(FINALIZE_FRAME);
            return new Promise<void>((res) => {
              const done = (): void => {
                window.clearTimeout(timer);
                finalizeAck = null;
                res();
              };
              const timer = window.setTimeout(done, FINALIZE_FALLBACK_MS);
              finalizeAck = done;
            });
          },
          close() {
            finalizeAck?.();
            window.clearInterval(keepalive);
            if (ws.readyState === WebSocket.OPEN) ws.send(CLOSE_STREAM_FRAME);
            ws.onmessage = null;
            ws.onerror = null;
            ws.onopen = null;
            ws.onclose = null;
            try {
              ws.close();
            } catch {
              /* ignore */
            }
          },
        };

        ws.onopen = (): void => {
          opened = true;
          window.clearTimeout(timer);
          keepalive = window.setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send(KEEPALIVE_FRAME);
          }, KEEPALIVE_MS);
          resolve(stream);
        };
        ws.onerror = (e): void => {
          if (!opened) {
            window.clearTimeout(timer);
            fail(new Error('voice websocket failed to open'));
          } else opts.onError(e);
        };
        ws.onclose = (e): void => {
          finalizeAck?.();
          window.clearTimeout(timer);
          window.clearInterval(keepalive);
          if (!opened) reject(new Error(`voice websocket closed before open (code ${e.code})`));
          else opts.onError(new Error(`voice websocket closed unexpectedly (code ${e.code})`));
        };
        ws.onmessage = (e: MessageEvent): void => {
          if (typeof e.data !== 'string') return;
          const msg = parseMessage(e.data);
          if (!msg) return;
          if (msg.type === 'results') {
            if (msg.fromFinalize) finalizeAck?.();
            if (msg.transcript === '') return;
            if (msg.isFinal) opts.onFinal(msg.transcript, msg.confidence);
            else opts.onInterim(msg.transcript);
          } else if (msg.type === 'error') {
            opts.onError(new Error(msg.detail));
          }
        };
      });
    },
  };
}

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
const FINALIZE_GRACE_MS = 300;

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

        const stream: TranscriptionStream = {
          sendPcm(frame) {
            if (ws.readyState === WebSocket.OPEN) ws.send(frame);
          },
          finalize() {
            return new Promise<void>((res) => {
              if (ws.readyState === WebSocket.OPEN) ws.send(FINALIZE_FRAME);
              window.setTimeout(res, FINALIZE_GRACE_MS);
            });
          },
          close() {
            window.clearInterval(keepalive);
            if (ws.readyState === WebSocket.OPEN) ws.send(CLOSE_STREAM_FRAME);
            ws.onmessage = null;
            ws.onerror = null;
            ws.onopen = null;
            try {
              ws.close();
            } catch {
              /* ignore */
            }
          },
        };

        ws.onopen = (): void => {
          opened = true;
          keepalive = window.setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) ws.send(KEEPALIVE_FRAME);
          }, KEEPALIVE_MS);
          resolve(stream);
        };
        ws.onerror = (e): void => {
          if (!opened) reject(new Error('voice websocket failed to open'));
          else opts.onError(e);
        };
        ws.onmessage = (e: MessageEvent): void => {
          if (typeof e.data !== 'string') return;
          const msg = parseMessage(e.data);
          if (!msg) return;
          if (msg.type === 'results') {
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

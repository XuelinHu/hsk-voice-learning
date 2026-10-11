import { createServer, request } from 'node:http';
import { createServer as createSecureServer, request as secureRequest } from 'node:https';

export function createWebServer(apiPort, { tlsOptions = null, apiTls = false, apiHost = '127.0.0.1' } = {}) {
  const handler = (incoming, outgoing) => {
    const upstream = (apiTls ? secureRequest : request)({
      hostname: apiHost,
      port: apiPort,
      path: incoming.url,
      method: incoming.method,
      headers: incoming.headers,
    }, (response) => {
      outgoing.writeHead(response.statusCode, response.headers);
      response.pipe(outgoing);
    });
    upstream.on('error', () => {
      if (!outgoing.headersSent) {
        outgoing.writeHead(502, { 'Content-Type': 'application/json' });
        outgoing.end(JSON.stringify({ error: '后端服务暂不可用' }));
      } else {
        outgoing.destroy();
      }
    });
    incoming.on('aborted', () => upstream.destroy());
    outgoing.on('close', () => {
      if (!outgoing.writableEnded) upstream.destroy();
    });
    incoming.pipe(upstream);
  };
  return tlsOptions ? createSecureServer(tlsOptions, handler) : createServer(handler);
}

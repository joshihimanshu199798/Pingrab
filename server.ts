import 'dotenv/config';
import express, { Request as ExpressRequest, Response as ExpressResponse } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GET as searchHandler } from './api/search.ts';
import { GET as downloadHandler } from './api/download.ts';
import { POST as tagsHandler } from './api/tags.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function pipeWebHandler(
  req: ExpressRequest,
  res: ExpressResponse,
  handler: (request: Request) => Promise<Response>
) {
  try {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';
    const fullUrl = `${protocol}://${host}${req.originalUrl}`;

    const init: RequestInit = {
      method: req.method,
      headers: req.headers as HeadersInit,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body !== undefined) {
      init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const webReq = new Request(fullUrl, init);

    const webRes = await handler(webReq);
    res.status(webRes.status);
    webRes.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const buffer = Buffer.from(await webRes.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));

  // Keyless search, high-res download proxy, and ML visual tagger endpoints
  app.get('/api/search', (req, res) => void pipeWebHandler(req, res, searchHandler));
  app.get('/api/download', (req, res) => void pipeWebHandler(req, res, downloadHandler));
  app.post('/api/tags', (req, res) => void pipeWebHandler(req, res, tagsHandler));

  const publicDir = path.resolve(__dirname, 'public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(__dirname, 'dist');

  if (!isProd || !fs.existsSync(distDir)) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`PinGrab server listening on http://0.0.0.0:${port}`);
  });
}

void startServer();

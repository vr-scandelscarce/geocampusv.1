import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './src/server/db.js';
import { apiRouter } from './src/server/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  await initDb();

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // Security Headers (Bug 7, Bug 20)
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allows Vite dev scripts and inline CSS
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(cors());

  // Body Parsing limits (Bug 20)
  app.use(express.json({ limit: '500kb' }));
  app.use(express.urlencoded({ extended: true, limit: '500kb' }));

  // Brute-force protection for login (Bug 20)
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const checkinLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { error: 'Too many check-in requests. Please wait a moment.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/login', loginLimiter);
  app.use('/api/checkin', checkinLimiter);

  // Mount API Router
  app.use('/api', apiRouter);

  // Vite middleware in dev, static files in production
  if (isProd) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[GeoCampus Server] Running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error during GeoCampus server initialization:', err);
  process.exit(1);
});

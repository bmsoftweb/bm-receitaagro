import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createApp } from './server/app.js';
import { config } from './server/config.js';

/** Entrada para execução local. Na Vercel quem serve as rotas é api/index.ts. */
async function startServer() {
  const app = createApp();

  // ==========================================================
  // VITE / SPA
  // ==========================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`ReceitaWeb rodando em http://0.0.0.0:${config.port}`);
    console.log(`bmAPI: empresa ${config.idEmpresa}`);
    if (!config.sessionSecret) console.warn('ATENÇÃO: SESSION_SECRET não configurado no .env');
  });
}

startServer().catch((err) => {
  console.error('Falha crítica ao iniciar o ReceitaWeb:', err);
  process.exit(1);
});

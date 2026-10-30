import 'dotenv/config';
import express, { Request, Response } from 'express';
import { config, configPublica } from './config.js';
import { verificarBmapi } from './bmapi.js';
import { createAuthRouter, exigirSessao } from './auth.js';
import { createCadastrosRouter } from './cadastros.js';
import { createCompendioRouter } from './compendio.js';
import { createReceitasRouter } from './receitas.js';
import { createMovimentoRouter } from './movimento.js';

/**
 * Monta o app Express com todas as rotas /api, sem listen e sem Vite:
 *   local     -> server.ts adiciona o Vite e dá listen numa porta
 *   produção  -> api/index.ts exporta este app como função serverless da Vercel
 */
export function createApp() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // ==========================================================
  // 0. Autenticação (login é público; o resto exige sessão)
  // ==========================================================
  app.use('/api', createAuthRouter());
  app.use('/api', exigirSessao);

  // ==========================================================
  // 1. Saúde da bmAPI do servidor da sessão (header e painel)
  // ==========================================================
  app.get('/api/db/status', async (_req: Request, res: Response) => {
    res.json(await verificarBmapi());
  });

  app.get('/api/config', (_req: Request, res: Response) => {
    res.json(configPublica());
  });

  // ==========================================================
  // 2. Módulos
  // ==========================================================
  app.use('/api', createCadastrosRouter());
  app.use('/api', createCompendioRouter());
  app.use('/api', createReceitasRouter());
  app.use('/api', createMovimentoRouter());

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Rota não encontrada.' });
  });

  return app;
}

/**
 * Entrada do executável (ReceitaWeb.exe).
 *
 * Sobe o mesmo servidor Express da versão local, servindo o app já compilado (dist),
 * e abre o navegador padrão. Diferenças para o server.ts:
 *  - o .env e a pasta dist são procurados ao lado do .exe, não no diretório atual;
 *  - não há Vite: o .exe carrega o build feito antes de empacotar.
 */
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import express from 'express';
import dotenv from 'dotenv';

/** Pasta do .exe (ou do script, quando rodando pelo Node) */
const pastaApp = (process as any).pkg ? path.dirname(process.execPath) : process.cwd();

async function iniciar() {
  dotenv.config({ path: path.join(pastaApp, '.env') });

  // O app é importado depois do .env para que a configuração já esteja carregada
  const { createApp } = await import('./server/app.js');
  const { config } = await import('./server/config.js');

  const distPath = path.join(pastaApp, 'dist');
  if (!fs.existsSync(path.join(distPath, 'index.html'))) {
    console.error(`Pasta "dist" não encontrada em ${pastaApp}. Ela precisa ficar ao lado do executável.`);
    aguardarTecla();
    return;
  }

  const app = createApp();
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));

  const servidor = app.listen(config.port, '0.0.0.0', () => {
    const url = `http://localhost:${config.port}`;
    console.log(`ReceitaWeb rodando em ${url}`);
    console.log('Feche esta janela para encerrar o sistema.');
    if (!config.sessionSecret) console.warn('ATENÇÃO: SESSION_SECRET não configurado no .env');
    abrirNavegador(url);
  });

  servidor.on('error', (err: NodeJS.ErrnoException) => {
    console.error(
      err.code === 'EADDRINUSE'
        ? `A porta ${config.port} já está em uso. Feche o outro ReceitaWeb ou mude RECEITA_PORT no .env.`
        : `Falha ao iniciar: ${err.message}`,
    );
    aguardarTecla();
  });
}

function abrirNavegador(url: string) {
  const comando =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  spawn(comando[0] as string, comando[1] as string[], { detached: true, stdio: 'ignore' }).unref();
}

/** Mantém a janela aberta para o usuário ler o erro */
function aguardarTecla() {
  console.log('\nPressione Enter para fechar.');
  process.stdin.resume();
  process.stdin.once('data', () => process.exit(1));
}

iniciar().catch((err) => {
  console.error('Falha crítica ao iniciar o ReceitaWeb:', err);
  aguardarTecla();
});

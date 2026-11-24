/**
 * Atualização completa do compêndio central, em sequência (o que antes se rodava à mão):
 *   produtos (AGROFIT) -> bulas da ADAPAR (sem bula no AGROFIT) -> bulas novas/alteradas -> extrair tratamentos -> textos (EPI, precauções) -> de-para.
 * Cada etapa roda mesmo se a anterior falhar; o log fica em scripts/logs/compendio_AAAAMMDD_HHMM.log.
 * Duplo clique: scripts/Atualizar compendio.cmd (ou agendado no Agendador de Tarefas do Windows).
 *
 *   npx tsx scripts/atualizar-compendio.ts
 */
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { agoraISO } from '../server/bmapi.js';

const ETAPAS: [string, string[]][] = [
  ['Produtos do AGROFIT', ['scripts/carga-compendio.ts', 'produtos']],
  ['Bulas da ADAPAR (sem bula no AGROFIT)', ['scripts/carga-compendio.ts', 'adapar']],
  ['Bulas novas ou alteradas', ['scripts/carga-compendio.ts', 'bulas']],
  ['Tratamentos das bulas pendentes', ['scripts/carga-compendio.ts', 'extrair']],
  ['EPI, precauções, local e antídoto', ['scripts/carga-compendio.ts', 'textos']],
  ['De-para de culturas e pragas', ['scripts/depara-compendio.ts', 'casar']],
];

const pastaLogs = path.join('scripts', 'logs');
fs.mkdirSync(pastaLogs, { recursive: true });
const arquivo = path.join(pastaLogs, `compendio_${agoraISO().slice(0, 16).replace(/\D/g, '').replace(/^(\d{8})/, '$1_')}.log`);
const log = fs.createWriteStream(arquivo);
const escrever = (texto: string) => { process.stdout.write(texto); log.write(texto); };

/**
 * Andamento: etapa atual e percentual (da etapa e geral) no título da janela e numa linha da tela.
 * O percentual da etapa vem do que ela escreve: "7/38" (bulas) ou "x processando, y prontos" (lotes).
 */
function andamento(etapa: number, nome: string, fracao: number | null, extra = '') {
  const geral = Math.round(((etapa - 1 + (fracao ?? 0)) / ETAPAS.length) * 100);
  const daEtapa = fracao === null ? '' : ` ${Math.round(fracao * 100)}%`;
  process.title = `Compêndio ${geral}% - etapa ${etapa}/${ETAPAS.length}: ${nome}${daEtapa}`;
  if (fracao !== null || extra) escrever(`  >> Etapa ${etapa}/${ETAPAS.length}${daEtapa}${extra} | geral ${geral}%\n`);
}

/** Roda uma etapa e devolve a saída (para o resumo) */
function rodar(etapa: number, nome: string, args: string[]): Promise<{ ok: boolean; saida: string }> {
  return new Promise((ok) => {
    let saida = '';
    let ultimo = -1;
    // Comando inteiro numa string: os argumentos são fixos (ETAPAS), nada vem do usuário
    const p = spawn(`npx tsx ${args.join(' ')}`, { shell: true });
    const guardar = (d: Buffer) => {
      saida += d;
      escrever(String(d));
      for (const linha of String(d).split('\n')) {
        const contagem = linha.match(/^(\d+)\/(\d+) /);
        const lote = linha.match(/(\d+) processando, (\d+) prontos/);
        const pagina = linha.match(/^página \d+: (\d+) produtos/);
        const fracao = contagem ? Number(contagem[1]) / Number(contagem[2])
          : lote ? Number(lote[2]) / (Number(lote[1]) + Number(lote[2]) || 1) : null;
        if (fracao !== null) {
          // Na tela, só a cada 5% para não poluir; o título acompanha sempre
          const passo = Math.floor(fracao * 20);
          if (passo !== ultimo || lote) { ultimo = passo; andamento(etapa, nome, fracao); } else andamento(etapa, nome, null);
        } else if (pagina) andamento(etapa, nome, null, ` (${pagina[1]} produtos lidos do AGROFIT)`);
      }
    };
    p.stdout.on('data', guardar);
    p.stderr.on('data', guardar);
    p.on('close', (codigo) => ok({ ok: codigo === 0, saida }));
  });
}

const resumo: string[] = [];
let custo = 0;
let falhas = 0;
for (const [i, [nome, args]] of ETAPAS.entries()) {
  escrever(`\n===== ${agoraISO()} Etapa ${i + 1} de ${ETAPAS.length}: ${nome} =====\n`);
  andamento(i + 1, nome, 0);
  const { ok, saida } = await rodar(i + 1, nome, args);
  const gasto = [...saida.matchAll(/US\$ ([\d.]+)/g)].reduce((s, m) => s + Number(m[1]), 0);
  const erros = (saida.match(/: ERRO |^produto \d+: (?!gravado)/gm) || []).length;
  custo += gasto;
  if (!ok) falhas++;
  resumo.push(`${ok ? 'OK   ' : 'FALHOU'} ${nome}${gasto ? ` (US$ ${gasto.toFixed(2)})` : ''}${erros ? `, ${erros} item(ns) com erro` : ''}`);
}

process.title = `Compêndio 100% - ${falhas ? `${falhas} etapa(s) com falha` : 'concluído'}`;
escrever(`\n===== Resumo ${agoraISO()} =====\n${resumo.join('\n')}\nCusto da Claude: US$ ${custo.toFixed(2)}\nLog: ${path.resolve(arquivo)}\n`);
log.end();
process.exitCode = falhas ? 1 : 0;

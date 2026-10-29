import { AsyncLocalStorage } from 'async_hooks';
import type { Servidor } from './servidores.js';

/** Servidor da bmAPI da requisição atual (definido por comServidor em bmapi.ts) */
export const contextoServidor = new AsyncLocalStorage<Servidor>();

/** Regra de negócio: primeiro servidores.config do servidor da sessão, depois o .env */
function valor(chave: string): string | undefined {
  return contextoServidor.getStore()?.config[chave] ?? process.env[chave];
}

function simNao(valor: string | undefined, padrao: boolean): boolean {
  if (valor === undefined || valor.trim() === '') return padrao;
  return valor.trim().toUpperCase().startsWith('S');
}

function inteiro(valor: string | undefined, padrao: number): number {
  const n = Number(valor);
  return Number.isFinite(n) && valor !== undefined && valor.trim() !== '' ? Math.trunc(n) : padrao;
}

export const config = {
  port: inteiro(process.env.RECEITA_PORT, 3000),

  /** MySQL com o cadastro dos servidores da bmAPI (tabela servidores) */
  mysql: {
    host: process.env.MYSQL_HOST || '45.224.130.145',
    port: inteiro(process.env.MYSQL_PORT, 3306),
    user: process.env.MYSQL_USER || 'bmsoftadm',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'bmapi',
  },

  sessionSecret: process.env.SESSION_SECRET || '',

  // Por cliente: vêm de servidores.config (KEY=VALOR por linha); sem a chave, do .env
  get idEmpresa() { return inteiro(valor('ID_EMPRESA'), 1); },
  /** Exige o número CIDASC (enviado pelo receita_e.exe) para imprimir; padrão S, como no Delphi */
  get exigeCidascParaImprimir() { return simNao(valor('EXIGE_CIDASC_IMPRESSAO'), true); },
};

/** Configurações que o frontend precisa conhecer (sem nada sensível) */
export function configPublica() {
  return {
    idEmpresa: config.idEmpresa,
    exigeCidascParaImprimir: config.exigeCidascParaImprimir,
  };
}

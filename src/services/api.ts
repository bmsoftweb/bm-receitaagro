import { DbConnectionStatus, Usuario, Empresa, ServidorInfo } from '../types';

/**
 * O token de sessão acompanha toda requisição no header Authorization.
 * A chave da bmAPI fica só no servidor.
 */
let tokenAtual: string | null = null;
let aoExpirar: ((motivo: string) => void) | null = null;

export function setTokenSessao(token: string | null) {
  tokenAtual = token;
}

/** Chamado quando o servidor recusa a sessão (401), para voltar ao login */
export function onSessaoExpirada(fn: (motivo: string) => void) {
  aoExpirar = fn;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (tokenAtual) h.Authorization = `Bearer ${tokenAtual}`;
  return h;
}

async function parseOrThrow(res: Response): Promise<any> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || `Falha na requisição (HTTP ${res.status}).`;
    if (res.status === 401 && tokenAtual && aoExpirar) aoExpirar(msg);
    throw new Error(msg);
  }
  return data;
}

export async function get<T = any>(url: string): Promise<T> {
  return parseOrThrow(await fetch(url, { headers: headers() }));
}

export async function send<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  return parseOrThrow(
    await fetch(url, {
      method,
      headers: headers({ 'Content-Type': 'application/json' }),
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

// ------------------------------------------------------------
// Autenticação
// ------------------------------------------------------------
export async function login(
  servidor: number,
  email: string,
  senha: string,
): Promise<{ token: string; usuario: Usuario; empresa: Empresa; servidor: ServidorInfo }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ servidor, email, senha }),
  });
  return parseOrThrow(res);
}

export async function consultarServidor(numero: number): Promise<{ identificacao: string; connected: boolean; nomeEmpresa?: string | null; error?: string }> {
  return get(`/api/servidores/${numero}`);
}

export async function validarSessao(): Promise<{ usuario: Usuario; empresa: Empresa; servidor: ServidorInfo }> {
  return get('/api/auth/sessao');
}

export async function salvarMeusDados(dados: { email: string; paginaInicial: string; senha?: string; senhaConfirma?: string }): Promise<void> {
  await send('PUT', '/api/auth/meus-dados', dados);
}

// ------------------------------------------------------------
// Status da bmAPI
// ------------------------------------------------------------
export async function fetchDbStatus(): Promise<DbConnectionStatus> {
  return get('/api/db/status');
}

/** Monta a query string ignorando valores vazios */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const t = q.toString();
  return t ? `?${t}` : '';
}

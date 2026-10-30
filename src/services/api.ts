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

/** Andamento de uma ação longa (rotaProgresso no servidor) */
export interface Andamento { etapa: string; feitos: number; total: number }

/** POST numa rota com progresso: chama aoAvancar a cada etapa e devolve o resultado final */
export async function sendProgresso<T = any>(url: string, aoAvancar: (a: Andamento) => void): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: headers() });
  if (!res.ok || !res.body) return parseOrThrow(res);
  const leitor = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let resto = '';
  for (;;) {
    const { value, done } = await leitor.read();
    resto += value ?? '';
    const linhas = resto.split('\n');
    resto = done ? '' : linhas.pop() ?? '';
    for (const l of linhas.filter(Boolean)) {
      const o = JSON.parse(l);
      if (o.erro) throw new Error(o.erro);
      if ('ok' in o) return o.ok as T;
      aoAvancar(o as Andamento);
    }
    if (done) throw new Error('A conexão terminou antes do fim da atualização.');
  }
}

// ------------------------------------------------------------
// Autenticação
// ------------------------------------------------------------
export async function login(token: string): Promise<{ token: string; usuario: Usuario; empresa: Empresa; servidor: ServidorInfo }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  return parseOrThrow(res);
}

export async function consultarServidor(token: string): Promise<{ identificacao: string; connected: boolean; nomeEmpresa?: string | null; error?: string }> {
  return parseOrThrow(
    await fetch('/api/servidores/verificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }),
  );
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

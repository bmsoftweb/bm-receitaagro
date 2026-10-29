import { Empresa, ServidorInfo, Usuario } from '../types';

const SESSAO = 'receitaweb_sessao';
const TOKEN = 'receitaweb_token';

export interface SessaoSalva {
  token: string;
  usuario: Usuario;
  empresa: Empresa;
  servidor: ServidorInfo;
}

function seguro<T>(fn: () => T, padrao: T): T {
  try { return fn(); } catch { return padrao; }
}

export function lerSessao(): SessaoSalva | null {
  return seguro(() => {
    const bruto = localStorage.getItem(SESSAO) ?? sessionStorage.getItem(SESSAO);
    const sessao = bruto ? (JSON.parse(bruto) as SessaoSalva) : null;
    return sessao?.servidor ? sessao : null;
  }, null);
}

export function salvarSessao(sessao: SessaoSalva, lembrar: boolean) {
  seguro(() => {
    const destino = lembrar ? localStorage : sessionStorage;
    const outro = lembrar ? sessionStorage : localStorage;
    destino.setItem(SESSAO, JSON.stringify(sessao));
    outro.removeItem(SESSAO);
  }, undefined);
}

export function atualizarSessao(parcial: Partial<SessaoSalva>) {
  seguro(() => {
    for (const s of [localStorage, sessionStorage]) {
      const bruto = s.getItem(SESSAO);
      if (bruto) s.setItem(SESSAO, JSON.stringify({ ...JSON.parse(bruto), ...parcial }));
    }
  }, undefined);
}

export function limparSessao() {
  seguro(() => {
    localStorage.removeItem(SESSAO);
    sessionStorage.removeItem(SESSAO);
  }, undefined);
}

export function lerTokenLembrado(): string {
  return seguro(() => localStorage.getItem(TOKEN) || '', '');
}
export function lembrarToken(token: string | null) {
  seguro(() => (token ? localStorage.setItem(TOKEN, token) : localStorage.removeItem(TOKEN)), undefined);
}

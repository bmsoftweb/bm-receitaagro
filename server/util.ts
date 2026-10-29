import { Request, Response, NextFunction, RequestHandler } from 'express';

/** Envolve a rota: qualquer erro vira { error } com o status do BmapiError (ou 500) */
export function rota(fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req: Request, res: Response, _next: NextFunction) => {
    fn(req, res).catch((err: any) => {
      console.error(`[erro] ${req.method} ${req.originalUrl}: ${err?.message}`);
      if (!res.headersSent) res.status(err?.status || 500).json({ error: err?.message || 'Erro inesperado.' });
    });
  };
}

/** Texto limpo do corpo, cortado no tamanho do campo */
export function texto(valor: unknown, max: number): string {
  return String(valor ?? '').trim().slice(0, max);
}

export function maiusculo(valor: unknown, max: number): string {
  return texto(valor, max).toUpperCase();
}

export function soDigitos(valor: unknown, max: number): string {
  return String(valor ?? '').replace(/\D/g, '').slice(0, max);
}

/** Maiúsculas sem acento (padrão dos nomes que vêm da API do Novo Receituário) */
export function semAcento(valor: unknown): string {
  return String(valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** CPF (11) ou CNPJ (14) com dígito verificador; vazio é aceito */
export function documentoValido(doc: string): boolean {
  if (!doc) return true;
  if (/^(\d)\1+$/.test(doc)) return false;
  const dv = (base: string, pesos: number[]) => {
    const soma = pesos.reduce((s, p, i) => s + Number(base[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  if (doc.length === 11) {
    const d1 = dv(doc, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = dv(doc, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return doc.endsWith(`${d1}${d2}`);
  }
  if (doc.length === 14) {
    const d1 = dv(doc, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = dv(doc, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return doc.endsWith(`${d1}${d2}`);
  }
  return false;
}

export function idParam(req: Request, nome = 'id'): number {
  const n = Number(req.params[nome]);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Texto de busca para LIKE 'xxx%' (DBISAM compara com maiúsculas via UPPER) */
export function busca(valor: unknown): string {
  return `${String(valor ?? '').trim().toUpperCase()}%`;
}

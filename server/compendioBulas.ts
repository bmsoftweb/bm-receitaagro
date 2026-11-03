import { Router, Request, Response, NextFunction } from 'express';
import mysql from 'mysql2/promise';
import { config, contextoServidor } from './config.js';
import { agoraISO } from './bmapi.js';
import { rota, idParam, texto } from './util.js';

/**
 * Conferência do compêndio próprio (bulas lidas pela Claude, MySQL central receitaagro).
 * A base vale para todos os clientes: só administradores dos servidores em
 * COMPENDIO_SERVIDORES (números separados por vírgula, no .env/Vercel) entram aqui.
 */

const { host, port, user, password, databaseCompendio } = config.mysql;
export const pool = mysql.createPool({ host, port, user, password, database: databaseCompendio, connectionLimit: 3, connectTimeout: 20000, enableKeepAlive: true, dateStrings: true,
  // O MySQL derruba conexão parada (ECONNRESET): fecha as ociosas antes de serem reaproveitadas
  maxIdle: 0, idleTimeout: 20000 });

export function podeConferirCompendio(req: Request): boolean {
  const numero = contextoServidor.getStore()?.numero;
  const lista = String(process.env.COMPENDIO_SERVIDORES || '').split(',').map((s) => Number(s.trim())).filter(Boolean);
  return req.usuario?.nivel === 'A' && !!numero && lista.includes(numero);
}

function exigirConferente(req: Request, res: Response, next: NextFunction) {
  if (!podeConferirCompendio(req)) return res.status(403).json({ error: 'A conferência do compêndio é restrita aos administradores da BMsoft.' });
  next();
}

/** Situação para o filtro da lista */
const FILTROS: Record<string, string> = {
  conferir: "p.status_extracao = 'extraido' AND COALESCE(t.conferidos, 0) < COALESCE(t.total, 0)",
  aviso: "p.status_extracao = 'extraido' AND p.erro_extracao IS NOT NULL",
  conferidos: "p.status_extracao = 'extraido' AND t.total > 0 AND t.conferidos = t.total",
  erro: "p.status_extracao IN ('erro', 'incompleto', 'pendente')",
  sem_bula: "p.status_extracao = 'sem_bula'",
};

/** Tabelas do de-para; fracas = regras que pedem revisão */
const DEPARA: Record<string, { tabela: string; catalogo: string; id: string; textos: string[]; contagem: string; fracas: string }> = {
  culturas: {
    tabela: 'compendio_depara_culturas', catalogo: 'compendio_culturas', id: 'cultura_id', textos: ['nome'],
    contagem: 'SELECT cultura nome, COUNT(*) n FROM compendio_tratamentos GROUP BY cultura', fracas: "'prefixo', 'apelido', 'todas'",
  },
  pragas: {
    tabela: 'compendio_depara_pragas', catalogo: 'compendio_pragas', id: 'praga_id', textos: ['praga_comum', 'praga_cientifico'],
    contagem: "SELECT COALESCE(praga_comum, '') praga_comum, COALESCE(praga_cientifico, '') praga_cientifico, COUNT(*) n FROM compendio_tratamentos GROUP BY 1, 2",
    fracas: "'nome', 'genero', 'generica'",
  },
};

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const inteiro = (v: unknown) => { const n = num(v); return n === null || !Number.isFinite(n) ? null : Math.trunc(n); };
const decimal = (v: unknown) => { const n = num(v); return n === null || !Number.isFinite(n) ? null : n; };
const conferente = (req: Request) => `${req.usuario?.nome || ''} (${contextoServidor.getStore()?.identificacao || ''})`.slice(0, 100);

export function createCompendioBulasRouter() {
  const r = Router();

  r.get('/compendio-bulas/acesso', (req, res) => { res.json({ pode: podeConferirCompendio(req) }); });

  r.use('/compendio-bulas', exigirConferente);

  r.get('/compendio-bulas/produtos', rota(async (req, res) => {
    const q = texto(req.query.q, 100);
    const filtro = FILTROS[String(req.query.situacao || '')];
    const where = ['p.ativo = 1'];
    const valores: unknown[] = [];
    if (q) { where.push('(p.marca LIKE ? OR p.registro_mapa = ? OR p.ingrediente_ativo LIKE ?)'); valores.push(`%${q}%`, q.replace(/\D/g, ''), `%${q}%`); }
    if (filtro) where.push(filtro);
    const [linhas] = await pool.query<any[]>(
      `SELECT p.id, p.registro_mapa, p.marca, p.titular, p.classe, p.ingrediente_ativo, p.data_bula, p.status_extracao, p.erro_extracao,
              COALESCE(t.total, 0) total, COALESCE(t.conferidos, 0) conferidos, COALESCE(t.inferidos, 0) inferidos
         FROM compendio_produtos p
         LEFT JOIN (SELECT produto_id, COUNT(*) total, SUM(conferido) conferidos, SUM(inferido) inferidos FROM compendio_tratamentos GROUP BY produto_id) t
           ON t.produto_id = p.id
        WHERE ${where.join(' AND ')}
        ORDER BY p.marca`,
      valores,
    );
    res.json(linhas.map((p) => ({
      id: p.id, registroMapa: p.registro_mapa, marca: p.marca, titular: p.titular || '', classe: p.classe || '',
      ingredienteAtivo: p.ingrediente_ativo || '', dataBula: p.data_bula || '',
      status: p.status_extracao, aviso: p.erro_extracao || '',
      tratamentos: Number(p.total), conferidos: Number(p.conferidos), inferidos: Number(p.inferidos),
    })));
  }));

  r.get('/compendio-bulas/produtos/:id/tratamentos', rota(async (req, res) => {
    const [linhas] = await pool.query<any[]>(
      `SELECT id, cultura, praga_comum, praga_cientifico, dose_min, dose_max, unidade_dose, volume_calda, aplic_min, aplic_max,
              intervalo_aplic_dias, carencia_dias, epoca_aplicacao, observacao, inferido, conferido, conferido_por, conferido_em
         FROM compendio_tratamentos WHERE produto_id = ? ORDER BY cultura, praga_comum, id`,
      [idParam(req)],
    );
    res.json(linhas.map(tratamento));
  }));

  /** PDF da bula guardado na carga (compendio_bulas) */
  r.get('/compendio-bulas/produtos/:id/bula', rota(async (req, res) => {
    const [[b]] = await pool.query<any[]>(
      'SELECT b.pdf, p.registro_mapa FROM compendio_bulas b JOIN compendio_produtos p ON p.id = b.produto_id WHERE b.produto_id = ?',
      [idParam(req)],
    );
    if (!b) return res.status(404).json({ error: 'A bula deste produto não foi baixada.' });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="bula-${b.registro_mapa}.pdf"` }).send(b.pdf);
  }));

  /** Alterar e conferir: salvar já marca como conferido */
  r.put('/compendio-bulas/tratamentos/:id', rota(async (req, res) => {
    const t = req.body || {};
    if (!texto(t.cultura, 100)) return res.status(400).json({ error: 'Informe a cultura.' });
    const conferido = t.conferido !== false;
    await pool.query(
      `UPDATE compendio_tratamentos SET cultura = ?, praga_comum = ?, praga_cientifico = ?, dose_min = ?, dose_max = ?, unidade_dose = ?,
         volume_calda = ?, aplic_min = ?, aplic_max = ?, intervalo_aplic_dias = ?, carencia_dias = ?, epoca_aplicacao = ?, observacao = ?,
         conferido = ?, conferido_por = ?, conferido_em = ?
       WHERE id = ?`,
      [texto(t.cultura, 100), texto(t.pragaComum, 200) || null, texto(t.pragaCientifico, 200) || null, decimal(t.doseMin), decimal(t.doseMax),
        texto(t.unidadeDose, 50) || null, texto(t.volumeCalda, 100) || null, inteiro(t.aplicMin), inteiro(t.aplicMax), inteiro(t.intervaloAplicDias),
        inteiro(t.carenciaDias), texto(t.epocaAplicacao, 2000) || null, texto(t.observacao, 2000) || null,
        conferido ? 1 : 0, conferido ? conferente(req) : null, conferido ? agoraISO() : null, idParam(req)],
    );
    res.json({ ok: true });
  }));

  /** Marca como conferidos os tratamentos informados (ou todos os pendentes do produto) */
  r.post('/compendio-bulas/produtos/:id/conferir', rota(async (req, res) => {
    const ids: number[] = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
    const [r2]: any = await pool.query(
      `UPDATE compendio_tratamentos SET conferido = 1, conferido_por = ?, conferido_em = ?
        WHERE produto_id = ? AND conferido = 0${ids.length ? ' AND id IN (?)' : ''}`,
      [conferente(req), agoraISO(), idParam(req), ...(ids.length ? [ids] : [])],
    );
    res.json({ conferidos: r2.affectedRows });
  }));

  r.delete('/compendio-bulas/tratamentos/:id', rota(async (req, res) => {
    await pool.query('DELETE FROM compendio_tratamentos WHERE id = ?', [idParam(req)]);
    res.json({ ok: true });
  }));

  // ---------------- De-para de culturas e pragas (scripts/depara-compendio.ts) ----------------
  /** Lista do de-para; o id é só a posição (a chave é o texto da bula) */
  r.get('/compendio-bulas/depara/:tipo', rota(async (req, res) => {
    const d = DEPARA[req.params.tipo as string];
    if (!d) return res.status(404).json({ error: 'Tipo inválido.' });
    const q = texto(req.query.q, 100);
    const where: string[] = [];
    const valores: unknown[] = [];
    const situacao = String(req.query.situacao || '');
    if (situacao === 'sem') where.push(`d.${d.id} IS NULL`);
    if (situacao === 'revisar') where.push(`d.conferido = 0 AND d.${d.id} IS NOT NULL AND d.regra IN (${d.fracas})`);
    if (situacao === 'conferidos') where.push('d.conferido = 1');
    if (q) { where.push(`(${d.textos.map((t) => `d.${t} LIKE ?`).join(' OR ')} OR c.nome LIKE ?)`); valores.push(...d.textos.map(() => `%${q}%`), `%${q}%`); }
    const [linhas] = await pool.query<any[]>(
      `SELECT ${d.textos.map((t) => `d.${t}`).join(', ')}, d.${d.id} item_id, c.nome item_nome, c.nome_cientifico item_cientifico, d.regra, d.conferido,
              COALESCE(t.n, 0) linhas
         FROM ${d.tabela} d LEFT JOIN ${d.catalogo} c ON c.id = d.${d.id}
         LEFT JOIN (${d.contagem}) t ON ${d.textos.map((x) => `t.${x} = d.${x}`).join(' AND ')}
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY linhas DESC`,
      valores,
    );
    res.json(linhas.map((l, i) => ({
      id: i + 1, texto: l[d.textos[0]], cientifico: d.textos[1] ? l[d.textos[1]] : '', itemId: l.item_id, itemNome: l.item_nome || '',
      itemCientifico: l.item_cientifico || '', regra: l.regra, conferido: !!l.conferido, linhas: Number(l.linhas),
    })));
  }));

  /** Busca no catálogo (compendio_culturas / compendio_pragas) para a pesquisa da tela */
  r.get('/compendio-bulas/catalogo/:tipo', rota(async (req, res) => {
    const d = DEPARA[req.params.tipo as string];
    if (!d) return res.status(404).json({ error: 'Tipo inválido.' });
    const q = texto(req.query.q, 100);
    const [linhas] = await pool.query<any[]>(
      `SELECT id, nome, nome_cientifico FROM ${d.catalogo} WHERE ativo = 1 AND (nome LIKE ? OR nome_cientifico LIKE ? OR id = ?) ORDER BY nome LIMIT 50`,
      [`%${q}%`, `%${q}%`, Number(q) || 0],
    );
    res.json(linhas.map((c) => ({ id: c.id, descricao: c.nome_cientifico ? `${c.nome} (${c.nome_cientifico})` : c.nome })));
  }));

  /** Grava a correspondência escolhida (ou confirma a sugestão) e marca como conferida */
  r.put('/compendio-bulas/depara/:tipo', rota(async (req, res) => {
    const d = DEPARA[req.params.tipo as string];
    if (!d) return res.status(404).json({ error: 'Tipo inválido.' });
    const b = req.body || {};
    const itemId = inteiro(b.itemId);
    const chave = [String(b.texto ?? ''), String(b.cientifico ?? '')].slice(0, d.textos.length);
    // A regra vem antes: o MySQL aplica o SET da esquerda para a direita
    const [r2]: any = await pool.query(
      `UPDATE ${d.tabela} SET regra = IF(${d.id} <=> ?, regra, 'manual'), ${d.id} = ?, conferido = 1
        WHERE ${d.textos.map((t) => `${t} = ?`).join(' AND ')}`,
      [itemId, itemId, ...chave],
    );
    if (!r2.affectedRows) return res.status(404).json({ error: 'Item do de-para não encontrado.' });
    res.json({ ok: true });
  }));

  return r;
}

function tratamento(t: any) {
  return {
    id: t.id, cultura: t.cultura, pragaComum: t.praga_comum || '', pragaCientifico: t.praga_cientifico || '',
    doseMin: num(t.dose_min), doseMax: num(t.dose_max), unidadeDose: t.unidade_dose || '', volumeCalda: t.volume_calda || '',
    aplicMin: t.aplic_min, aplicMax: t.aplic_max, intervaloAplicDias: t.intervalo_aplic_dias, carenciaDias: t.carencia_dias,
    epocaAplicacao: t.epoca_aplicacao || '', observacao: t.observacao || '', inferido: !!t.inferido, conferido: !!t.conferido,
    conferidoPor: t.conferido_por || '', conferidoEm: t.conferido_em || '',
  };
}

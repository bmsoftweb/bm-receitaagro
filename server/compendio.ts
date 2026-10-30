import { Router } from 'express';
import {
  consultar, consultarUm, consultarComLimite, executar, executarScript, lerMemo, BmapiError, sqlTexto, sqlNumero, sqlInteiro,
  sqlListaInteiros, tabelaMemoria,
} from './bmapi.js';
import { rota, rotaProgresso, texto, maiusculo, idParam, busca, semAcento } from './util.js';
import { atualizarCatalogo, acertarTabelas, buscarTratamentosDoProduto } from './novorec.js';
import { atualizarTabelasCidasc } from './cidasc.js';

/**
 * Compêndio (ufrmDefensivosNovo, ufrmCulturasNovo, ufrmPragasNovo, ufrmProBM, ufrmProCIDASC):
 * defensivos, culturas e pragas do Novo Receituário, vínculo com produtos do ERP e com a CIDASC,
 * e os tratamentos (dosagens) de cada defensivo.
 */

const MEMOS = [
  'MODO_APLICACAO', 'PREVENCAO', 'ANTIDOTO', 'INCOMPATIBILIDADE', 'PRECAUCOES_USO', 'EPI', 'RISCO', 'EQUIP_APLICACAO',
] as const;

const NUMEROS_TRAT = {
  SEQ: 0, INTERVALO_SEGURANCA: 0, VOLUME_CALDA: 0, VOLUME_CALDA_AEREA: 0, MINIMO_APLICACOES: 0, MAXIMO_APLICACOES: 0,
} as const;
const TEXTOS_TRAT = {
  CLASSIFICACAO_TOXICOLOGICA: 200, NOME_INGREDIENTES: 500, UNIDADE_APLICACAO: 30, ESTAGIO_CULTURA: 50,
  ESTAGIO_PROBLEMA: 50, LOCAL_APLICACAO: 200, FRASE_1: 500, FRASE_2: 500, MODALIDADE_APLICACAO: 80,
} as const;

/** Colunas do tratamento para listagem (sem memos), já em minúsculas pelo normalizador */
export const SQL_TRATAMENTO = `
  SELECT A.ID, A.ID_PRODUTO, A.ID_CULTURA, A.ID_PRAGA, A.SEQ, A.CLASSIFICACAO_TOXICOLOGICA, A.NOME_INGREDIENTES,
         A.INTERVALO_SEGURANCA, A.DOSE_MINIMA, A.DOSE_MAXIMA, A.UNIDADE_APLICACAO, A.VOLUME_CALDA, A.VOLUME_CALDA_AEREA,
         A.MINIMO_APLICACOES, A.MAXIMO_APLICACOES, A.ESTAGIO_CULTURA, A.ESTAGIO_PROBLEMA, A.LOCAL_APLICACAO,
         A.MODALIDADE_APLICACAO, A.FRASE_1, A.FRASE_2, A.ESTADOS_RESTRITOS, A.RESTRICAO_APLICACAO,
         C.NOME CULTURA, P.NOME PRAGA, P.NOME_CIENTIFICO PRAGA_CIENTIFICO
    FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO A
    LEFT JOIN REC_NOVOREC_CULTURAS C ON C.ID = A.ID_CULTURA
    LEFT JOIN REC_NOVOREC_PRAGAS P ON P.ID = A.ID_PRAGA`;

export function mapearTratamento(t: Record<string, any>) {
  const s = (v: unknown) => String(v ?? '').trim();
  return {
    id: Number(t.id),
    idProduto: Number(t.id_produto || 0),
    idCultura: Number(t.id_cultura || 0),
    idPraga: Number(t.id_praga || 0),
    cultura: s(t.cultura),
    praga: s(t.praga),
    pragaCientifico: s(t.praga_cientifico),
    seq: Number(t.seq || 0),
    classificacaoToxicologica: s(t.classificacao_toxicologica),
    nomeIngredientes: s(t.nome_ingredientes),
    intervaloSeguranca: Number(t.intervalo_seguranca || 0),
    doseMinima: Number(t.dose_minima || 0),
    doseMaxima: Number(t.dose_maxima || 0),
    unidadeAplicacao: s(t.unidade_aplicacao),
    volumeCalda: Number(t.volume_calda || 0),
    volumeCaldaAerea: Number(t.volume_calda_aerea || 0),
    minimoAplicacoes: Number(t.minimo_aplicacoes || 0),
    maximoAplicacoes: Number(t.maximo_aplicacoes || 0),
    estagioCultura: s(t.estagio_cultura),
    estagioProblema: s(t.estagio_problema),
    localAplicacao: s(t.local_aplicacao),
    modalidadeAplicacao: s(t.modalidade_aplicacao),
    frase1: s(t.frase_1),
    frase2: s(t.frase_2),
    estadosRestritos: s(t.estados_restritos),
    restricaoAplicacao: s(t.restricao_aplicacao),
  };
}

/** Os 8 memos do tratamento, completos (rota /blob da bmAPI) */
export async function memosTratamento(id: number): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const m of MEMOS) {
    out[m.toLowerCase()] = await lerMemo(`SELECT ${m} FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO WHERE ID = :id`, { id });
  }
  return out;
}

/**
 * Linhas repetidas do REC_DEFENSIVOS (mesmo ID_NOVOREC, criadas pela atualização do Delphi).
 * Agrupa só pelo produto NovoRec: o mesmo ID_CIDASC pode valer para vários produtos.
 * Fica a linha com mais dados (CIDASC, produto do ERP, manual); só sai a que não tem nada
 * diferente dela e não veio do compêndio antigo (ID_INTEGRACAO/ID_IMP, usados em tabelas protegidas).
 */
async function duplicadosDefensivos() {
  const m = tabelaMemoria('DD');
  const linhas: any[] = [];
  try {
    await executar(`SELECT ID_NOVOREC, COUNT(*) N INTO ${m} FROM REC_DEFENSIVOS WHERE ID_NOVOREC IS NOT NULL GROUP BY ID_NOVOREC`);
    // Em páginas pelo ID: a bmAPI corta resultados grandes
    for (let ultimo = 0; ;) {
      const pagina = await consultarComLimite(
        `SELECT A.ID id, A.ID_NOVOREC nr, A.ID_BM id_bm, A.ID_CIDASC id_cidasc, A.ID_INTEGRACAO integ, A.ID_IMP imp, A.MANUAL manual
           FROM REC_DEFENSIVOS A INNER JOIN ${m} M ON M.ID_NOVOREC = A.ID_NOVOREC
          WHERE M.N > 1 AND A.ID > ${ultimo} ORDER BY id TOP 300`,
      );
      linhas.push(...pagina.rows);
      if (pagina.truncated) throw new BmapiError('A bmAPI cortou a consulta dos duplicados; limpeza não feita.');
      if (pagina.rows.length < 300) break;
      ultimo = Number(pagina.rows[pagina.rows.length - 1].id);
    }
  } finally {
    await executar(`DROP TABLE IF EXISTS ${m}`).catch(() => {});
  }
  const ids = linhas.map((r) => Number(r.id));
  const comBm = new Set(ids.length
    ? (await consultar(`SELECT ID_DEF id FROM REC_DEFENSIVOS_BM WHERE ID_DEF IN (${sqlListaInteiros(ids)}) GROUP BY ID_DEF`)).map((r) => Number(r.id))
    : []);

  const num = (v: unknown) => Number(v || 0);
  const txt = (v: unknown) => String(v ?? '').trim();
  const pontos = (r: any) =>
    (num(r.id_cidasc) ? 8 : 0) + (num(r.id_bm) || comBm.has(num(r.id)) ? 4 : 0) + (txt(r.manual) === 'S' ? 2 : 0) + (txt(r.integ) || num(r.imp) ? 1 : 0);
  const grupos = new Map<number, any[]>();
  for (const r of linhas) grupos.set(num(r.nr), [...(grupos.get(num(r.nr)) || []), r]);

  const limpezas: { fica: number; saem: number[] }[] = [];
  let conflitos = 0;
  for (const g of grupos.values()) {
    const fica = [...g].sort((a, b) => pontos(b) - pontos(a) || num(a.id) - num(b.id))[0];
    const outras = g.filter((r) => r !== fica);
    const saem = outras.filter((r) =>
      !txt(r.integ) && !num(r.imp)
      && (!num(r.id_cidasc) || num(r.id_cidasc) === num(fica.id_cidasc))
      && (!num(r.id_bm) || num(r.id_bm) === num(fica.id_bm))
      && (txt(r.manual) !== 'S' || txt(fica.manual) === 'S'));
    if (saem.length < outras.length) conflitos++;
    if (saem.length) limpezas.push({ fica: num(fica.id), saem: saem.map((r) => num(r.id)) });
  }
  return { limpezas, produtos: grupos.size, conflitos };
}

export function createCompendioRouter() {
  const r = Router();

  // ======================= Defensivos =======================
  r.get('/defensivos', rota(async (req, res) => {
    const rows = await consultar(
      `SELECT A.ID id, A.NOME nome, A.REGISTRO_MAPA mapa, A.ATIVO ativo, B.ID id_def, B.ID_BM id_bm,
              B.ID_CIDASC id_cidasc, B.MANUAL manual
         FROM REC_NOVOREC_DEFENSIVOS A
         LEFT JOIN REC_DEFENSIVOS B ON B.ID_NOVOREC = A.ID
        WHERE UPPER(A.NOME) LIKE :q
        ORDER BY A.NOME TOP 501`,
      { q: busca(req.query.q) },
    );
    const contagem = await consultar('SELECT ID_PRODUTO id, COUNT(*) n FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO GROUP BY ID_PRODUTO');
    const qtd = new Map(contagem.map((c) => [Number(c.id), Number(c.n)]));
    res.json({
      truncated: rows.length > 500,
      defensivos: rows.slice(0, 500).map((d) => ({
        id: Number(d.id),
        nome: String(d.nome || '').trim(),
        registroMapa: String(d.mapa || '').trim(),
        ativo: d.ativo !== false,
        idDef: Number(d.id_def || 0),
        idBm: Number(d.id_bm || 0),
        idCidasc: Number(d.id_cidasc || 0),
        cidascManual: String(d.manual || '').trim() === 'S',
        tratamentos: qtd.get(Number(d.id)) || 0,
      })),
    });
  }));

  const dadosDefensivo = (b: any) => {
    const nome = maiusculo(semAcento(b.nome), 80);
    if (!nome) throw new BmapiError('Informe o nome do defensivo.');
    return { nome, mapa: texto(b.registroMapa, 15), ativo: b.ativo !== false };
  };

  r.post('/defensivos', rota(async (req, res) => {
    const d = dadosDefensivo(req.body || {});
    // O id é o da API; defensivo criado à mão recebe um id acima de 900000 para não colidir
    const ult = await consultarUm('SELECT MAX(ID) m FROM REC_NOVOREC_DEFENSIVOS');
    const id = Math.max(900000, Number(ult?.m || 0)) + 1;
    await executar('INSERT INTO REC_NOVOREC_DEFENSIVOS (ID, NOME, REGISTRO_MAPA, ATIVO) VALUES (:id, :nome, :mapa, :ativo)', { id, ...d });
    res.json({ id });
  }));

  r.put('/defensivos/:id', rota(async (req, res) => {
    const d = dadosDefensivo(req.body || {});
    await executar('UPDATE REC_NOVOREC_DEFENSIVOS SET NOME = :nome, REGISTRO_MAPA = :mapa, ATIVO = :ativo WHERE ID = :id', {
      ...d, id: idParam(req),
    });
    res.json({ ok: true });
  }));

  r.delete('/defensivos/:id', rota(async (req, res) => {
    const id = idParam(req);
    const uso = await consultarUm('SELECT COUNT(*) n FROM REC_RECEITAS_PRO WHERE ID_NOVOREC = :id', { id });
    if (Number(uso?.n || 0)) throw new BmapiError('Este defensivo já foi usado em receita. Desative-o em vez de excluir.');
    await executarScript([
      `DELETE FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO WHERE ID_PRODUTO = ${sqlInteiro(id)}`,
      `DELETE FROM REC_NOVOREC_DEFENSIVOS WHERE ID = ${sqlInteiro(id)}`,
    ]);
    res.json({ ok: true });
  }));

  /** Garante a linha-ponte REC_DEFENSIVOS do defensivo NovoRec e devolve o id dela */
  async function ponte(idNovoRec: number): Promise<number> {
    const achar = () => consultarUm('SELECT ID id FROM REC_DEFENSIVOS WHERE ID_NOVOREC = :id ORDER BY ID TOP 1', { id: idNovoRec });
    let p = await achar();
    if (!p) {
      const def = await consultarUm('SELECT REGISTRO_MAPA mapa FROM REC_NOVOREC_DEFENSIVOS WHERE ID = :id', { id: idNovoRec });
      if (!def) throw new BmapiError('Defensivo não encontrado.', 404);
      await executar('INSERT INTO REC_DEFENSIVOS (ID_NOVOREC, ID_MAPA) VALUES (:id, :mapa)', { id: idNovoRec, mapa: String(def.mapa || '').trim() });
      p = await achar();
    }
    return Number(p!.id);
  }

  // ---- Produtos do ERP associados (REC_DEFENSIVOS_BM) ----
  r.get('/defensivos/:id/bm', rota(async (req, res) => {
    const rows = await consultar(
      `SELECT A.ID_BM id, P.DESCRICAO descricao, P.UNVENDA un
         FROM REC_DEFENSIVOS_BM A
         INNER JOIN REC_DEFENSIVOS B ON B.ID = A.ID_DEF
         LEFT JOIN PRODUTOSPRINCIPAL P ON P.ID = A.ID_BM
        WHERE B.ID_NOVOREC = :id
        ORDER BY P.DESCRICAO`,
      { id: idParam(req) },
    );
    res.json(rows.map((p) => ({ id: Number(p.id), descricao: String(p.descricao || '').trim(), un: String(p.un || '').trim() })));
  }));

  r.get('/produtos-erp', rota(async (req, res) => {
    const rows = await consultar(
      `SELECT ID id, DESCRICAO descricao, MARCA marca, PRECOVENDA1 preco, UNVENDA un
         FROM PRODUTOSPRINCIPAL
        WHERE UPPER(DESCRICAO) LIKE :q
        ORDER BY DESCRICAO TOP 100`,
      { q: busca(req.query.q) },
    );
    res.json(rows.map((p) => ({
      id: Number(p.id), descricao: String(p.descricao || '').trim(), marca: String(p.marca || '').trim(),
      preco: Number(p.preco || 0), un: String(p.un || '').trim(),
    })));
  }));

  /** Troca a lista de produtos do ERP associados ao defensivo (lista vazia desfaz a associação) */
  r.put('/defensivos/:id/bm', rota(async (req, res) => {
    const id = idParam(req);
    const ids: number[] = [...new Set<number>((req.body?.ids || []).map((x: unknown) => Math.trunc(Number(x))).filter((x: number) => x > 0))];
    const idDef = await ponte(id);
    if (ids.length) {
      const outro = await consultarUm(
        `SELECT A.ID_BM id_bm, N.NOME nome FROM REC_DEFENSIVOS_BM A
           LEFT JOIN REC_DEFENSIVOS B ON B.ID = A.ID_DEF
           LEFT JOIN REC_NOVOREC_DEFENSIVOS N ON N.ID = B.ID_NOVOREC
          WHERE A.ID_BM IN (${ids.join(',')}) AND A.ID_DEF <> ${sqlInteiro(idDef)} TOP 1`,
      );
      if (outro) {
        throw new BmapiError(`Produto do BM id ${outro.id_bm} já está associado ao produto: ${String(outro.nome || '').trim()}`);
      }
    }
    await executarScript([
      `DELETE FROM REC_DEFENSIVOS_BM WHERE ID_DEF = ${sqlInteiro(idDef)}`,
      ...ids.map((b) => `INSERT INTO REC_DEFENSIVOS_BM (ID_BM, ID_DEF) VALUES (${b}, ${sqlInteiro(idDef)})`),
      `UPDATE REC_DEFENSIVOS SET ID_BM = ${ids.length ? ids[ids.length - 1] : 'NULL'},
              ID_MAPA = (SELECT REGISTRO_MAPA FROM REC_NOVOREC_DEFENSIVOS WHERE ID = ${sqlInteiro(id)})
        WHERE ID = ${sqlInteiro(idDef)}`,
    ]);
    res.json({ ok: true });
  }));

  // ---- CIDASC ----
  r.get('/cidasc/defensivos', rota(async (req, res) => {
    const rows = await consultar(
      `SELECT IDAGROTOXICO id, NRREGISTROMAPA mapa, NMMARCACOMERCIAL nome, CSSITUACAO situacao
         FROM REC_DEFENSIVOS_CIDASC
        WHERE UPPER(NMMARCACOMERCIAL) LIKE :q OR NRREGISTROMAPA LIKE :mapa
        ORDER BY NMMARCACOMERCIAL TOP 100`,
      { q: busca(req.query.q), mapa: `${String(req.query.q || '').trim() || '#'}%` },
    );
    res.json(rows.map((c) => ({
      id: Number(c.id), registroMapa: String(c.mapa || '').trim(), nome: String(c.nome || '').trim(), situacao: String(c.situacao || '').trim(),
    })));
  }));

  /** Vincula o código CIDASC à mão (manual = 'S': a atualização automática não sobrescreve) */
  r.put('/defensivos/:id/cidasc', rota(async (req, res) => {
    const id = idParam(req);
    const idCidasc = Math.trunc(Number(req.body?.idCidasc) || 0);
    const mapa = texto(req.body?.registroMapa, 15);
    const idDef = await ponte(id);
    await executarScript([
      `UPDATE REC_DEFENSIVOS SET ID_CIDASC = ${idCidasc || 'NULL'}, ID_MAPA = ${sqlTexto(mapa)}, MANUAL = 'S' WHERE ID = ${sqlInteiro(idDef)}`,
      ...(mapa ? [`UPDATE REC_NOVOREC_DEFENSIVOS SET REGISTRO_MAPA = ${sqlTexto(mapa)} WHERE ID = ${sqlInteiro(id)}`] : []),
    ]);
    res.json({ ok: true });
  }));

  // ---- Ações da API e manutenção ----
  r.post('/defensivos/atualizar', rotaProgresso((progresso) => atualizarCatalogo(progresso)));

  /** Agrotóxicos, culturas e pragas da CIDASC (SIGEN de rec_config.url_ws) */
  r.post('/cidasc/atualizar-tabelas', rotaProgresso((progresso) => atualizarTabelasCidasc(progresso)));

  /** Prévia (?simular=S) ou limpeza das linhas repetidas do REC_DEFENSIVOS */
  r.post('/defensivos/limpar-duplicados', rota(async (req, res) => {
    const { limpezas, produtos, conflitos } = await duplicadosDefensivos();
    const linhas = limpezas.reduce((t, l) => t + l.saem.length, 0);
    if (req.query.simular !== 'S') {
      // Quem apontava para a linha apagada passa a apontar para a que fica
      await executarScript(limpezas.flatMap(({ fica, saem }) => {
        const lista = sqlListaInteiros(saem);
        return [
          `UPDATE REC_DEFENSIVOS_BM SET ID_DEF = ${fica} WHERE ID_DEF IN (${lista})`,
          `UPDATE REC_RECEITAS_PRO SET ID_DEFENSIVO = ${fica} WHERE ID_DEFENSIVO IN (${lista})`,
          `UPDATE REC_DEFENSIVOS_ANEXOS SET ID_DEF = ${fica} WHERE ID_DEF IN (${lista})`,
          `DELETE FROM REC_DEFENSIVOS WHERE ID IN (${lista})`,
        ];
      }));
    }
    res.json({ produtos, linhas, conflitos });
  }));

  r.post('/defensivos/acertar-tabelas', rota(async (_req, res) => {
    await acertarTabelas();
    res.json({ ok: true });
  }));

  r.post('/defensivos/:id/buscar-tratamentos', rota(async (req, res) => {
    res.json({ consultas: await buscarTratamentosDoProduto(idParam(req)) });
  }));

  /** Limpa a data da última consulta: a próxima receita busca os dados de novo na API */
  r.post('/defensivos/:id/limpar-consulta', rota(async (req, res) => {
    const id = sqlInteiro(idParam(req));
    await executarScript([
      `UPDATE REC_NOVOREC_DEFENSIVOS SET DATAHORA_API = NULL WHERE ID = ${id}`,
      `UPDATE REC_NOVOREC_CULTURAS SET DATAHORA_API = NULL
        WHERE ID IN (SELECT ID_CULTURA FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO WHERE ID_PRODUTO = ${id})`,
    ]);
    res.json({ ok: true });
  }));

  r.post('/defensivos/:id/duplicar', rota(async (req, res) => {
    const id = idParam(req);
    const def = await consultarUm('SELECT NOME nome, REGISTRO_MAPA mapa FROM REC_NOVOREC_DEFENSIVOS WHERE ID = :id', { id });
    if (!def) throw new BmapiError('Defensivo não encontrado.', 404);
    const ult = await consultarUm('SELECT MAX(ID) m FROM REC_NOVOREC_DEFENSIVOS');
    const novo = Math.max(900000, Number(ult?.m || 0)) + 1;
    const ultT = await consultarUm('SELECT MAX(ID) m FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO');
    const base = Math.max(900000000, Number(ultT?.m || 0));
    const trats = await consultar('SELECT ID id FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO WHERE ID_PRODUTO = :id ORDER BY ID', { id });
    const colunas = `ID_CULTURA, ID_PRAGA, SEQ, ${Object.keys(TEXTOS_TRAT).join(', ')}, ${Object.keys(NUMEROS_TRAT).filter((c) => c !== 'SEQ').join(', ')},
                     DOSE_MINIMA, DOSE_MAXIMA, ${MEMOS.join(', ')}, CODIGO_SIAGRO_CULTURA, CODIGO_SIAGRO_PROBLEMA,
                     UNIDADE_APLICACAO_ID, LOCAL_APLICACAO_ID, UNIDADE_APLICACAO_CODIGO_SIAGRO, ESTADOS_RESTRITOS, RESTRICAO_APLICACAO`;
    await executarScript([
      `INSERT INTO REC_NOVOREC_DEFENSIVOS (ID, NOME, REGISTRO_MAPA, ATIVO)
       VALUES (${novo}, ${sqlTexto(`${String(def.nome || '').trim()} (COPIA)`, 80)}, ${sqlTexto(String(def.mapa || '').trim(), 15)}, TRUE)`,
      ...trats.map((t, i) => `INSERT INTO REC_NOVOREC_CULTURA_PRAGA_PRODUTO (ID, ID_PRODUTO, ${colunas})
         SELECT ${base + i + 1}, ${novo}, ${colunas} FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO WHERE ID = ${sqlInteiro(t.id)}`),
    ]);
    res.json({ id: novo });
  }));

  // ======================= Tratamentos =======================
  r.get('/defensivos/:id/tratamentos', rota(async (req, res) => {
    const rows = await consultar(`${SQL_TRATAMENTO} WHERE A.ID_PRODUTO = :id ORDER BY C.NOME, P.NOME, A.SEQ`, { id: idParam(req) });
    res.json(rows.map(mapearTratamento));
  }));

  r.get('/tratamentos/:id/memos', rota(async (req, res) => {
    res.json(await memosTratamento(idParam(req)));
  }));

  function camposTratamento(b: any): Record<string, string> {
    const c: Record<string, string> = {
      ID_CULTURA: sqlInteiro(Math.trunc(Number(b.idCultura) || 0)),
      ID_PRAGA: sqlInteiro(Math.trunc(Number(b.idPraga) || 0)),
      DOSE_MINIMA: sqlNumero(Number(b.doseMinima) || 0),
      DOSE_MAXIMA: sqlNumero(Number(b.doseMaxima) || 0),
    };
    if (c.ID_CULTURA === '0' || c.ID_PRAGA === '0') throw new BmapiError('Informe a cultura e a praga do tratamento.');
    const camel = (k: string) => k.toLowerCase().replace(/_(\w)/g, (_, l) => l.toUpperCase());
    for (const k of Object.keys(NUMEROS_TRAT)) c[k] = sqlInteiro(Math.trunc(Number(b[camel(k)]) || 0));
    // FRASE_1 → frase1, NOME_INGREDIENTES → nomeIngredientes (mesmos nomes do mapearTratamento)
    for (const [k, max] of Object.entries(TEXTOS_TRAT)) c[k] = sqlTexto(texto(b[camel(k)], max), max);
    // Memos só são gravados quando vieram no corpo (a tela pode salvar só a grade)
    if (b.memos && typeof b.memos === 'object') {
      for (const m of MEMOS) if (typeof b.memos[m.toLowerCase()] === 'string') c[m] = sqlTexto(b.memos[m.toLowerCase()]);
    }
    return c;
  }

  /** Garante os vínculos que a tela de receita usa para chegar até o tratamento (DBISAM não tem NOT EXISTS) */
  async function vinculos(idProduto: string, idCultura: string, idPraga: string): Promise<string[]> {
    const alvos: [string, Record<string, string>][] = [
      ['REC_NOVOREC_CULTURAS_PRODUTOS', { ID_PRODUTO: idProduto, ID_CULTURA: idCultura }],
      ['REC_NOVOREC_PRAGAS_CULTURA', { ID_CULTURA: idCultura, ID_PRAGA: idPraga }],
      ['REC_NOVOREC_PRAGAS_PRODUTOS', { ID_PRODUTO: idProduto, ID_PRAGA: idPraga, USO: "'N'" }],
      ['REC_NOVOREC_PRAGAS_CULTURA_PRODUTO', { ID_PRODUTO: idProduto, ID_CULTURA: idCultura, ID_PRAGA: idPraga }],
    ];
    const comandos: string[] = [];
    for (const [tabela, cols] of alvos) {
      const chave = Object.entries(cols).filter(([k]) => k !== 'USO').map(([k, v]) => `${k} = ${v}`).join(' AND ');
      if (!(await consultarUm(`SELECT COUNT(*) n FROM ${tabela} WHERE ${chave}`))?.n) {
        comandos.push(`INSERT INTO ${tabela} (${Object.keys(cols).join(', ')}) VALUES (${Object.values(cols).join(', ')})`);
      }
    }
    return comandos;
  }

  r.post('/defensivos/:id/tratamentos', rota(async (req, res) => {
    const idProduto = sqlInteiro(idParam(req));
    const c = camposTratamento(req.body || {});
    const ult = await consultarUm('SELECT MAX(ID) m FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO');
    const id = Math.max(900000000, Number(ult?.m || 0)) + 1;
    await executar(`INSERT INTO REC_NOVOREC_CULTURA_PRAGA_PRODUTO (ID, ID_PRODUTO, ${Object.keys(c).join(', ')})
                    VALUES (${id}, ${idProduto}, ${Object.values(c).join(', ')})`);
    await executarScript(await vinculos(idProduto, c.ID_CULTURA, c.ID_PRAGA));
    res.json({ id });
  }));

  r.put('/tratamentos/:id', rota(async (req, res) => {
    const id = idParam(req);
    const atual = await consultarUm('SELECT ID_PRODUTO p FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO WHERE ID = :id', { id });
    if (!atual) throw new BmapiError('Tratamento não encontrado.', 404);
    const c = camposTratamento(req.body || {});
    await executar(`UPDATE REC_NOVOREC_CULTURA_PRAGA_PRODUTO SET ${Object.entries(c).map(([k, v]) => `${k} = ${v}`).join(', ')}
                     WHERE ID = ${sqlInteiro(id)}`);
    await executarScript(await vinculos(sqlInteiro(atual.p), c.ID_CULTURA, c.ID_PRAGA));
    res.json({ ok: true });
  }));

  r.delete('/tratamentos/:id', rota(async (req, res) => {
    await executar('DELETE FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO WHERE ID = :id', { id: idParam(req) });
    res.json({ ok: true });
  }));

  r.delete('/defensivos/:id/tratamentos', rota(async (req, res) => {
    await executar('DELETE FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO WHERE ID_PRODUTO = :id', { id: idParam(req) });
    res.json({ ok: true });
  }));

  // ======================= Culturas e Pragas =======================
  const tabelaNomes = (tipo: string) => (tipo === 'culturas' ? 'REC_NOVOREC_CULTURAS' : 'REC_NOVOREC_PRAGAS');

  r.get('/:tipo(culturas|pragas)', rota(async (req, res) => {
    const tabela = tabelaNomes(req.params.tipo);
    const rows = await consultar(
      `SELECT ID id, ID_CIDASC id_cidasc, NOME nome, NOME_CIENTIFICO cientifico FROM ${tabela}
        WHERE UPPER(NOME) LIKE :q OR UPPER(NOME_CIENTIFICO) LIKE :q
        ORDER BY NOME TOP 1001`,
      { q: busca(req.query.q) },
    );
    res.json({
      truncated: rows.length > 1000,
      itens: rows.slice(0, 1000).map((c) => ({
        id: Number(c.id), idCidasc: Number(c.id_cidasc || 0), nome: String(c.nome || '').trim(), nomeCientifico: String(c.cientifico || '').trim(),
      })),
    });
  }));

  r.put('/:tipo(culturas|pragas)/:id', rota(async (req, res) => {
    const nome = maiusculo(req.body?.nome, 80);
    if (!nome) throw new BmapiError('Informe o nome.');
    await executar(
      `UPDATE ${tabelaNomes(req.params.tipo)} SET NOME = :nome, NOME_CIENTIFICO = :cient, ID_CIDASC = :cidasc WHERE ID = :id`,
      { nome, cient: texto(req.body?.nomeCientifico, 80), cidasc: Math.trunc(Number(req.body?.idCidasc) || 0) || null, id: idParam(req) },
    );
    res.json({ ok: true });
  }));

  r.delete('/:tipo(culturas|pragas)/:id', rota(async (req, res) => {
    const id = idParam(req);
    const cultura = req.params.tipo === 'culturas';
    const campo = cultura ? 'ID_CULTURA' : 'ID_PRAGA';
    const receitas = await consultarUm(`SELECT COUNT(*) n FROM ${cultura ? 'REC_RECEITAS' : 'REC_RECEITAS_PRO'} WHERE ${campo} = :id`, { id });
    if (Number(receitas?.n || 0)) throw new BmapiError(`Já existe receita com ${cultura ? 'esta cultura' : 'esta praga'}. Não pode ser excluída.`);
    const trats = await consultarUm(`SELECT COUNT(*) n FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO WHERE ${campo} = :id`, { id });
    if (Number(trats?.n || 0)) throw new BmapiError(`Existem ${trats!.n} tratamento(s) com ${cultura ? 'esta cultura' : 'esta praga'}. Remova-os antes.`);
    await executar(`DELETE FROM ${tabelaNomes(req.params.tipo)} WHERE ID = :id`, { id });
    res.json({ ok: true });
  }));

  /** Tabelas da CIDASC para vincular culturas (nome comum) e pragas (nome científico) */
  r.get('/cidasc/:tipo(culturas|pragas)', rota(async (req, res) => {
    const cultura = req.params.tipo === 'culturas';
    const rows = await consultar(
      cultura
        ? `SELECT IDNOMECOMUMESPECIEVEGETAL id, NMCOMUMESPECIEVEGERAL nome FROM REC_CULTURAS_CIDASC
            WHERE UPPER(NMCOMUMESPECIEVEGERAL) LIKE :q ORDER BY NMCOMUMESPECIEVEGERAL TOP 100`
        : `SELECT IDPRAGA id, NMCIENTIFICOPRAGA nome FROM REC_PRAGAS_CIDASC
            WHERE UPPER(NMCIENTIFICOPRAGA) LIKE :q ORDER BY NMCIENTIFICOPRAGA TOP 100`,
      { q: busca(req.query.q) },
    );
    res.json(rows.map((c) => ({ id: Number(c.id), nome: String(c.nome || '').trim() })));
  }));

  return r;
}

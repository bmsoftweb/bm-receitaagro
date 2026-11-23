import { consultar, consultarComLimite, executar, lerMemo, executarScript, BmapiError, sqlTexto, sqlNumero, sqlInteiro, sqlBool, sqlDataHora, sqlListaInteiros, agoraISO } from './bmapi.js';
import { config } from './config.js';
import { pool } from './compendioBulas.js';
import { semAcento, Progresso } from './util.js';
import { ligarDefensivos, ligarCulturasPragasCidasc } from './novorec.js';

/**
 * Compêndio próprio no lugar da API do Novo Receituário (servidores.config COMPENDIO_PROPRIO=S):
 * abastece as mesmas tabelas locais REC_NOVOREC_* a partir do MySQL central (bulas lidas pela
 * Claude + de-para de culturas e pragas), então receita, Delphi e CIDASC seguem iguais.
 *
 * IDs locais, para não colidir com os do Novo Receituário:
 *  - produto que não existe na base: 5.000.000 + compendio_produtos.id;
 *  - tratamento: 10.000.000 × (n.º do produto local com o mesmo MAPA, a partir de 1) + compendio_tratamentos.id.
 *    O resto da divisão por 10.000.000 volta ao tratamento do compêndio (para saber se está conferido).
 */

export const ID_PRODUTO_PROPRIO = 5_000_000;
export const ID_TRATAMENTO_PROPRIO = 10_000_000;
/** Tratamento incluído/duplicado à mão na tela Defensivos (compendio.ts): fica fora da sincronização */
const ID_TRATAMENTO_MANUAL = 900_000_000;
/** Filtro do assistente da receita: só os tratamentos vindos do compêndio próprio */
export const SO_TRATAMENTOS_PROPRIOS = `A.ID >= ${ID_TRATAMENTO_PROPRIO}`;

export const usaCompendioProprio = () => config.compendioProprio;

const mapaLimpo = (m: unknown) => String(m ?? '').trim().replace(/^0+/, '');

/** "L p.c./100 L de água" -> "L/100 L": a receita reconhece as unidades no formato do Novo Receituário */
export function unidadeDose(u: unknown): string {
  return String(u ?? '')
    .replace(/\s*p\.?\s?c\.?(?=\s|\/|$)/gi, '')
    .replace(/(\/\s*\d+\s*L)\s*(de\s+)?(água|d'água|agua|calda)\b/i, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);
}

/**
 * Volume de calda em texto -> primeiro número da aplicação terrestre e da aérea. Vem de vários jeitos:
 * "Terrestre 80-400 L/ha; Aérea 40-50 L/ha", "150 a 450 L/ha (terrestre); 10 a 40 L/ha (aérea)",
 * "300-400 L/ha (terrestre ou aérea)": cada trecho (entre ";" ou ". ") vale pelo que cita.
 */
export function volumesCalda(texto: unknown): { terrestre: number; aerea: number } {
  const primeiro = (s: string) => {
    const m = /\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?/.exec(s);
    return m ? Math.round(Number(m[0].replace(/\./g, '').replace(',', '.'))) : 0;
  };
  let terrestre = 0;
  let aerea = 0;
  for (const trecho of String(texto ?? '').split(/;|\.\s+(?=\p{Lu})/u)) {
    const ehAerea = /a[ée]re[ao]/i.test(trecho);
    if (ehAerea && !aerea) aerea = primeiro(trecho);
    if ((!ehAerea || /terrestre/i.test(trecho)) && !terrestre) terrestre = primeiro(trecho);
  }
  return { terrestre, aerea };
}

/** Produto do compêndio e a posição do produto local entre os que têm o mesmo MAPA */
async function produtoDoCompendio(idLocal: number): Promise<{ p: any; posicao: number } | null> {
  const [local] = await consultar('SELECT REGISTRO_MAPA m FROM REC_NOVOREC_DEFENSIVOS WHERE ID = :id', { id: idLocal });
  const mapa = mapaLimpo(local?.m);
  if (!mapa) return null;
  const [[p]] = await pool.query<any[]>('SELECT * FROM compendio_produtos WHERE registro_mapa = ? AND ativo = 1', [mapa]);
  if (!p) return null;
  const mesmos = await consultar('SELECT ID id FROM REC_NOVOREC_DEFENSIVOS WHERE REGISTRO_MAPA IN (:a, :b) ORDER BY ID', { a: mapa, b: String(local.m).trim() });
  return { p, posicao: Math.max(0, mesmos.findIndex((x) => Number(x.id) === idLocal)) };
}

/** Garante na base as culturas/pragas do catálogo usadas (o cliente pode ter um catálogo mais antigo) */
async function garantirCatalogo(tabelaLocal: string, tabelaCompendio: string, ids: number[]) {
  if (!ids.length) return;
  // Em partes: a bmAPI corta resultados grandes
  const existentes = new Set<number>();
  for (let i = 0; i < ids.length; i += 400) {
    for (const r of await consultar(`SELECT ID id FROM ${tabelaLocal} WHERE ID IN (${sqlListaInteiros(ids.slice(i, i + 400))})`)) existentes.add(Number(r.id));
  }
  const faltam = ids.filter((id) => !existentes.has(id));
  if (!faltam.length) return;
  const [linhas] = await pool.query<any[]>(`SELECT id, nome, nome_cientifico, id_cidasc FROM ${tabelaCompendio} WHERE id IN (?)`, [faltam]);
  await executarScript(linhas.map((l) => `INSERT INTO ${tabelaLocal} (ID, NOME, NOME_CIENTIFICO, ID_CIDASC)
    VALUES (${sqlInteiro(l.id)}, ${sqlTexto(semAcento(l.nome).toUpperCase(), 80)}, ${sqlTexto(l.nome_cientifico && semAcento(l.nome_cientifico), 80)}, ${sqlInteiro(l.id_cidasc)})`));
}

/** Tratamentos do produto no compêndio, já com a cultura e a praga do catálogo (de-para) */
async function tratamentosDoCompendio(produtoId: number, idCultura = 0): Promise<any[]> {
  const [linhas] = await pool.query<any[]>(
    `SELECT t.*, dc.cultura_id, dp.praga_id
       FROM compendio_tratamentos t
       JOIN compendio_depara_culturas dc ON dc.nome = t.cultura
       JOIN compendio_depara_pragas dp ON dp.praga_comum = COALESCE(t.praga_comum, '') AND dp.praga_cientifico = COALESCE(t.praga_cientifico, '')
      WHERE t.produto_id = ? AND dc.cultura_id IS NOT NULL AND dp.praga_id IS NOT NULL ${idCultura ? 'AND dc.cultura_id = ?' : ''}
      ORDER BY t.id`,
    idCultura ? [produtoId, idCultura] : [produtoId],
  );
  return linhas;
}

/**
 * Todos os tratamentos do produto local (ou só os da cultura) a partir do compêndio próprio,
 * e os vínculos produto × cultura × praga. Mesmo papel do syncTratamentosDoProduto da API.
 * Devolve quantos tratamentos vieram.
 */
export async function sincronizarProduto(idLocal: number, idCultura = 0): Promise<number> {
  const achado = await produtoDoCompendio(idLocal);
  const p = sqlInteiro(idLocal);
  const filtroCultura = idCultura ? ` AND ID_CULTURA = ${sqlInteiro(idCultura)}` : '';
  const lista = achado ? await tratamentosDoCompendio(achado.p.id, idCultura) : [];
  const base = ID_TRATAMENTO_PROPRIO * ((achado?.posicao ?? 0) + 1);

  await garantirCatalogo('REC_NOVOREC_CULTURAS', 'compendio_culturas', [...new Set(lista.map((t) => Number(t.cultura_id)))]);
  await garantirCatalogo('REC_NOVOREC_PRAGAS', 'compendio_pragas', [...new Set(lista.map((t) => Number(t.praga_id)))]);

  const existentes = new Set((await consultar(
    `SELECT ID id FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO
      WHERE ID_PRODUTO = ${p} AND ID >= ${ID_TRATAMENTO_PROPRIO} AND ID < ${ID_TRATAMENTO_MANUAL}${filtroCultura}`,
  )).map((r) => Number(r.id)));

  const prod = achado?.p || {};
  // EPI, precauções e local são do produto (iguais em toda a bula; a CIDASC exige EPI). Vêm da bula
  // (carga-compendio textos); se a bula ainda não foi lida, aproveita um tratamento antigo da API do mesmo produto.
  const modelo = prod.epi && prod.precaucoes && prod.local_aplicacao ? null : (await consultar(
    `SELECT ID id, LOCAL_APLICACAO l FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO
      WHERE ID_PRODUTO = ${p} AND ID < ${ID_TRATAMENTO_PROPRIO} AND EPI IS NOT NULL ORDER BY ID TOP 1`,
  ))[0];
  const memo = (campo: string) => (modelo ? lerMemo(`SELECT ${campo} FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO WHERE ID = ${sqlInteiro(modelo.id)}`) : '');
  const local = prod.local_aplicacao || modelo?.l || '';
  const epi = prod.epi || await memo('EPI');
  const precaucoes = prod.precaucoes || await memo('PRECAUCOES_USO');
  const seqs = new Map<string, number>();
  const novos = new Set<number>();
  const comandos = lista.map((t) => {
    const id = base + Number(t.id);
    novos.add(id);
    const par = `${t.cultura_id}-${t.praga_id}`;
    const seq = (seqs.get(par) || 0) + 1;
    seqs.set(par, seq);
    const calda = volumesCalda(t.volume_calda);
    const modo = [t.epoca_aplicacao, t.observacao].filter(Boolean).join('\n');
    const campos: Record<string, string> = {
      SEQ: String(seq),
      INTERVALO_SEGURANCA: sqlInteiro(t.carencia_dias ?? 0),
      DOSE_MINIMA: sqlNumero(t.dose_min ?? t.dose_max ?? 0),
      DOSE_MAXIMA: sqlNumero(t.dose_max ?? t.dose_min ?? 0),
      UNIDADE_APLICACAO: sqlTexto(unidadeDose(t.unidade_dose), 30),
      VOLUME_CALDA: sqlInteiro(calda.terrestre),
      VOLUME_CALDA_AEREA: sqlInteiro(calda.aerea),
      MINIMO_APLICACOES: sqlInteiro(t.aplic_min ?? t.aplic_max ?? 0),
      MAXIMO_APLICACOES: sqlInteiro(t.aplic_max ?? t.aplic_min ?? 0),
      ESTAGIO_PROBLEMA: sqlTexto(t.epoca_aplicacao || '', 50),
      MODO_APLICACAO: sqlTexto(modo),
      CLASSIFICACAO_TOXICOLOGICA: sqlTexto(prod.classe_toxicologica || '', 200),
      NOME_INGREDIENTES: sqlTexto(prod.ingrediente_ativo || '', 500),
      ESTADOS_RESTRITOS: "''",
      RESTRICAO_APLICACAO: "''",
      EPI: sqlTexto(epi),
      PRECAUCOES_USO: sqlTexto(precaucoes),
      LOCAL_APLICACAO: sqlTexto(String(local), 50),
    };
    if (existentes.has(id)) return `UPDATE REC_NOVOREC_CULTURA_PRAGA_PRODUTO SET ${Object.entries(campos).map(([k, v]) => `${k} = ${v}`).join(', ')} WHERE ID = ${id}`;
    return `INSERT INTO REC_NOVOREC_CULTURA_PRAGA_PRODUTO (ID, ID_PRODUTO, ID_CULTURA, ID_PRAGA, ${Object.keys(campos).join(', ')})
            VALUES (${id}, ${p}, ${sqlInteiro(t.cultura_id)}, ${sqlInteiro(t.praga_id)}, ${Object.values(campos).join(', ')})`;
  });
  // Poucos por vez: os textos deixam o script grande
  for (let i = 0; i < comandos.length; i += 10) await executar(comandos.slice(i, i + 10).join(';\n'));

  // Tratamentos que saíram do compêndio (bula relida): apaga os que nenhuma receita usa
  const sairam = [...existentes].filter((id) => !novos.has(id));
  if (sairam.length) {
    const usados = new Set((await consultar(`SELECT DISTINCT ID_TRATAMENTO id FROM REC_RECEITAS_PRO WHERE ID_TRATAMENTO IN (${sqlListaInteiros(sairam)})`)).map((r) => Number(r.id)));
    const apagar = sairam.filter((id) => !usados.has(id));
    if (apagar.length) await executar(`DELETE FROM REC_NOVOREC_CULTURA_PRAGA_PRODUTO WHERE ID IN (${sqlListaInteiros(apagar)})`);
  }

  // Vínculos, como na sincronização da API
  const pares = [...seqs.keys()].map((k) => k.split('-').map(Number));
  const culturas = [...new Set(pares.map(([c]) => c))];
  const pragas = [...new Set(pares.map(([, g]) => g))];
  const pragasDaCultura = culturas.length
    ? new Set((await consultar(`SELECT ID_CULTURA c, ID_PRAGA g FROM REC_NOVOREC_PRAGAS_CULTURA WHERE ID_CULTURA IN (${sqlListaInteiros(culturas)})`)).map((r) => `${r.c}-${r.g}`))
    : new Set<string>();
  await executarScript([
    ...(idCultura ? [] : [
      `DELETE FROM REC_NOVOREC_CULTURAS_PRODUTOS WHERE ID_PRODUTO = ${p}`,
      ...culturas.map((c) => `INSERT INTO REC_NOVOREC_CULTURAS_PRODUTOS (ID_PRODUTO, ID_CULTURA) VALUES (${p}, ${c})`),
      `DELETE FROM REC_NOVOREC_PRAGAS_PRODUTOS WHERE ID_PRODUTO = ${p}`,
      ...pragas.map((g) => `INSERT INTO REC_NOVOREC_PRAGAS_PRODUTOS (ID_PRODUTO, ID_PRAGA, USO) VALUES (${p}, ${g}, 'N')`),
    ]),
    `DELETE FROM REC_NOVOREC_PRAGAS_CULTURA_PRODUTO WHERE ID_PRODUTO = ${p}${filtroCultura}`,
    ...pares.map(([c, g]) => `INSERT INTO REC_NOVOREC_PRAGAS_CULTURA_PRODUTO (ID_PRODUTO, ID_CULTURA, ID_PRAGA) VALUES (${p}, ${c}, ${g})`),
    ...pares.filter(([c, g]) => !pragasDaCultura.has(`${c}-${g}`))
      .map(([c, g]) => `INSERT INTO REC_NOVOREC_PRAGAS_CULTURA (ID_CULTURA, ID_PRAGA) VALUES (${c}, ${g})`),
    `UPDATE REC_NOVOREC_DEFENSIVOS SET DATAHORA_API = ${sqlDataHora(agoraISO())} WHERE ID = ${p}`,
  ]);
  return lista.length;
}

/**
 * O produto precisa sincronizar de novo? Só se o compêndio (produto, tratamentos ou de-para) mudou
 * depois da última sincronização: regravar todos os tratamentos leva vários segundos no DBISAM.
 * As datas do MySQL e o DATAHORA_API estão no horário de Brasília.
 */
export async function compendioMudou(mapa: unknown, desde: unknown): Promise<boolean> {
  if (!desde) return true;
  const [[r]] = await pool.query<any[]>(
    `SELECT GREATEST(p.atualizado_em,
              COALESCE((SELECT MAX(atualizado_em) FROM compendio_tratamentos WHERE produto_id = p.id), p.atualizado_em),
              (SELECT MAX(atualizado_em) FROM compendio_depara_culturas),
              (SELECT MAX(atualizado_em) FROM compendio_depara_pragas)) v
       FROM compendio_produtos p WHERE p.registro_mapa = ?`,
    [mapaLimpo(mapa)],
  );
  return !!r && String(r.v) > String(desde).replace('T', ' ').slice(0, 19);
}

/** IDs e MAPA de todos os defensivos locais (a bmAPI corta leituras grandes: páginas de 500) */
async function defensivosLocais(): Promise<{ id: number; mapa: string }[]> {
  const linhas: any[] = [];
  for (let ultimo = -1; ;) {
    const pagina = await consultarComLimite(`SELECT ID id, REGISTRO_MAPA m FROM REC_NOVOREC_DEFENSIVOS WHERE ID > ${ultimo} ORDER BY id TOP 500`);
    if (pagina.truncated) throw new BmapiError('A bmAPI cortou a leitura dos defensivos.');
    linhas.push(...pagina.rows);
    if (pagina.rows.length < 500) break;
    ultimo = Number(pagina.rows[pagina.rows.length - 1].id);
  }
  return linhas.map((l) => ({ id: Number(l.id), mapa: mapaLimpo(l.m) }));
}

/**
 * Produtos com uso na cultura (REC_NOVOREC_CULTURAS_PRODUTOS), criando na base os defensivos
 * que só existem no compêndio. Mesmo papel do syncProdutosDaCultura da API.
 */
export async function sincronizarCultura(idCultura: number) {
  const [produtos] = await pool.query<any[]>(
    `SELECT DISTINCT p.id, p.registro_mapa, p.marca
       FROM compendio_tratamentos t
       JOIN compendio_depara_culturas dc ON dc.nome = t.cultura
       JOIN compendio_produtos p ON p.id = t.produto_id
      WHERE dc.cultura_id = ? AND p.ativo = 1`,
    [idCultura],
  );
  const todos = await defensivosLocais();
  const jaTem = new Set(todos.map((d) => d.id));
  const porMapa = new Map<string, number[]>();
  for (const d of todos) if (d.mapa) porMapa.set(d.mapa, [...(porMapa.get(d.mapa) || []), d.id]);

  const novos: string[] = [];
  const ids: number[] = [];
  for (const pr of produtos) {
    const locais = porMapa.get(mapaLimpo(pr.registro_mapa));
    if (locais) { ids.push(...locais); continue; }
    const id = ID_PRODUTO_PROPRIO + Number(pr.id);
    ids.push(id);
    // Já criado com outro MAPA (bula relida ou MAPA trocado no vínculo CIDASC): reaproveita, sem duplicar a chave
    if (jaTem.has(id)) continue;
    novos.push(`INSERT INTO REC_NOVOREC_DEFENSIVOS (ID, NOME, REGISTRO_MAPA, ATIVO) VALUES (${id}, ${sqlTexto(semAcento(pr.marca).toUpperCase(), 80)}, ${sqlTexto(pr.registro_mapa, 15)}, ${sqlBool(true)})`);
  }
  const c = sqlInteiro(idCultura);
  await executarScript([
    ...novos,
    `DELETE FROM REC_NOVOREC_CULTURAS_PRODUTOS WHERE ID_CULTURA = ${c}`,
    ...[...new Set(ids)].map((p) => `INSERT INTO REC_NOVOREC_CULTURAS_PRODUTOS (ID_PRODUTO, ID_CULTURA) VALUES (${p}, ${c})`),
    `UPDATE REC_NOVOREC_CULTURAS SET DATAHORA_API = ${sqlDataHora(agoraISO())} WHERE ID = ${c}`,
  ]);
  // Produto novo precisa da linha em REC_DEFENSIVOS (código CIDASC pelo MAPA)
  if (novos.length) await ligarDefensivos();
}

/** Botão Atualizar dos Defensivos no modo próprio: produtos, culturas e pragas do compêndio */
export async function atualizarCatalogoProprio(progresso: Progresso = () => {}) {
  progresso('Lendo os produtos do compêndio');
  const [produtos] = await pool.query<any[]>('SELECT id, registro_mapa, marca FROM compendio_produtos WHERE ativo = 1');
  const todos = await defensivosLocais();
  const locais = new Set(todos.map((d) => d.mapa).filter(Boolean));
  const jaTem = new Set(todos.map((d) => d.id));
  const novos = produtos.filter((pr) => !locais.has(mapaLimpo(pr.registro_mapa)) && !jaTem.has(ID_PRODUTO_PROPRIO + Number(pr.id)));
  await executarScript(novos.map((pr) => `INSERT INTO REC_NOVOREC_DEFENSIVOS (ID, NOME, REGISTRO_MAPA, ATIVO)
    VALUES (${ID_PRODUTO_PROPRIO + Number(pr.id)}, ${sqlTexto(semAcento(pr.marca).toUpperCase(), 80)}, ${sqlTexto(pr.registro_mapa, 15)}, ${sqlBool(true)})`),
  (f, t) => progresso('Gravando os defensivos', f, t));

  progresso('Gravando as culturas e pragas');
  const [cult] = await pool.query<any[]>('SELECT DISTINCT cultura_id id FROM compendio_depara_culturas WHERE cultura_id IS NOT NULL');
  const [prag] = await pool.query<any[]>('SELECT DISTINCT praga_id id FROM compendio_depara_pragas WHERE praga_id IS NOT NULL');
  await garantirCatalogo('REC_NOVOREC_CULTURAS', 'compendio_culturas', cult.map((l) => Number(l.id)));
  await garantirCatalogo('REC_NOVOREC_PRAGAS', 'compendio_pragas', prag.map((l) => Number(l.id)));

  progresso('Ligando os defensivos pelo registro MAPA');
  await ligarDefensivos();
  progresso('Ligando culturas e pragas à CIDASC');
  await ligarCulturasPragasCidasc();
  return { defensivos: novos.length, culturas: cult.length, pragas: prag.length, desde: '' };
}

/** Tratamentos locais (IDs) que vieram do compêndio e ainda não foram conferidos pelo agrônomo */
export async function naoConferidos(idsLocais: number[]): Promise<Set<number>> {
  const proprios = idsLocais.filter((id) => id >= ID_TRATAMENTO_PROPRIO && id < ID_TRATAMENTO_MANUAL);
  if (!proprios.length) return new Set();
  const [linhas] = await pool.query<any[]>('SELECT id FROM compendio_tratamentos WHERE conferido = 0 AND id IN (?)', [proprios.map((id) => id % ID_TRATAMENTO_PROPRIO)]);
  const pendentes = new Set(linhas.map((l) => Number(l.id)));
  return new Set(proprios.filter((id) => pendentes.has(id % ID_TRATAMENTO_PROPRIO)));
}

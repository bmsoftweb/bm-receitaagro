/**
 * De-para de culturas e pragas do compêndio próprio para o catálogo do Novo Receituário
 * (IDs de REC_NOVOREC_CULTURAS / REC_NOVOREC_PRAGAS), para abastecer as tabelas locais sem a API.
 *
 *   npx tsx scripts/depara-compendio.ts catalogo <servidor>  copia culturas e pragas da base desse servidor
 *                                                             (servidores.id) -> compendio_culturas / compendio_pragas
 *   npx tsx scripts/depara-compendio.ts casar                 casa os nomes das bulas com o catálogo
 *                                                             -> compendio_depara_*; não mexe no que foi conferido
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { config } from '../server/config.js';
import { buscarServidor } from '../server/servidores.js';
import { comServidor, consultar } from '../server/bmapi.js';

const { host, port, user, password, databaseCompendio } = config.mysql;
const db = mysql.createPool({ host, port, user, password, database: databaseCompendio, connectionLimit: 2, maxIdle: 0, idleTimeout: 30_000 });

/** Maiúsculas, sem acento e sem pontuação: "Cana-de-açúcar" -> "CANA DE ACUCAR" */
export const norm = (s: unknown) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
/** Gênero + espécie, sem "sp."/"spp."/"L." */
const cientifico = (s: unknown) => norm(s).split(' ').filter((w) => !/^(SP|SPP|SSP|VAR|L)$/.test(w)).slice(0, 2).join(' ');

function distancia(a: string, b: string) {
  let ant = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const at = [i];
    for (let j = 1; j <= b.length; j++) at[j] = Math.min(ant[j] + 1, at[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    ant = at;
  }
  return ant[b.length];
}

interface Item { id: number; nome: string; nome_cientifico: string | null }

// ------------------------------------------------------------
// Culturas
// ------------------------------------------------------------
export function casadorCulturas(catalogo: Item[]) {
  const porNome = new Map<string, Item>();
  for (const c of catalogo) if (!porNome.has(norm(c.nome))) porNome.set(norm(c.nome), c);
  const nomes = [...porNome.keys()].sort((a, b) => b.length - a.length); // prefixo mais longo primeiro
  // Singular: PASTAGENS, FEIJOES, CITROS...
  const achar = (n: string) => porNome.get(n) || porNome.get(n.replace(/S$/, '')) || porNome.get(n.replace(/OES$/, 'AO')) || porNome.get(n.replace(/ENS$/, 'EM'));
  const APELIDOS: Record<string, string> = { CITRUS: 'CITROS', 'AREAS DE POUSIO': 'AREA DE POUSIO' };

  return (texto: string): [Item | null, string] => {
    const n = norm(texto);
    const exato = achar(n);
    if (exato) return [exato, 'exato'];
    if (/\bTODAS?\b|\bQUALQUER CULTURA\b|\bTODOS OS CULTIVOS\b/.test(n)) return [porNome.get('TODAS') || null, 'todas'];
    // Tira o que vem entre parênteses e as variantes (OGM, plantio direto...) para achar a cultura-base
    const base = n.replace(/\(.*$/, '').replace(/\b(OGM|GM|GENETICAMENTE|TRANSGENIC\w*|RESISTENTE|TOLERANTE|CONVENCIONAL|PLANTIO DIRETO|RR\d*|BT)\b.*$/, '').trim();
    const prefixo = nomes.find((k) => `${base} `.startsWith(`${k} `));
    const raiz = achar(base) || (prefixo ? porNome.get(prefixo) : undefined);
    if (raiz) {
      const r = norm(raiz.nome);
      const variante = (re: RegExp, achou: (k: string) => boolean, regra: string): [Item, string] | null => {
        if (!re.test(n)) return null;
        const k = nomes.find(achou);
        return k ? [porNome.get(k)!, regra] : null;
      };
      return (
        variante(/GLUFOSINATO|LIBERTY/, (k) => k.startsWith(`${r} LIBERTY`), 'liberty') ||
        variante(/OGM|\bGM\b|GENETICAMENTE|TRANSGEN|GLIFOSATO|GLYPHOSATE|\bRR\b/, (k) => k === `${r} GENETICAMENTE MODIFICADO` || k === `${r} GENETICAMENTE MODIFICADA` || k === `${r} OGM`, 'gm') ||
        variante(/CLEARFIELD/, (k) => k.startsWith(r) && k.includes('CLEARFIELD'), 'clearfield') ||
        variante(/ENLIST/, (k) => k === `${r} ENLIST`, 'enlist') ||
        [raiz, achar(base) ? 'base' : 'prefixo']
      );
    }
    for (const [k, v] of Object.entries(APELIDOS)) if (n.startsWith(k)) return [porNome.get(v) || null, 'apelido'];
    return [null, 'sem'];
  };
}

// ------------------------------------------------------------
// Pragas
// ------------------------------------------------------------
/** Linhas sem alvo (reguladores, dessecação...): pragas genéricas do Novo Receituário */
const GENERICAS: [RegExp, string][] = [
  [/DESSEC/, 'DESSECACAO'], [/MATURA/, 'MATURACAO'], [/DESFOLH/, 'DESFOLHANTE'],
  [/SOQUEIRA/, 'ELIMINACAO DE SOQUEIRA'], [/REGULADOR/, 'REGULADOR DE CRESCIMENTO'],
];

export function casadorPragas(catalogo: Item[]) {
  // O mesmo científico aparece com vários nomes comuns (FERRUGEM, FERRUGEM-DA-FOLHA...)
  const porCient = new Map<string, Item[]>();
  const porNome = new Map<string, Item>();
  for (const p of catalogo) {
    const k = cientifico(p.nome_cientifico);
    if (k) porCient.set(k, [...(porCient.get(k) || []), p]);
    if (!porNome.has(norm(p.nome))) porNome.set(norm(p.nome), p);
  }
  const chaves = [...porCient.keys()];

  return (comum: string, cient: string): [Item | null, string] => {
    const nomes = String(comum || '').split(/[,;/]| ou /).map(norm).filter(Boolean);
    // Entre os de mesmo científico, o de nome comum igual (ou que começa igual) ao da bula
    const escolher = (lista: Item[]) =>
      lista.find((p) => nomes.includes(norm(p.nome))) || lista.find((p) => nomes.some((n) => n.startsWith(norm(p.nome)) || norm(p.nome).startsWith(n))) ||
      // senão o científico mais curto: a espécie, não uma forma especial (f.sp. cepae)
      lista.reduce((a, b) => (String(b.nome_cientifico).length < String(a.nome_cientifico).length ? b : a));
    const k = cientifico(cient);
    if (k && porCient.has(k)) return [escolher(porCient.get(k)!), 'cientifico'];
    // Erro de grafia: até 2 letras de diferença no gênero + espécie
    if (k.includes(' ')) {
      let melhor = '', d = 9;
      for (const c of chaves) if (c[0] === k[0]) { const x = distancia(k, c); if (x < d) [melhor, d] = [c, x]; }
      if (d <= 2) return [escolher(porCient.get(melhor)!), 'parecido'];
    }
    const n = nomes.join(' ');
    if (!k) {
      for (const [re, nome] of GENERICAS) if (re.test(n) && porNome.has(nome)) return [porNome.get(nome)!, 'generica'];
      // ponytail: sem alvo nenhum vira NAO SE REFERE; regulador de crescimento sem alvo fica para acertar na tela
      if (!n) return [porNome.get('NAO SE REFERE') || null, 'generica'];
    }
    // Só o gênero (Puccinia spp.) e, por último, o nome comum: sugestões fracas, conferir
    const genero = k.split(' ')[0];
    if (genero && porCient.has(genero)) return [escolher(porCient.get(genero)!), 'genero'];
    for (const n of nomes) { const m = porNome.get(n); if (m) return [m, 'nome']; }
    return [null, 'sem'];
  };
}

// ------------------------------------------------------------
// Comandos
// ------------------------------------------------------------
async function catalogo(numero: number) {
  const servidor = await buscarServidor(numero);
  if (!servidor) throw new Error(`Servidor ${numero} não encontrado.`);
  for (const [origem, destino] of [['REC_NOVOREC_CULTURAS', 'compendio_culturas'], ['REC_NOVOREC_PRAGAS', 'compendio_pragas']]) {
    const linhas = await comServidor(servidor, () => consultar(`SELECT ID id, NOME nome, NOME_CIENTIFICO cient, ID_CIDASC cidasc FROM ${origem}`));
    const valores = linhas.filter((l) => l.id && l.nome).map((l) => [l.id, String(l.nome).trim(), l.cient ? String(l.cient).trim() : null, l.cidasc || null]);
    await db.query(
      `INSERT INTO ${destino} (id, nome, nome_cientifico, id_cidasc) VALUES ?
       ON DUPLICATE KEY UPDATE nome = VALUES(nome), nome_cientifico = VALUES(nome_cientifico), id_cidasc = COALESCE(VALUES(id_cidasc), id_cidasc)`,
      [valores],
    );
    console.log(`${destino}: ${valores.length} de ${servidor.identificacao}`);
  }
}

async function casar() {
  const [cult] = await db.query<any[]>('SELECT id, nome, nome_cientifico FROM compendio_culturas WHERE ativo = 1');
  const [prag] = await db.query<any[]>('SELECT id, nome, nome_cientifico FROM compendio_pragas WHERE ativo = 1');
  if (!cult.length || !prag.length) throw new Error('Catálogo vazio: rode antes "catalogo <servidor>".');

  const cultura = casadorCulturas(cult);
  const [nomes] = await db.query<any[]>(
    `SELECT t.cultura nome, COUNT(*) n FROM compendio_tratamentos t
      LEFT JOIN compendio_depara_culturas d ON d.nome = t.cultura
      WHERE d.conferido IS NULL OR d.conferido = 0 GROUP BY t.cultura`,
  );
  const resumoC: Record<string, number> = {};
  const linhasC = nomes.map((r) => {
    const [m, regra] = cultura(r.nome);
    resumoC[regra] = (resumoC[regra] || 0) + Number(r.n);
    return [String(r.nome).slice(0, 100), m?.id ?? null, regra];
  });
  for (let i = 0; i < linhasC.length; i += 1000) {
    await db.query(
      `INSERT INTO compendio_depara_culturas (nome, cultura_id, regra) VALUES ?
       ON DUPLICATE KEY UPDATE cultura_id = IF(conferido, cultura_id, VALUES(cultura_id)), regra = IF(conferido, regra, VALUES(regra))`,
      [linhasC.slice(i, i + 1000)],
    );
  }
  console.log('culturas (linhas de tratamento por regra):', resumoC);

  const praga = casadorPragas(prag);
  const [pares] = await db.query<any[]>(
    `SELECT COALESCE(t.praga_comum, '') comum, COALESCE(t.praga_cientifico, '') cient, COUNT(*) n FROM compendio_tratamentos t
      LEFT JOIN compendio_depara_pragas d ON d.praga_comum = COALESCE(t.praga_comum, '') AND d.praga_cientifico = COALESCE(t.praga_cientifico, '')
      WHERE d.conferido IS NULL OR d.conferido = 0 GROUP BY 1, 2`,
  );
  const resumoP: Record<string, number> = {};
  const linhasP = pares.map((r) => {
    const [m, regra] = praga(r.comum, r.cient);
    resumoP[regra] = (resumoP[regra] || 0) + Number(r.n);
    return [String(r.comum).slice(0, 200), String(r.cient).slice(0, 200), m?.id ?? null, regra];
  });
  for (let i = 0; i < linhasP.length; i += 1000) {
    await db.query(
      `INSERT INTO compendio_depara_pragas (praga_comum, praga_cientifico, praga_id, regra) VALUES ?
       ON DUPLICATE KEY UPDATE praga_id = IF(conferido, praga_id, VALUES(praga_id)), regra = IF(conferido, regra, VALUES(regra))`,
      [linhasP.slice(i, i + 1000)],
    );
  }
  console.log('pragas (linhas de tratamento por regra):', resumoP);
}

const [cmd, a1] = process.argv.slice(2);
try {
  if (cmd === 'catalogo' && Number(a1)) await catalogo(Number(a1));
  else if (cmd === 'casar') await casar();
  else console.log('Uso: depara-compendio.ts catalogo <servidor> | casar');
} finally {
  await db.end();
}
process.exit(0);

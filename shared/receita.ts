/**
 * Regras de cálculo da receita (ufrmReceitas.pas), usadas pela tela e conferidas no servidor.
 * As fórmulas são as do Delphi, inclusive a falta de conversão ML→L / G→KG nas doses "/HA".
 */

/** RoundTo(x, -2) do Delphi (arredondamento bancário em 2 casas) */
export function arredonda(x: number): number {
  const c = x * 100;
  const piso = Math.floor(c);
  const dif = c - piso;
  const eps = 1e-9;
  let r: number;
  if (dif > 0.5 + eps) r = piso + 1;
  else if (dif < 0.5 - eps) r = piso;
  else r = piso % 2 === 0 ? piso : piso + 1;
  return r / 100;
}

/** AcertaUnidade: minúsculas e sem espaço em volta de "/" */
export function acertaUnidade(s: string): string {
  return String(s || '').toLowerCase().replace(/ \//g, '/').replace(/\/ /g, '/');
}

const un = (s: string) => String(s || '').replace(/\s/g, '').toUpperCase();

const POR_HA = ['ML/HA', 'L/HA', 'G/HA', 'KG/HA'];
const POR_100L = ['ML/100L', 'G/100L'];

export interface DadosCalculo {
  dose: number;
  /** UN da dose (ProdutosUNderivadas.UN), ex.: "L/HA" */
  unDose: string;
  /** UN a adquirir (rec_un_cidasc.sgUnidadeMedida), ex.: "L" */
  unAdquirir: string;
  calda: number;
  nrAplic: number;
}

/** Quantidade a adquirir a partir da área (btn_calcular_qtdClick) */
export function calcularQuantidade(d: DadosCalculo & { area: number }): number | null {
  const { dose, calda, area, nrAplic } = d;
  if (!(dose > 0)) return null;
  const ud = un(d.unDose);
  const ua = un(d.unAdquirir);
  let qtd: number | null = null;
  if (POR_HA.includes(ud)) {
    qtd = arredonda(dose * area * nrAplic);
    if (ua === 'L' || ua === 'ML') qtd = dose * area * nrAplic;
  }
  if (POR_100L.includes(ud)) {
    if (ua === 'L') qtd = (dose / 1000) * (calda / 100) * area * nrAplic;
    if (ua === 'ML') qtd = dose * (calda / 100) * area * nrAplic;
    if (ua === 'KG') qtd = arredonda((dose / 1000) * (calda / 100) * area * nrAplic);
    if (ua === 'G') qtd = arredonda(dose * (calda / 100) * area * nrAplic);
  }
  // L e ML ficam sem arredondar no Delphi; aqui só se corta o ruído do float (4 casas de quantidade)
  return qtd === null ? null : Math.round(qtd * 10000) / 10000;
}

/**
 * Área a partir da quantidade (btn_calcular_areaClick). No Delphi a regra "/100L" olha a
 * unidade do tratamento (edt_dose_un), por isso ela vem separada.
 */
export function calcularArea(d: DadosCalculo & { qtd: number; unTratamento: string }): number | null {
  const { dose, calda, qtd, nrAplic } = d;
  if (!(dose > 0) || !(nrAplic > 0)) return null;
  let area: number | null = null;
  if (POR_HA.includes(un(d.unDose))) area = arredonda(qtd / dose / nrAplic);
  if (calda > 0 && POR_100L.includes(un(d.unTratamento))) {
    const ua = un(d.unAdquirir);
    if (ua === 'L' || ua === 'KG') area = arredonda((((qtd * 1000) / dose) * 100) / Math.trunc(calda) / nrAplic);
    if (ua === 'ML' || ua === 'G') area = arredonda(((qtd / dose) * 100) / calda / nrAplic);
  }
  return area;
}

/**
 * Dose dentro da faixa do tratamento, convertendo quando a faixa está em outra unidade
 * (L/HA × ML/HA e KG/HA × G/HA), como no btn_avancar_finalizarClick.
 */
export function doseValida(dose: number, unDose: string, doseMin: number, doseMax: number, unTratamento: string): boolean {
  const ud = un(unDose);
  const ut = un(unTratamento);
  let valor = dose;
  if (ud === 'L/HA' && ut === 'ML/HA') valor = dose * 1000;
  else if (ud === 'KG/HA' && ut === 'G/HA') valor = dose * 1000;
  else if (ud === 'G/HA' && ut === 'KG/HA') valor = dose / 1000;
  else if (ud === 'ML/HA' && ut === 'L/HA') valor = dose / 1000;
  const eps = 1e-9;
  return valor >= doseMin - eps && valor <= (doseMax || doseMin) + eps;
}

/** strZero do Delphi: zeros à esquerda, corta à direita */
export function strZero(valor: unknown, tamanho: number): string {
  return String(valor ?? '').replace(/\D/g, '').padStart(tamanho, '0').slice(0, tamanho);
}

/** Número oficial: '42' (IBGE de SC) + AA + código CIDASC do profissional (5) + sequência anual (5) */
export function numeroReceitaFull(ano: number, cidascCodigo: string, sequencia: number): string {
  return `42${String(ano).slice(-2)}${strZero(cidascCodigo, 5)}${strZero(sequencia, 5)}`;
}

/** Nome do PDF / conteúdo do QR code (GeraChavePDF) */
export function chavePdf(numeroArt: string, numeroReceita: number): string {
  return `receita_${strZero(numeroArt, 8)}_${strZero(numeroReceita, 6)}`;
}

/** Texto padrão de aplicações do tratamento */
export function textoAplicacoes(min: number, max: number, local: string): string {
  return !max || min === max ? `${min} aplicação(ões). ${local}` : `${min} a ${max} aplicações. ${local}`;
}

/** restricao_aplicacao / estados_restritos chegam como texto de array JSON */
export function lerListaJson(texto: unknown): string[] {
  try {
    const v = JSON.parse(String(texto || '[]'));
    return Array.isArray(v) ? v.map((x) => String(typeof x === 'object' && x ? (x.id ?? x.sigla ?? JSON.stringify(x)) : x)) : [];
  } catch {
    return [];
  }
}

/** Tipos de aplicação liberados pelo tratamento (id 3 = aérea, só com calda aérea) */
export function tiposAplicacaoLiberados(
  tipos: { id: number; descricao: string }[],
  restricao: unknown,
  volumeCaldaAerea: number,
): { id: number; descricao: string }[] {
  const restritos = new Set(lerListaJson(restricao));
  return tipos.filter((t) => !restritos.has(String(t.id)) && (t.id !== 3 || volumeCaldaAerea > 0));
}

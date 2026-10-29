/**
 * Classes das telas de lista no padrão do b2b admin: painel chapado ocupando toda a
 * área de trabalho, barra de ferramentas encostada no topo, grade com cabeçalho fixo,
 * coluna indicadora ">" à esquerda e coluna Ações fixa à direita.
 */

/** Painel que ocupa toda a área de trabalho */
export const PAINEL = 'flex-1 flex flex-col min-h-0 bg-white dark:bg-stone-900';

/** Barra de ferramentas no topo do painel */
export const BARRA =
  'px-4 py-2.5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-3 shrink-0 bg-white dark:bg-stone-900 overflow-x-auto overflow-y-hidden';

/** Texto informativo à esquerda da barra */
export const BARRA_INFO = 'text-[11px] text-stone-500 dark:text-stone-400 truncate min-w-0';

/** Barra no pé do painel (totais, dicas) */
export const RODAPE =
  'px-4 py-2.5 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950/40 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-stone-500 dark:text-stone-400 shrink-0';

export const BTN_PRIMARIO =
  'flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-xs cursor-pointer shrink-0 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed';

export const BTN_SECUNDARIO =
  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800 transition-colors cursor-pointer shrink-0 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed';

/** Área rolável da grade */
export const GRADE_AREA = 'flex-1 overflow-auto min-h-0';
export const TABELA = 'w-full text-xs border-separate border-spacing-0';

export const TH =
  'px-3 py-2.5 text-center font-semibold text-stone-600 dark:text-stone-300 whitespace-nowrap border-b border-r border-r-transparent border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950';
export const TH_INDICADOR =
  'sticky left-0 z-20 w-[30px] min-w-[30px] max-w-[30px] px-0 border-b border-r border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950';
export const TH_ACOES =
  'sticky right-0 z-20 px-3 py-2.5 text-center font-semibold text-stone-600 dark:text-stone-300 w-24 min-w-24 max-w-24 border-b border-l border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950';

export const TR = 'group transition-colors bg-white dark:bg-stone-900 hover:bg-stone-50 dark:hover:bg-stone-800';

const BORDAS = 'border-b border-b-stone-100 dark:border-b-stone-800/60';
export const TD = `px-3 py-[7.5px] text-stone-700 dark:text-stone-300 align-middle whitespace-nowrap ${BORDAS}`;
export const TD_INDICADOR = `sticky left-0 z-[5] w-[30px] min-w-[30px] max-w-[30px] px-0 text-center align-middle bg-inherit border-r border-stone-200 dark:border-stone-800 ${BORDAS}`;
export const TD_ACOES = `sticky right-0 z-[5] w-24 min-w-24 max-w-24 px-3 py-[7.5px] text-center whitespace-nowrap bg-inherit border-l border-stone-200 dark:border-stone-800 ${BORDAS}`;

/** Ícone ">" da coluna indicadora: aparece ao passar o mouse */
export const INDICADOR = 'w-3.5 h-3.5 mx-auto text-stone-300 opacity-0 group-hover:opacity-100 dark:text-stone-600';

export const BTN_ACAO =
  'p-1 rounded text-stone-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:text-amber-400 dark:hover:bg-amber-950/40 transition-colors cursor-pointer';
export const BTN_ACAO_EXCLUIR =
  'p-1 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/40 transition-colors cursor-pointer';

/** Linha de "carregando" / "nenhum registro" */
export const TD_VAZIO = 'px-3 py-16 text-center text-stone-400';


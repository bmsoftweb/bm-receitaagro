import React, { useEffect, useState } from 'react';
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from 'lucide-react';
import { INPUT_CLASS, FIELD_WRAPPER_CLASS } from '../utils/formStyles';
import { Selecao } from './Selecao';

/**
 * Paginação das grades no padrão do crmWeb (CrudView): "N por página" no cabeçalho e
 * primeira / anterior / próxima / última página no rodapé. A lista já está toda na tela;
 * só a página atual é desenhada. Volta para a página 1 quando `chave` muda (pesquisa, aba).
 */
export function usePaginacao<T>(itens: T[], chave: string) {
  const [limite, setLimiteBruto] = useState(25);
  const [pagina, setPagina] = useState(1);
  const totalPaginas = Math.max(1, Math.ceil(itens.length / limite));
  useEffect(() => setPagina(1), [chave]);
  const atual = Math.min(pagina, totalPaginas);
  return {
    visiveis: itens.slice((atual - 1) * limite, atual * limite),
    seletor: (
      <div className="w-36 shrink-0">
        <Selecao value={limite} onChange={(e) => { setLimiteBruto(Number(e.target.value)); setPagina(1); }} title="Registros por página" className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS} cursor-pointer`}>
          {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} por página</option>)}
        </Selecao>
      </div>
    ),
    rodape: totalPaginas > 1 && (
      <div className="px-4 py-2.5 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-950/40 flex items-center justify-between gap-3 shrink-0">
        <span className="text-[11px] text-stone-500 dark:text-stone-400">
          Página {atual} de {totalPaginas} ({itens.length.toLocaleString('pt-BR')} {itens.length === 1 ? 'registro' : 'registros'})
        </span>
        <div className="flex items-center gap-1.5">
          {([
            [ChevronsLeft, 'Primeira página', 1, atual <= 1],
            [ChevronLeft, 'Página anterior', atual - 1, atual <= 1],
            [ChevronRight, 'Próxima página', atual + 1, atual >= totalPaginas],
            [ChevronsRight, 'Última página', totalPaginas, atual >= totalPaginas],
          ] as const).map(([Icone, titulo, destino, desabilitado]) => (
            <button key={titulo} type="button" onClick={() => setPagina(destino)} disabled={desabilitado} title={titulo}
              className="p-1.5 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors">
              <Icone className="w-4 h-4" />
            </button>
          ))}
        </div>
      </div>
    ),
  };
}

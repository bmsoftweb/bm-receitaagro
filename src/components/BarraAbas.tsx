import React from 'react';
import { List, FileText, FilePlus2, X } from 'lucide-react';

/** Aba aberta sobre a lista (modelo do CrudView do crmWeb) */
export interface AbaAberta {
  uid: number;
  titulo: string;
  novo: boolean;
}

export const abaClasse = (ativa: boolean) =>
  `flex items-center gap-1.5 border-r border-stone-200 dark:border-stone-800 border-b-2 transition-colors ${ativa ? 'bg-white dark:bg-stone-900 border-b-amber-600' : 'border-b-transparent hover:bg-stone-200/60 dark:hover:bg-stone-800/60'}`;
export const abaTexto = (ativa: boolean) =>
  `flex items-center gap-2 py-2.5 text-xs font-semibold whitespace-nowrap cursor-pointer ${ativa ? 'text-amber-700 dark:text-amber-400' : 'text-stone-600 dark:text-stone-400'}`;

/** Só aparece com algum registro aberto; a aba 0 é a lista */
export const BarraAbas: React.FC<{
  rotulo: string;
  total: number;
  abas: AbaAberta[];
  ativa: number;
  onAtivar: (uid: number) => void;
  onFechar: (uid: number) => void;
}> = ({ rotulo, total, abas, ativa, onAtivar, onFechar }) =>
  abas.length === 0 ? null : (
    <div className="flex items-stretch bg-stone-100 dark:bg-stone-950 border-b border-stone-200 dark:border-stone-800 overflow-x-auto overflow-y-hidden shrink-0">
      <div className={`${abaClasse(ativa === 0)} px-4`}>
        <button type="button" onClick={() => onAtivar(0)} className={abaTexto(ativa === 0)}>
          <List className="w-3.5 h-3.5" /><span>{rotulo}</span><span className="text-[10px] font-mono text-stone-400">{total}</span>
        </button>
      </div>
      {abas.map((a) => (
        <div key={a.uid} className={`${abaClasse(ativa === a.uid)} pl-4 pr-2`}>
          <button type="button" onClick={() => onAtivar(a.uid)} className={abaTexto(ativa === a.uid)}>
            {a.novo ? <FilePlus2 className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}<span>{a.titulo}</span>
          </button>
          <button type="button" onClick={() => onFechar(a.uid)} title="Fechar aba" className="p-1 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/40 transition-colors cursor-pointer shrink-0">
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );

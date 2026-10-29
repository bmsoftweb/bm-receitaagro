import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { INPUT_CLASS, FIELD_WRAPPER_CLASS } from '../utils/formStyles';
import { Opcao } from '../types';

interface Props {
  valor: Opcao | null;
  buscar: (q: string) => Promise<Opcao[]>;
  onEscolher: (o: Opcao) => void;
  obrigatorio?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

/** Campo com pesquisa no servidor enquanto digita (cliente, praga, cultura…) */
export const Pesquisa: React.FC<Props> = ({ valor, buscar, onEscolher, obrigatorio, placeholder, disabled }) => {
  const [texto, setTexto] = useState(valor?.descricao || '');
  const [aberto, setAberto] = useState(false);
  const [itens, setItens] = useState<Opcao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => setTexto(valor?.descricao || ''), [valor?.id, valor?.descricao]);

  useEffect(() => {
    if (!aberto) return;
    const t = setTimeout(async () => {
      setCarregando(true);
      try {
        setItens(await buscar(texto === valor?.descricao ? '' : texto));
      } catch {
        setItens([]);
      } finally {
        setCarregando(false);
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, aberto]);

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) {
        setAberto(false);
        setTexto(valor?.descricao || '');
      }
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [valor?.descricao]);

  return (
    <div ref={caixa} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
      <input
        value={texto}
        required={obrigatorio}
        disabled={disabled}
        placeholder={placeholder || 'Digite para pesquisar…'}
        onFocus={() => setAberto(true)}
        onChange={(e) => { setTexto(e.target.value); setAberto(true); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); setAberto(false); }
          if (e.key === 'Enter' && aberto && itens[0]) { e.preventDefault(); onEscolher(itens[0]); setAberto(false); }
        }}
        className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS} pl-9`}
      />
      {aberto && (
        <div className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl text-xs">
          {carregando && <div className="p-2 text-stone-400"><Loader2 className="w-3.5 h-3.5 animate-spin inline" /> Buscando…</div>}
          {!carregando && itens.length === 0 && <div className="p-2 text-stone-400">Nada encontrado</div>}
          {!carregando && itens.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onEscolher(o); setTexto(o.descricao); setAberto(false); }}
              className="w-full text-left px-3 py-1.5 hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer"
            >
              {o.descricao}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

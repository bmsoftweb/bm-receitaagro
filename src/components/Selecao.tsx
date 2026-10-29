import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';

type Props = React.SelectHTMLAttributes<HTMLSelectElement>;

const LIMITE = 10;
const sem = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const texto = (n: React.ReactNode): string => React.Children.toArray(n).map((x) => (typeof x === 'object' ? '' : String(x))).join('');

/** Substitui o <select>: com mais de 10 opções vira lista com pesquisa (mesmo visual do Pesquisa) */
export const Selecao: React.FC<Props> = ({ children, ...props }) => {
  const opcoes = useMemo(
    () => React.Children.toArray(children)
      .filter((c): c is React.ReactElement<{ value: any; children: React.ReactNode }> => React.isValidElement(c))
      .map((c) => ({ valor: String(c.props.value ?? ''), rotulo: texto(c.props.children) })),
    [children],
  );
  const valor = String(props.value ?? '');
  const atual = opcoes.find((o) => o.valor === valor);
  const vazio = !atual || valor === '' || valor === '0';
  // A primeira opção "Selecione…" vira o placeholder
  const placeholder = opcoes[0] && (opcoes[0].valor === '' || opcoes[0].valor === '0') ? opcoes[0].rotulo : 'Digite para pesquisar…';
  const rotuloAtual = vazio ? '' : atual!.rotulo;

  const [busca, setBusca] = useState(rotuloAtual);
  const [aberto, setAberto] = useState(false);
  const [foco, setFoco] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  useEffect(() => { if (!aberto) setBusca(rotuloAtual); }, [rotuloAtual, aberto]);

  const filtradas = useMemo(() => {
    const termos = sem(busca === rotuloAtual ? '' : busca).split(/\s+/).filter(Boolean);
    return opcoes.filter((o) => termos.every((t) => sem(o.rotulo).includes(t)));
  }, [opcoes, busca, rotuloAtual]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  useEffect(() => { lista.current?.children[foco]?.scrollIntoView({ block: 'nearest' }); }, [foco]);

  if (opcoes.length <= LIMITE) return <select {...props}>{children}</select>;

  const escolher = (v: string) => {
    props.onChange?.({ target: { value: v }, currentTarget: { value: v } } as React.ChangeEvent<HTMLSelectElement>);
    setAberto(false);
  };

  return (
    <div ref={caixa} className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
      <input
        value={busca}
        required={props.required}
        disabled={props.disabled}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={(e) => { e.target.select(); setAberto(true); setFoco(0); }}
        onChange={(e) => { setBusca(e.target.value); setAberto(true); setFoco(0); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && aberto) { e.stopPropagation(); setAberto(false); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); setAberto(true); setFoco((f) => Math.min(f + 1, filtradas.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setFoco((f) => Math.max(f - 1, 0)); }
          else if (e.key === 'Enter' && aberto) { e.preventDefault(); if (filtradas[foco]) escolher(filtradas[foco].valor); }
          else if (e.key === 'Tab') setAberto(false);
        }}
        className={`${props.className || ''} pl-9`}
      />
      {aberto && (
        <div ref={lista} className="absolute z-30 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 shadow-xl text-xs">
          {filtradas.length === 0 && <div className="p-2 text-stone-400">Nada encontrado</div>}
          {filtradas.map((o, i) => (
            <button
              key={o.valor}
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setFoco(i)}
              onClick={() => escolher(o.valor)}
              className={`w-full text-left px-3 py-1.5 cursor-pointer ${i === foco ? 'bg-amber-50 dark:bg-amber-950/30' : ''} ${o.valor === valor ? 'font-semibold' : ''}`}
            >
              {o.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

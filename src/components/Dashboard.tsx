import React, { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus, Loader2 } from 'lucide-react';
import { Usuario, Empresa, ServidorInfo, DbConnectionStatus } from '../types';
import { NavTab } from './Sidebar';
import { get } from '../services/api';
import { formatDateBR } from '../utils/formatters';
import { AvisoErro } from './AvisoErro';

interface Props {
  usuario: Usuario;
  empresa: Empresa;
  servidor: ServidorInfo;
  dbStatus: DbConnectionStatus | null;
  onNavigate: (tab: NavTab) => void;
}

interface Card { atual: number; anterior: number; periodo: string[]; periodoAnterior: string[] }
interface Painel {
  hoje: string;
  cards: Record<'dia' | 'semana' | 'mes' | 'ano', Card>;
  diasMes: { data: string; atual: number; anterior: number | null }[];
  produtos: { id: number; nome: string; quantidade: number }[];
}

const CARDS = [
  { chave: 'dia', titulo: 'Receitas no dia', comparado: 'ontem' },
  { chave: 'semana', titulo: 'Receitas na semana', comparado: 'semana anterior' },
  { chave: 'mes', titulo: 'Receitas no mês', comparado: 'mês anterior' },
  { chave: 'ano', titulo: 'Receitas no ano', comparado: 'ano anterior' },
] as const;

const CAIXA = 'rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800';
const num = (v: number) => v.toLocaleString('pt-BR');
const ddmm = (iso: string) => formatDateBR(iso).slice(0, 5);
const faixa = ([a, b]: string[]) => (a === b ? formatDateBR(a) : `${ddmm(a)} a ${formatDateBR(b)}`);

/** Card de período: total até hoje comparado com o mesmo trecho do período anterior */
const CardPeriodo: React.FC<{ titulo: string; comparado: string; c: Card }> = ({ titulo, comparado, c }) => {
  const dif = c.anterior ? Math.round(((c.atual - c.anterior) / c.anterior) * 100) : null;
  const [Icone, cor] = dif === null || dif === 0
    ? [Minus, 'text-stone-500 bg-stone-100 dark:bg-stone-800']
    : dif > 0
      ? [ArrowUpRight, 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40']
      : [ArrowDownRight, 'text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-950/40'];
  return (
    <div className={`${CAIXA} p-4`} title={`${faixa(c.periodo)} • ${comparado}: ${faixa(c.periodoAnterior)}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{titulo}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <span className="text-3xl font-bold tabular-nums text-stone-900 dark:text-stone-100">{num(c.atual)}</span>
        <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-semibold tabular-nums ${cor}`}>
          <Icone className="w-3.5 h-3.5" />{dif === null ? 'sem base' : `${dif > 0 ? '+' : ''}${dif}%`}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-stone-500">{comparado}: <span className="tabular-nums">{num(c.anterior)}</span></p>
    </div>
  );
};

/** Colunas: receitas por dia do mês corrente (dica mostra o mesmo dia do mês anterior) */
const GraficoDias: React.FC<{ dias: Painel['diasMes']; hoje: string }> = ({ dias, hoje }) => {
  const [foco, setFoco] = useState<number | null>(null);
  const max = Math.max(1, ...dias.map((d) => d.atual));
  const d = foco === null ? null : dias[foco];
  return (
    <div className={`${CAIXA} p-4 h-full flex flex-col`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Receitas por dia do mês</h3>
        <span className="text-[11px] text-stone-500">máx. {num(max)} por dia</span>
      </div>
      <div className="relative mt-3 pt-4 flex-1 min-h-48 flex items-end gap-[2px] border-b border-stone-200 dark:border-stone-700" onMouseLeave={() => setFoco(null)}>
        {/* Linha de referência no meio */}
        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-stone-200 dark:border-stone-800 pointer-events-none" />
        {dias.map((x, i) => (
          <div key={x.data} className="relative flex-1 h-full flex items-end cursor-default" onMouseEnter={() => setFoco(i)}>
            <div
              className={`relative w-full rounded-t-[4px] transition-colors ${x.data > hoje ? '' : foco === i ? 'bg-amber-700' : 'bg-amber-600'}`}
              style={{ height: `${(x.atual / max) * 100}%`, minHeight: x.atual ? 2 : 0 }}
            >
              {x.data <= hoje && (
                <span className="absolute bottom-full inset-x-0 mb-0.5 text-center text-[9px] leading-none font-semibold tabular-nums text-stone-600 dark:text-stone-300">{x.atual}</span>
              )}
            </div>
          </div>
        ))}
        {d && (
          <div
            className="absolute -top-2 z-10 -translate-y-full -translate-x-1/2 pointer-events-none whitespace-nowrap rounded-lg bg-stone-900 text-white text-[11px] px-2.5 py-1.5 shadow-lg"
            style={{ left: `${((foco! + 0.5) / dias.length) * 100}%` }}
          >
            <p className="font-semibold">{formatDateBR(d.data)}</p>
            <p className="tabular-nums">{d.data > hoje ? 'ainda não chegou' : `${num(d.atual)} receita(s)`}</p>
            {d.anterior !== null && <p className="tabular-nums text-stone-300">mês anterior: {num(d.anterior)}</p>}
          </div>
        )}
      </div>
      {/* Todos os dias, em diagonal para caberem */}
      <div className="flex gap-[2px] h-7 text-[9px] text-stone-400 tabular-nums">
        {dias.map((x) => (
          <span key={x.data} className="flex-1 relative">
            <span className="absolute right-1/2 top-1 origin-top-right -rotate-45 whitespace-nowrap">{ddmm(x.data)}</span>
          </span>
        ))}
      </div>
    </div>
  );
};

/** Barras horizontais: produtos mais receitados no ano */
const GraficoProdutos: React.FC<{ produtos: Painel['produtos'] }> = ({ produtos }) => {
  const max = Math.max(1, ...produtos.map((p) => p.quantidade));
  return (
    <div className={`${CAIXA} p-4 h-full`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">10 produtos mais receitados</h3>
        <span className="text-[11px] text-stone-500">no ano</span>
      </div>
      {produtos.length === 0 ? (
        <p className="mt-6 text-center text-xs text-stone-400">Nenhum produto receitado no ano.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {produtos.map((p, i) => (
            <li key={p.id} className="group" title={`${p.nome}: ${num(p.quantidade)} vez(es) em receitas`}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate text-stone-700 dark:text-stone-300"><span className="text-stone-400 tabular-nums mr-1.5">{i + 1}.</span>{p.nome}</span>
                <span className="font-semibold tabular-nums text-stone-900 dark:text-stone-100">{num(p.quantidade)}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-stone-100 dark:bg-stone-800">
                <div className="h-full rounded-full bg-amber-600 group-hover:bg-amber-700 transition-colors" style={{ width: `${(p.quantidade / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

/** Painel inicial: indicadores das receitas */
export const Dashboard: React.FC<Props> = ({ usuario, empresa, servidor, dbStatus, onNavigate }) => {
  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    get<Painel>('/api/receitas/painel').then(setPainel).catch((e) => setErro(e.message));
  }, []);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Olá, {usuario.nome}</h2>
        <p className="text-xs text-stone-500">
          {empresa.fantasia || empresa.nome} • {servidor.identificacao} •{' '}
          {dbStatus?.connected ? <span className="text-emerald-600">bmAPI conectada ({dbStatus.latencyMs} ms)</span> : <span className="text-rose-600">bmAPI sem conexão</span>}
        </p>
      </div>

      {erro && <AvisoErro mensagem={erro} onFechar={() => setErro(null)} />}

      {!painel ? (
        !erro && <div className="flex items-center gap-2 text-xs text-stone-500"><Loader2 className="w-4 h-4 animate-spin" /> Carregando indicadores…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {CARDS.map((c) => <CardPeriodo key={c.chave} titulo={c.titulo} comparado={c.comparado} c={painel.cards[c.chave]} />)}
          </div>
          <div className="grid lg:grid-cols-5 gap-3">
            <div className="lg:col-span-3"><GraficoDias dias={painel.diasMes} hoje={painel.hoje} /></div>
            <div className="lg:col-span-2"><GraficoProdutos produtos={painel.produtos} /></div>
          </div>
        </>
      )}

    </div>
  );
};

import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { get, send, qs } from '../services/api';
import { Cadastro } from './Cadastro';
import { Pesquisa } from './Pesquisa';
import { Selecao } from './Selecao';
import { INPUT_CLASS, LABEL_CLASS, FIELD_WRAPPER_CLASS } from '../utils/formStyles';

/**
 * De-para do compêndio próprio: nome de cultura/praga como veio da bula -> catálogo
 * (IDs do Novo Receituário). Preenchido por scripts/depara-compendio.ts; aqui se acerta
 * o que não casou ou casou por regra fraca. Salvar marca como conferido (o script não mexe mais).
 */

type Tipo = 'culturas' | 'pragas';

interface Depara {
  id: number; texto: string; cientifico: string; itemId: number | null; itemNome: string; itemCientifico: string;
  regra: string; conferido: boolean; linhas: number;
}

const SITUACOES: [string, string][] = [['sem', 'Sem correspondência'], ['revisar', 'A revisar (regra fraca)'], ['conferidos', 'Conferidos'], ['', 'Todos']];

const REGRAS: Record<string, string> = {
  exato: 'Nome igual', base: 'Cultura-base', prefixo: 'Início do nome', gm: 'Transgênica', liberty: 'LibertyLink', clearfield: 'Clearfield',
  enlist: 'Enlist', todas: 'Todas as culturas', apelido: 'Apelido', cientifico: 'Científico igual', parecido: 'Científico parecido',
  genero: 'Só o gênero', nome: 'Só o nome comum', generica: 'Praga genérica', manual: 'Manual', sem: '–',
};

const gravar = (tipo: Tipo, d: Partial<Depara>) => send('PUT', `/api/compendio-bulas/depara/${tipo}`, { texto: d.texto, cientifico: d.cientifico, itemId: d.itemId ?? null });

export const CompendioDeparaView: React.FC = () => {
  const [tipo, setTipo] = useState<Tipo>('culturas');
  const [situacao, setSituacao] = useState('sem');
  return (
    <Cadastro<Depara>
      key={tipo}
      nome="correspondência"
      titulo={tipo === 'culturas' ? 'De-para das culturas' : 'De-para das pragas'}
      feminino
      podeIncluir={false}
      chaveRecarga={situacao}
      carregar={(q) => get<Depara[]>(`/api/compendio-bulas/depara/${tipo}${qs({ q, situacao })}`)}
      descrever={(d) => d.texto || d.cientifico || '(sem praga)'}
      barra={
        <div className="flex gap-2">
          <div className="w-32">
            <Selecao value={tipo} onChange={(e) => setTipo(e.target.value as Tipo)} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`}>
              <option value="culturas">Culturas</option>
              <option value="pragas">Pragas</option>
            </Selecao>
          </div>
          <div className="w-56">
            <Selecao value={situacao} onChange={(e) => setSituacao(e.target.value)} className={`${INPUT_CLASS} ${FIELD_WRAPPER_CLASS}`}>
              {SITUACOES.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </Selecao>
          </div>
        </div>
      }
      colunas={[
        {
          titulo: 'Na bula',
          valor: (d) => <span className="font-semibold">{d.texto || (tipo === 'pragas' && !d.cientifico ? <span className="text-stone-400">(sem praga)</span> : '')} {d.cientifico && <i className="font-normal text-stone-500">{d.cientifico}</i>}</span>,
        },
        { titulo: 'Linhas', valor: (d) => d.linhas.toLocaleString('pt-BR'), classe: 'text-right font-mono' },
        {
          titulo: 'Correspondência',
          valor: (d) => d.itemId
            ? <span>{d.itemNome} {d.itemCientifico && <i className="text-stone-500">{d.itemCientifico}</i>}</span>
            : <span className="text-rose-600">sem correspondência</span>,
        },
        { titulo: 'Regra', valor: (d) => REGRAS[d.regra] || d.regra },
        { titulo: 'Conferido', valor: (d) => (d.conferido ? 'Sim' : ''), classe: 'text-center' },
      ]}
      campos={[]}
      novo={() => ({})}
      salvar={(d) => gravar(tipo, d)}
      acoes={[{
        icone: Check, titulo: 'Confirmar', descricao: 'aceitar a correspondência sugerida', tom: 'verde',
        executar: async (d) => { await gravar(tipo, d); return 'Correspondência confirmada.'; },
      }]}
      extraFormulario={(d, alterar) => (
        // Altura mínima: a lista da pesquisa abre dentro do formulário
        <div className="col-span-4 min-h-[22rem] space-y-3">
          <div>
            <label className={LABEL_CLASS}>Na bula</label>
            <div className="text-sm">{d.texto} {d.cientifico && <i className="text-stone-500">{d.cientifico}</i>}</div>
          </div>
          <div>
            <label className={LABEL_CLASS}>{tipo === 'culturas' ? 'Cultura do catálogo' : 'Praga do catálogo'}</label>
            <Pesquisa
              valor={d.itemId ? { id: d.itemId, descricao: d.itemNome } : null}
              buscar={(q) => get(`/api/compendio-bulas/catalogo/${tipo}${qs({ q })}`)}
              onEscolher={(o) => alterar({ itemId: o.id, itemNome: o.descricao, itemCientifico: '' })}
              placeholder="Buscar pelo nome ou nome científico…"
            />
          </div>
          <p className="text-[11px] text-stone-400">Salvar marca como conferido: a próxima rodada do script não muda mais esta correspondência.</p>
        </div>
      )}
    />
  );
};

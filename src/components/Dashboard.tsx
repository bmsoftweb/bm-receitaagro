import React from 'react';
import { Usuario, Empresa, ServidorInfo, DbConnectionStatus } from '../types';
import { GRUPOS, NavTab } from './Sidebar';

interface Props {
  usuario: Usuario;
  empresa: Empresa;
  servidor: ServidorInfo;
  dbStatus: DbConnectionStatus | null;
  onNavigate: (tab: NavTab) => void;
}

/** Painel inicial: atalhos para as telas e situação da bmAPI */
export const Dashboard: React.FC<Props> = ({ usuario, empresa, servidor, dbStatus, onNavigate }) => (
  <div className="max-w-5xl mx-auto space-y-6">
    <div>
      <h2 className="text-xl font-semibold">Olá, {usuario.nome}</h2>
      <p className="text-xs text-stone-500">
        {empresa.fantasia || empresa.nome} • Servidor #{servidor.numero} {servidor.identificacao} •{' '}
        {dbStatus?.connected ? <span className="text-emerald-600">bmAPI conectada ({dbStatus.latencyMs} ms)</span> : <span className="text-rose-600">bmAPI sem conexão</span>}
      </p>
    </div>
    {GRUPOS.filter((g) => g.titulo !== 'Visão Geral').map((g) => (
      <div key={g.titulo}>
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-stone-500 mb-2">{g.titulo}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {g.itens.map(({ id, label, icon: Icone }) => (
            <button key={id} type="button" onClick={() => onNavigate(id)} className="flex items-center gap-3 p-4 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 hover:border-amber-400 cursor-pointer text-left">
              <Icone className="w-5 h-5 text-amber-600" />
              <span className="text-sm font-semibold">{label}</span>
            </button>
          ))}
        </div>
      </div>
    ))}
  </div>
);

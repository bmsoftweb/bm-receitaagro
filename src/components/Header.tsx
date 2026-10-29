import React from 'react';
import { Menu, Building2, RefreshCw, Lock } from 'lucide-react';
import { Empresa, ServidorInfo, DbConnectionStatus } from '../types';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  titulo: string;
  empresa: Empresa;
  servidor: ServidorInfo;
  dbStatus: DbConnectionStatus | null;
  onOpenMobileSidebar: () => void;
  onRefreshDbStatus: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  titulo,
  empresa,
  servidor,
  dbStatus,
  onOpenMobileSidebar,
  onRefreshDbStatus,
}) => {
  return (
    <header className="print:hidden h-[var(--altura-topo)] shrink-0 z-20 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-800">
      <div className="h-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
        {/* Título da tela */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onOpenMobileSidebar}
            title="Abrir menu de navegação"
            className="lg:hidden p-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 border border-stone-200 dark:border-stone-700 transition-colors cursor-pointer shrink-0"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider hidden sm:inline-flex items-center gap-1 shrink-0">
              <Lock className="w-3 h-3 text-amber-500" />
              {empresa.fantasia || empresa.nome}
            </span>
            <span className="text-stone-300 dark:text-stone-700 hidden sm:inline">•</span>
            <h2 className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100 leading-tight truncate">
              {titulo}
            </h2>
            {/* Telas podem pôr um selo ao lado do título (createPortal) */}
            <span id="titulo-extra" className="contents" />

          </div>
        </div>

        {/* Ações à direita */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          {/* Empresa */}
          <div className="hidden xl:flex items-center gap-2 bg-stone-50 dark:bg-stone-800/70 border border-stone-200 dark:border-stone-700/80 rounded-xl px-3 py-1.5 text-xs">
            <Building2 className="w-3.5 h-3.5 text-amber-500" />
            <div className="text-left">
              <div className="font-semibold text-stone-800 dark:text-stone-200 truncate max-w-[160px]">
                {empresa.nome}
              </div>
              <div className="text-[10px] text-stone-400 font-mono">{empresa.cnpj}</div>
            </div>
          </div>

          <ThemeToggle />

          <button
            onClick={onRefreshDbStatus}
            title="Testar a conexão com o servidor"
            className="p-2 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

import React from 'react';
import {
  LayoutDashboard,
  FileText,
  FlaskConical,
  Sprout,
  Bug,
  UserCheck,
  ClipboardList,
  MessageSquareText,
  Users,
  Stethoscope,
  LogOut,
  X,
  User,
  Settings,
  ArrowLeftRight,
  type LucideIcon,
} from 'lucide-react';
import { Usuario } from '../types';

export type NavTab =
  | 'dashboard'
  | 'receitas'
  | 'defensivos'
  | 'culturas'
  | 'pragas'
  | 'profissionais'
  | 'arts'
  | 'observacoes'
  | 'diagnosticos'
  | 'clientes'
  | 'configuracoes'
  | 'movimento';

export const NAV_TABS: NavTab[] = [
  'dashboard', 'receitas', 'defensivos', 'culturas', 'pragas', 'profissionais', 'arts', 'observacoes', 'diagnosticos', 'clientes', 'configuracoes', 'movimento',
];

export const GRUPOS: { titulo: string; itens: { id: NavTab; label: string; icon: LucideIcon }[] }[] = [
  { titulo: 'Visão Geral', itens: [{ id: 'dashboard', label: 'Painel Geral', icon: LayoutDashboard }] },
  {
    titulo: 'Receituário',
    itens: [
      { id: 'receitas', label: 'Receitas', icon: FileText },
      { id: 'movimento', label: 'Movimento CIDASC', icon: ArrowLeftRight },
    ],
  },
  {
    titulo: 'Compêndio',
    itens: [
      { id: 'defensivos', label: 'Defensivos', icon: FlaskConical },
      { id: 'culturas', label: 'Culturas', icon: Sprout },
      { id: 'pragas', label: 'Pragas', icon: Bug },
    ],
  },
  {
    titulo: 'Cadastros',
    itens: [
      { id: 'profissionais', label: 'Profissionais', icon: UserCheck },
      { id: 'arts', label: 'ARTs', icon: ClipboardList },
      { id: 'observacoes', label: 'Observações', icon: MessageSquareText },
      { id: 'diagnosticos', label: 'Diagnósticos', icon: Stethoscope },
      { id: 'clientes', label: 'Clientes', icon: Users },
    ],
  },
  { titulo: 'Sistema', itens: [{ id: 'configuracoes', label: 'Configurações', icon: Settings }] },
];

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  usuario: Usuario;
  onOpenMeusDados: () => void;
  onLogout: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  usuario,
  onOpenMeusDados,
  onLogout,
  isOpenMobile,
  onCloseMobile,
}) => {
  const handleNavClick = (tab: NavTab) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white text-stone-900 border-r border-stone-200 select-none dark:bg-stone-900 dark:text-stone-100 dark:border-stone-800">
      {/* Marca — mesma altura do header da área de trabalho */}
      <div className="h-[var(--altura-topo)] shrink-0 px-4 border-b border-stone-200 dark:border-stone-800/80 flex items-center justify-between gap-3 bg-stone-50/50 dark:bg-transparent">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center text-white shadow-md shadow-amber-500/20 shrink-0">
            <Sprout size={20} className="stroke-[2.2]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-stone-900 dark:text-white leading-tight truncate">
              BM-Receita<span className="text-amber-500 dark:text-amber-400 font-extrabold">Agro</span>
            </h1>
            <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">Receituário Agronômico</p>
          </div>
        </div>

        <button
          onClick={onCloseMobile}
          title="Fechar menu lateral"
          className="lg:hidden p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 dark:text-stone-400 dark:hover:text-white dark:hover:bg-stone-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navegação */}
      <nav className="flex-1 overflow-y-auto py-4">
        {GRUPOS.map((grupo, i) => (
          <div key={grupo.titulo} className={i ? 'pt-3' : ''}>
            <div className="px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
              {grupo.titulo}
            </div>
            {grupo.itens.map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => handleNavClick(id)}
                  className={`w-full flex items-center gap-3 px-4 py-[11px] text-left transition-colors cursor-pointer group border-l-2 ${
                    isActive
                      ? 'border-amber-500 bg-amber-50 text-amber-700 font-semibold dark:border-amber-400 dark:bg-amber-500/10 dark:text-amber-400'
                      : 'border-transparent text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800/70 dark:hover:text-white'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                      isActive ? 'text-amber-600 dark:text-amber-400' : 'text-stone-400 group-hover:text-amber-600 dark:group-hover:text-amber-400'
                    }`}
                  />
                  <span className="text-xs truncate">{label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Usuário & sair */}
      <div className="p-3 border-t border-stone-200 dark:border-stone-800/80 flex items-center justify-between gap-2 bg-stone-50 dark:bg-stone-950/60">
        <button
          onClick={onOpenMeusDados}
          title="Meus dados"
          className="flex items-center gap-2.5 min-w-0 text-left rounded-lg p-1 -m-1 hover:bg-stone-100 dark:hover:bg-stone-800/70 transition-colors cursor-pointer"
        >
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center font-semibold text-xs shrink-0">
            {usuario.nome ? usuario.nome.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-stone-900 dark:text-white truncate leading-tight">{usuario.nome}</div>
            <div className="text-[10px] text-stone-500 dark:text-stone-400 truncate mt-0.5">
              {usuario.nivelDescricao || usuario.email || 'Operador'}
            </div>
          </div>
        </button>

        <button
          onClick={onLogout}
          title="Sair do sistema"
          className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/50 transition-colors cursor-pointer shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Sidebar fixa no desktop */}
      <aside className="print:hidden hidden lg:flex flex-col w-64 shrink-0 h-screen sticky top-0 z-30">{sidebarContent}</aside>

      {/* Drawer no mobile */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="fixed inset-0 bg-stone-950/70 backdrop-blur-xs" onClick={onCloseMobile} aria-hidden="true" />
          <div className="relative flex-1 flex flex-col max-w-xs w-full h-full shadow-2xl z-10">{sidebarContent}</div>
        </div>
      )}
    </>
  );
};

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { sendProgresso, Andamento } from '../services/api';
import { Modal } from './Modal';

/** Andamento de uma atualização longa; sem total, a barra fica correndo */
export const ProgressoModal: React.FC<{ titulo: string; andamento: Andamento | null }> = ({ titulo, andamento }) => {
  const pct = andamento?.total ? Math.round((andamento.feitos / andamento.total) * 100) : null;
  return (
    <Modal isOpen onClose={() => {}} title={titulo} subtitle="Aguarde até terminar" size="sm">
      <div className="flex flex-col gap-2 py-2">
        <div className="flex items-center gap-2 text-sm text-stone-700 dark:text-stone-200">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span className="flex-1">{andamento?.etapa || 'Iniciando…'}</span>
          {pct !== null && <span className="font-mono text-xs text-stone-500">{andamento!.feitos} de {andamento!.total}</span>}
        </div>
        <div className="h-2.5 rounded-full bg-stone-200 dark:bg-stone-700 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
          {pct !== null
            ? <div className="h-full bg-amber-600 transition-[width] duration-300" style={{ width: `${pct}%` }} />
            : <div className="h-full w-1/3 bg-amber-600 rounded-full animate-[progresso_1.2s_ease-in-out_infinite]" />}
        </div>
      </div>
    </Modal>
  );
};

/** Chama uma rota com progresso (rotaProgresso) mostrando o modal enquanto ela trabalha */
export function useProgresso() {
  const [estado, setEstado] = useState<{ titulo: string; andamento: Andamento | null } | null>(null);
  const executar = async <T = any,>(titulo: string, url: string): Promise<T> => {
    setEstado({ titulo, andamento: null });
    try {
      return await sendProgresso<T>(url, (andamento) => setEstado({ titulo, andamento }));
    } finally {
      setEstado(null);
    }
  };
  const modal = estado && <ProgressoModal titulo={estado.titulo} andamento={estado.andamento} />;
  return { executar, modal };
}

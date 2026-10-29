import React from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { BTN_SECUNDARIO } from '../utils/listaStyles';

interface ConfirmModalProps {
  titulo: string;
  mensagem: React.ReactNode;
  textoConfirmar?: string;
  processando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

/** Confirmação padrão para toda ação de excluir/remover */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  titulo,
  mensagem,
  textoConfirmar = 'Excluir',
  processando,
  onConfirmar,
  onCancelar,
}) => (
  <Modal isOpen onClose={onCancelar} title={titulo} size="sm">
    <div className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed">{mensagem}</div>
    <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-200 dark:border-stone-800">
      <button type="button" onClick={onCancelar} disabled={processando} className={BTN_SECUNDARIO}>
        Cancelar
      </button>
      <button
        type="button"
        onClick={onConfirmar}
        disabled={processando}
        autoFocus
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50"
      >
        {processando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        <span>{textoConfirmar}</span>
      </button>
    </div>
  </Modal>
);

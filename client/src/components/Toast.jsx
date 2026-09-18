import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export default function Toast({ toast, onClose }) {
  if (!toast) return null;

  const config = {
    success: {
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
      bg: 'bg-slate-900 border-emerald-500/40 text-slate-100',
      tag: 'SUCCESS'
    },
    error: {
      icon: <XCircle className="w-5 h-5 text-red-400 shrink-0" />,
      bg: 'bg-slate-900 border-red-500/40 text-slate-100',
      tag: 'ERROR'
    },
    warning: {
      icon: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
      bg: 'bg-slate-900 border-amber-500/40 text-slate-100',
      tag: 'WARNING'
    },
    info: {
      icon: <Info className="w-5 h-5 text-blue-400 shrink-0" />,
      bg: 'bg-slate-900 border-blue-500/40 text-slate-100',
      tag: 'NOTICE'
    }
  };

  const item = config[toast.type || 'info'] || config.info;

  return (
    <div className="fixed bottom-5 right-5 z-50 animate-in slide-in-from-bottom-5 fade-in duration-200">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md max-w-md ${item.bg}`}>
        {item.icon}
        <div className="flex-1 text-xs font-semibold leading-snug">
          {toast.message}
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

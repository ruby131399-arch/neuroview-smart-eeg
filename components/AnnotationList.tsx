import React from 'react';
import { Annotation } from '../types';
import { Trash2, AlertTriangle, CheckCircle, HelpCircle, AlertOctagon } from 'lucide-react';

interface Props {
  annotations: Annotation[];
  currentTrial: number;
  onDelete: (id: string) => void;
  onJump: (trialIdx: number) => void;
}

const AnnotationList: React.FC<Props> = ({ annotations, currentTrial, onDelete, onJump }) => {
  if (annotations.length === 0) {
      return (
          <div className="p-8 text-center text-slate-400">
              <p className="text-sm">No annotations recorded yet.</p>
          </div>
      );
  }

  const getIcon = (type: Annotation['type']) => {
      switch (type) {
          case 'seizure': return <AlertOctagon size={16} className="text-red-500" />;
          case 'artifact': return <AlertTriangle size={16} className="text-amber-500" />;
          case 'normal': return <CheckCircle size={16} className="text-green-500" />;
          default: return <HelpCircle size={16} className="text-slate-400" />;
      }
  };

  const sorted = [...annotations].sort((a, b) => a.trialIndex - b.trialIndex);

  return (
    <div className="divide-y divide-slate-200">
       <div className="px-4 py-2 bg-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0">
           History ({annotations.length})
       </div>
       {sorted.map(ann => (
           <div 
            key={ann.id} 
            className={`p-3 hover:bg-white transition-colors group border-l-4 ${ann.trialIndex === currentTrial ? 'bg-white border-primary-500 shadow-sm' : 'bg-transparent border-transparent'}`}
           >
              <div className="flex justify-between items-start mb-1">
                  <button 
                    onClick={() => onJump(ann.trialIndex)}
                    className="flex items-center gap-2 text-xs font-bold text-slate-700 hover:text-primary-600 hover:underline"
                  >
                      {getIcon(ann.type)}
                      <span>Trial {ann.trialIndex + 1}</span>
                  </button>
                  <span className="text-[10px] text-slate-400 font-mono">
                      T+{Math.round(ann.timestamp)}s
                  </span>
              </div>
              <p className="text-sm text-slate-600 leading-snug break-words">
                  {ann.note}
              </p>
              <div className="flex justify-end mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => onDelete(ann.id)}
                    className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded flex items-center gap-1"
                  >
                      <Trash2 size={12} /> Remove
                  </button>
              </div>
           </div>
       ))}
    </div>
  );
};

export default AnnotationList;
import React from 'react';
import { Agent } from '../types';
import { Trash2 } from 'lucide-react';

interface RoleCardProps {
  agent: Agent;
  onRemove: (id: string) => void;
  onUpdate?: (id: string, field: 'name' | 'role' | 'personality', value: string) => void;
  isEditable?: boolean;
}

export const RoleCard: React.FC<RoleCardProps> = ({ agent, onRemove, onUpdate, isEditable = true }) => {
  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 shadow-sm flex flex-col gap-3 relative group transition-transform hover:-translate-y-1">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-12 h-12 rounded-full bg-slate-700 overflow-hidden border-2 border-blue-500/30 flex-shrink-0">
            <img 
              src={`https://picsum.photos/seed/${agent.avatarId}/200`} 
              alt={agent.name}
              className="w-full h-full object-cover" 
            />
          </div>
          <div className="flex-1 min-w-0">
            {isEditable && onUpdate ? (
              <input
                type="text"
                value={agent.name}
                onChange={(e) => onUpdate(agent.id, 'name', e.target.value)}
                className="font-semibold text-white bg-transparent border-b border-transparent hover:border-slate-600 focus:border-blue-500 focus:outline-none w-full transition-colors px-0.5"
                placeholder="Name"
                aria-label="Agent Name"
              />
            ) : (
              <h3 className="font-semibold text-white truncate">{agent.name}</h3>
            )}
            
            {isEditable && onUpdate ? (
              <input
                type="text"
                value={agent.role}
                onChange={(e) => onUpdate(agent.id, 'role', e.target.value)}
                className="text-xs text-blue-400 font-mono uppercase tracking-wider bg-transparent border-b border-transparent hover:border-slate-600 focus:border-blue-500 focus:outline-none w-full transition-colors px-0.5 mt-0.5"
                placeholder="Role"
                aria-label="Agent Role"
              />
            ) : (
              <span className="text-xs text-blue-400 font-mono uppercase tracking-wider block truncate">{agent.role}</span>
            )}
          </div>
        </div>
        {isEditable && (
          <button 
            onClick={() => onRemove(agent.id)}
            className="text-slate-500 hover:text-red-400 p-1.5 hover:bg-red-500/10 rounded-lg transition-colors flex-shrink-0"
            title="Remove Participant"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      
      {isEditable && onUpdate ? (
        <textarea
          value={agent.personality}
          onChange={(e) => onUpdate(agent.id, 'personality', e.target.value)}
          className="text-sm text-slate-300 italic bg-slate-900/50 p-2 rounded w-full resize-none focus:outline-none focus:ring-1 focus:ring-blue-500/50 border border-transparent hover:border-slate-700 transition-colors"
          rows={3}
          placeholder="Describe personality..."
          aria-label="Agent Personality"
        />
      ) : (
        <div className="text-sm text-slate-400 italic bg-slate-900/50 p-2 rounded">
          "{agent.personality}"
        </div>
      )}
    </div>
  );
};
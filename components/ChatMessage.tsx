import React from 'react';
import { Message, Agent } from '../types';
import { User, Bot, BrainCircuit } from 'lucide-react';

interface ChatMessageProps {
  message: Message;
  agent?: Agent; // If undefined, it's the user or system
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, agent }) => {
  const isUser = message.senderId === 'user';
  const isSystem = message.senderId === 'system';
  const isAssistant = message.senderId === 'assistant';

  if (isSystem || isAssistant) {
    return (
      <div className="flex justify-center my-6">
        <div className={`flex flex-col items-center gap-2 max-w-[80%] ${isAssistant ? 'bg-purple-900/20 border-purple-500/20' : 'bg-slate-800 border-slate-700'} px-6 py-3 rounded-xl border`}>
          {isAssistant && (
            <div className="flex items-center gap-2 text-purple-400 font-semibold text-xs uppercase tracking-wider">
               <Bot size={14} /> Meeting Assistant
            </div>
          )}
          <span className={`text-center text-sm ${isAssistant ? 'text-slate-200' : 'text-slate-400'}`}>
            {message.content}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-4 mb-6 ${isUser ? 'flex-row-reverse' : ''} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center overflow-hidden border-2 ${isUser ? 'bg-blue-600 border-blue-400' : 'bg-slate-700 border-slate-600'}`}>
        {isUser ? (
          <User size={20} className="text-white" />
        ) : agent ? (
          <img src={`https://picsum.photos/seed/${agent.avatarId}/200`} alt={agent.name} className="w-full h-full object-cover" />
        ) : (
          <Bot size={20} className="text-slate-400" />
        )}
      </div>

      {/* Content */}
      <div className={`flex flex-col max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-sm font-semibold text-slate-200">{message.senderName}</span>
          {agent && <span className="text-xs text-slate-500">{agent.role}</span>}
        </div>

        {/* Thought Bubble (if exists and not user) */}
        {message.thought && !isUser && (
          <div className="mb-2 bg-slate-800/50 border-l-2 border-purple-500/50 p-3 rounded-r-lg text-sm text-purple-300/80 italic flex gap-2 items-start">
            <BrainCircuit size={14} className="mt-1 flex-shrink-0 opacity-70" />
            <span>{message.thought}</span>
          </div>
        )}

        {/* Speech Bubble */}
        <div className={`p-4 rounded-2xl shadow-sm text-sm leading-relaxed ${
          isUser 
            ? 'bg-blue-600 text-white rounded-tr-none' 
            : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-none'
        } ${!message.content ? 'opacity-50' : ''}`}>
          {message.content || (
            <div className="flex gap-1 items-center h-5">
              <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-100"></span>
              <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce delay-200"></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
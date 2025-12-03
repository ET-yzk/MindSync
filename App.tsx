import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Agent, AppStage, MeetingState, Message, Language } from './types';
import { 
  generateRolesForTopic, 
  generateMeetingReport, 
  generateTopicSuggestions, 
  generateQuickSummary,
  generateAgentThought,
  generateAgentSpeechStream,
  generatePhaseCheck
} from './services/geminiService';
import { Button } from './components/Button';
import { RoleCard } from './components/RoleCard';
import { ChatMessage } from './components/ChatMessage';
import { Send, Users, User, Mic, StopCircle, PlayCircle, Sparkles, FileText, Download, RotateCcw, RefreshCw, Save, Trash2, History, Globe, X, Bot, Plus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const INITIAL_STATE: MeetingState = {
  topic: '',
  agents: [],
  messages: [],
  isActive: false,
  isGenerating: false,
  language: 'en',
};

const LOCAL_STORAGE_KEY = 'mindsync_saved_session';

interface SavedSessionData {
  stage: AppStage;
  state: MeetingState;
  report: string;
  timestamp: number;
}

const TEXT = {
  en: {
    appTitle: "MindSync Meeting Room",
    appSubtitle: "Host an AI-powered debate. Propose a topic, and we'll assemble the experts.",
    resumeSession: "Resume Session",
    inputPlaceholder: "Enter a discussion topic (e.g., 'Universal Basic Income')",
    suggestedTopics: "Suggested Topics",
    refresh: "Refresh",
    assembleTeam: "Assemble Your Team",
    reviewParticipants: "Review the generated participants for:",
    editHint: "Click text to edit",
    needMoreParticipants: "Need at least 2 participants to start.",
    back: "Back",
    startMeeting: "Start Meeting",
    participants: "Participants",
    hostRole: "Host / Moderator",
    you: "You",
    saveProgress: "Save Progress",
    live: "LIVE",
    endMeeting: "End Meeting",
    joinDiscussion: "Join the discussion...",
    aiDisclaimer: "The AI participants will respond to you and each other automatically.",
    meetingMinutes: "Meeting Minutes",
    newMeeting: "New Meeting",
    autoSaveHint: "Session saved automatically if you save manually.",
    saveSuccess: "Session saved successfully!",
    saveFail: "Failed to save session. Local storage might be full.",
    restoreFail: "Could not restore session.",
    genRolesFail: "Failed to generate roles. Please try again.",
    save: "Save",
    resume: "Resume",
    delete: "Delete Saved Session",
    typing: "is thinking...",
    quickSummary: "Quick Summary",
    generating: "Generating...",
    currentSummaryTitle: "Current Discussion Summary",
    close: "Close",
    assistantName: "Meeting Assistant",
    addParticipant: "Add Participant"
  },
  zh: {
    appTitle: "MindSync 智能会议室",
    appSubtitle: "主持一场由 AI 驱动的辩论。提出一个话题，我们将为您召集专家。",
    resumeSession: "恢复会话",
    inputPlaceholder: "输入讨论话题 (例如：'通用基本收入')",
    suggestedTopics: "建议话题",
    refresh: "刷新",
    assembleTeam: "组建团队",
    reviewParticipants: "回顾为以下话题生成的参与者：",
    editHint: "点击文本进行编辑",
    needMoreParticipants: "至少需要 2 名参与者才能开始。",
    back: "返回",
    startMeeting: "开始会议",
    participants: "参与者",
    hostRole: "主持人 / 版主",
    you: "你",
    saveProgress: "保存进度",
    live: "直播中",
    endMeeting: "结束会议",
    joinDiscussion: "加入讨论...",
    aiDisclaimer: "AI 参与者将自动回应您和彼此。",
    meetingMinutes: "会议纪要",
    newMeeting: "新会议",
    autoSaveHint: "如果您手动保存，会话将自动保存。",
    saveSuccess: "会话保存成功！",
    saveFail: "保存会话失败，存储空间可能已满。",
    restoreFail: "无法恢复会话。",
    genRolesFail: "生成角色失败，请重试。",
    save: "保存",
    resume: "恢复",
    delete: "删除保存的会话",
    typing: "正在思考...",
    quickSummary: "快速总结",
    generating: "生成中...",
    currentSummaryTitle: "当前讨论总结",
    close: "关闭",
    assistantName: "会议助手",
    addParticipant: "添加参与者"
  }
};

export default function App() {
  const [stage, setStage] = useState<AppStage>('topic');
  const [state, setState] = useState<MeetingState>(INITIAL_STATE);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [thinkingAgentId, setThinkingAgentId] = useState<string | null>(null);
  const [report, setReport] = useState('');
  
  // Topic Suggestions State
  const [suggestedTopics, setSuggestedTopics] = useState<string[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  // Saved Session State
  const [savedSessionAvailable, setSavedSessionAvailable] = useState(false);
  const [savedSessionMetadata, setSavedSessionMetadata] = useState<{topic: string, date: number, language?: Language} | null>(null);

  // Quick Summary State
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);

  // Turn tracking for Assistant Logic
  const turnCountRef = useRef(0);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  
  // Current language helper
  const t = TEXT[state.language];

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [state.messages, thinkingAgentId]); 

  // Initial topic suggestions
  useEffect(() => {
    handleRegenerateTopics(state.language);
  }, []); // Run once on mount

  // Check for saved session on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed: SavedSessionData = JSON.parse(saved);
        setSavedSessionAvailable(true);
        setSavedSessionMetadata({
          topic: parsed.state.topic || "Untitled Session",
          date: parsed.timestamp,
          language: parsed.state.language
        });
      }
    } catch (e) {
      console.error("Failed to parse saved session", e);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }, []);

  // --- STORAGE ACTIONS ---
  
  const saveSession = () => {
    const sessionData: SavedSessionData = {
      stage,
      state,
      report,
      timestamp: Date.now()
    };
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sessionData));
      setSavedSessionAvailable(true);
      setSavedSessionMetadata({
        topic: state.topic,
        date: sessionData.timestamp,
        language: state.language
      });
      alert(t.saveSuccess);
    } catch (e) {
      console.error("Failed to save session", e);
      alert(t.saveFail);
    }
  };

  const restoreSession = () => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed: SavedSessionData = JSON.parse(saved);
        setStage(parsed.stage);
        setState(parsed.state);
        setReport(parsed.report);
      }
    } catch (e) {
      console.error("Failed to restore session", e);
      alert(t.restoreFail);
    }
  };

  const clearSavedSession = () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    setSavedSessionAvailable(false);
    setSavedSessionMetadata(null);
  };

  const toggleLanguage = () => {
    const newLang = state.language === 'en' ? 'zh' : 'en';
    setState(prev => ({ ...prev, language: newLang }));
    // Refresh topics when language changes
    handleRegenerateTopics(newLang);
  };

  // --- STAGE 1: TOPIC ---
  const handleTopicSubmit = async () => {
    if (!inputValue.trim()) return;
    setLoading(true);
    try {
      const agents = await generateRolesForTopic(inputValue, state.language);
      setState(prev => ({ ...prev, topic: inputValue, agents }));
      setStage('roles');
      setInputValue('');
    } catch (err) {
      alert(t.genRolesFail);
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateTopics = async (lang: Language = state.language) => {
    setIsLoadingSuggestions(true);
    try {
      const newTopics = await generateTopicSuggestions(lang);
      if (newTopics && newTopics.length > 0) {
        setSuggestedTopics(newTopics);
      }
    } catch (e) {
      console.error("Failed to refresh topics", e);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleSelectSuggestion = (topic: string) => {
    setInputValue(topic);
  };

  // --- STAGE 2: ROLES ---
  const removeAgent = (id: string) => {
    setState(prev => ({ ...prev, agents: prev.agents.filter(a => a.id !== id) }));
  };

  const updateAgent = (id: string, field: 'name' | 'role' | 'personality', value: string) => {
    setState(prev => ({
      ...prev,
      agents: prev.agents.map(a => a.id === id ? { ...a, [field]: value } : a)
    }));
  };

  const handleAddAgent = () => {
    const newAgent: Agent = {
        id: `agent-${Date.now()}`,
        name: state.language === 'zh' ? "新参与者" : "New Participant",
        role: state.language === 'zh' ? "观察员" : "Observer",
        personality: state.language === 'zh' ? "客观的，好奇的" : "Objective, curious",
        avatarId: Math.floor(Math.random() * 100)
    };
    setState(prev => ({ ...prev, agents: [...prev.agents, newAgent] }));
  };

  const startMeeting = () => {
    if (state.agents.length === 0) return;
    setStage('meeting');
    setState(prev => ({
      ...prev,
      messages: [{
        id: 'system-start',
        senderId: 'system',
        senderName: 'System',
        content: state.language === 'zh' 
          ? `会议开始，话题: "${prev.topic}". 主持人（你）请发言。` 
          : `Meeting started on topic: "${prev.topic}". The moderator (You) has the floor.`,
        type: 'system',
        timestamp: Date.now()
      }],
      isActive: true
    }));
    turnCountRef.current = 0;
  };

  // --- STAGE 3: MEETING LOOP ---
  
  // Helper to add message
  const addMessage = useCallback((msg: Message) => {
    setState(prev => ({ ...prev, messages: [...prev.messages, msg] }));
    turnCountRef.current += 1;
  }, []);

  // Update last message content (for streaming)
  const updateLastMessage = useCallback((content: string) => {
    setState(prev => {
      const msgs = [...prev.messages];
      if (msgs.length === 0) return prev;
      msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content };
      return { ...prev, messages: msgs };
    });
  }, []);

  // Handle User Input
  const handleUserMessage = () => {
    if (!inputValue.trim()) return;
    
    // Pause auto-discussion when user speaks
    setState(prev => ({ ...prev, isActive: false }));

    const newMessage: Message = {
      id: Date.now().toString(),
      senderId: 'user',
      senderName: t.hostRole, // Localized name
      content: inputValue,
      timestamp: Date.now(),
      type: 'speech'
    };
    
    addMessage(newMessage);
    setInputValue('');
    
    // Resume auto-discussion after a short delay
    setTimeout(() => {
        setState(prev => ({ ...prev, isActive: true }));
    }, 2000);
  };

  const handleQuickSummary = async () => {
    // Pause meeting if active to prevent chaos while reading
    if (state.isActive) {
        setState(prev => ({ ...prev, isActive: false }));
    }
    
    setIsSummaryLoading(true);
    setIsSummaryOpen(true);
    setSummaryText('');

    try {
        const summary = await generateQuickSummary(state.topic, state.messages, state.language);
        setSummaryText(summary);
    } catch (e) {
        setSummaryText("Error generating summary.");
    } finally {
        setIsSummaryLoading(false);
    }
  };

  // Main Auto-Pilot Logic
  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const processNextTurn = async () => {
      if (!state.isActive || state.isGenerating || stage !== 'meeting' || state.agents.length === 0 || isSummaryOpen) return;

      setState(prev => ({ ...prev, isGenerating: true }));

      // --- PHASE 1: Assistant Check (Every 4 turns) ---
      if (turnCountRef.current > 0 && turnCountRef.current % 4 === 0) {
         try {
             const intervention = await generatePhaseCheck(state.topic, state.messages, state.language, turnCountRef.current);
             if (intervention) {
                 addMessage({
                    id: Date.now().toString(),
                    senderId: 'assistant',
                    senderName: t.assistantName,
                    content: intervention,
                    type: 'system',
                    timestamp: Date.now()
                 });
                 setState(prev => ({ ...prev, isGenerating: false }));
                 // Don't continue to agent turn immediately, give user time to read
                 return; 
             }
         } catch (e) {
             // Ignore assistant error
         }
      }

      // --- PHASE 2: Agent Turn ---
      const lastMessage = state.messages[state.messages.length - 1];
      
      // Determine who should speak next
      // Rule: Random agent who wasn't the last speaker
      const availableAgents = state.agents.filter(a => a.id !== lastMessage.senderId);
      const candidates = availableAgents.length > 0 ? availableAgents : state.agents;
      
      if (candidates.length === 0) {
        setState(prev => ({ ...prev, isGenerating: false }));
        return;
      }

      const nextSpeaker = candidates[Math.floor(Math.random() * candidates.length)];
      setThinkingAgentId(nextSpeaker.id);

      // Natural delay before starting (Also acts as rate limiting buffer)
      await new Promise(resolve => setTimeout(resolve, 1500));

      try {
        // Step A: Generate Thought (Internal Monologue)
        const thought = await generateAgentThought(
          nextSpeaker,
          state.topic,
          state.messages,
          state.agents,
          state.language
        );

        // Add placeholder message with thought
        const messageId = Date.now().toString();
        addMessage({
          id: messageId,
          senderId: nextSpeaker.id,
          senderName: nextSpeaker.name,
          content: "", // Start empty
          thought: thought,
          timestamp: Date.now(),
          type: 'speech'
        });

        // Step B: Stream Speech
        let fullContent = "";
        const stream = generateAgentSpeechStream(
          nextSpeaker,
          thought,
          state.topic,
          state.messages,
          state.language
        );

        for await (const chunk of stream) {
            fullContent += chunk;
            updateLastMessage(fullContent);
        }

      } catch (err) {
        console.error("Agent failed to speak", err);
      } finally {
        setState(prev => ({ ...prev, isGenerating: false }));
        setThinkingAgentId(null);
      }
    };

    if (state.isActive && !state.isGenerating) {
      // Trigger the loop with a longer delay to respect rate limits (was 500ms)
      timeoutId = setTimeout(processNextTurn, 2000); 
    }

    return () => clearTimeout(timeoutId);
  }, [state.isActive, state.isGenerating, state.messages, state.agents, state.topic, state.language, stage, isSummaryOpen, addMessage, updateLastMessage, t.assistantName]);


  // --- STAGE 4: REPORT ---
  const endMeeting = async () => {
    setState(prev => ({ ...prev, isActive: false }));
    setLoading(true);
    setStage('report');
    try {
      const result = await generateMeetingReport(state.topic, state.messages, state.language);
      setReport(result);
    } catch (e) {
      setReport("# Error\nCould not generate report. The service might be busy.");
    } finally {
      setLoading(false);
    }
  };

  const restartApp = () => {
    // Keep language preference
    const currentLang = state.language;
    setState({ ...INITIAL_STATE, language: currentLang });
    setStage('topic');
    setReport('');
    setInputValue('');
    handleRegenerateTopics(currentLang);
    turnCountRef.current = 0;
  };

  // --- RENDERERS ---

  const renderTopicStage = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8 w-full max-w-2xl mx-auto px-4 relative flex-1">
      <div className="absolute top-0 right-4 flex gap-2">
         <button 
           onClick={toggleLanguage}
           className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 hover:border-blue-500 transition-colors text-sm font-medium"
         >
           <Globe size={14} />
           {state.language === 'en' ? 'English' : '中文'}
         </button>
      </div>

      <div className="text-center space-y-4 mt-8">
        <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-xl shadow-blue-900/30 mb-6">
          <Users size={40} className="text-white" />
        </div>
        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
          {t.appTitle}
        </h1>
        <p className="text-slate-400 text-lg max-w-md mx-auto">
          {t.appSubtitle}
        </p>
      </div>

      {savedSessionAvailable && savedSessionMetadata && (
        <div className="w-full bg-slate-800/80 border border-blue-500/30 rounded-xl p-4 flex items-center justify-between shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="bg-blue-500/10 p-2 rounded-lg text-blue-400">
              <History size={20} />
            </div>
            <div>
              <div className="text-sm text-slate-400 uppercase tracking-wider font-semibold">{t.resumeSession}</div>
              <div className="text-white font-medium">{savedSessionMetadata.topic}</div>
              <div className="text-xs text-slate-500">
                {new Date(savedSessionMetadata.date).toLocaleString()}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={clearSavedSession}
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              title={t.delete}
            >
              <Trash2 size={18} />
            </button>
            <Button variant="primary" onClick={restoreSession} className="py-1.5 text-sm">
              {t.resume}
            </Button>
          </div>
        </div>
      )}

      <div className="w-full space-y-4">
        <div className="relative">
          <input
            type="text"
            className="w-full bg-slate-800 border-2 border-slate-700 rounded-xl px-6 py-4 text-lg text-white focus:outline-none focus:border-blue-500 transition-colors shadow-inner"
            placeholder={t.inputPlaceholder}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTopicSubmit()}
            disabled={loading}
          />
          <button 
            className="absolute right-3 top-3 p-2 bg-blue-600 rounded-lg text-white hover:bg-blue-500 transition-colors disabled:opacity-50"
            onClick={handleTopicSubmit}
            disabled={loading || !inputValue.trim()}
          >
            {loading ? <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" /> : <Send size={20} />}
          </button>
        </div>

        {/* Suggestions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-sm font-medium text-slate-400 flex items-center gap-2">
              <Sparkles size={14} className="text-purple-400" />
              {t.suggestedTopics}
            </span>
            <button 
              onClick={() => handleRegenerateTopics()}
              disabled={isLoadingSuggestions}
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={12} className={isLoadingSuggestions ? "animate-spin" : ""} />
              {t.refresh}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {suggestedTopics.map((topic, idx) => (
              <button
                key={idx}
                onClick={() => handleSelectSuggestion(topic)}
                className="text-left text-sm p-3 rounded-lg bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/50 hover:border-blue-500/30 transition-all duration-200"
              >
                {topic}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderRolesStage = () => (
    <div className="flex flex-col h-full max-w-4xl mx-auto w-full p-4 gap-6 flex-1 overflow-hidden">
      <header className="text-center space-y-2 py-4 flex-shrink-0">
        <h2 className="text-2xl font-bold text-white">{t.assembleTeam}</h2>
        <p className="text-slate-400">{t.reviewParticipants} <span className="text-blue-400 font-semibold">{state.topic}</span></p>
        <p className="text-xs text-slate-500">{t.editHint}</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4 overflow-y-auto p-2">
        {state.agents.map(agent => (
          <RoleCard 
            key={agent.id} 
            agent={agent} 
            onRemove={removeAgent} 
            onUpdate={updateAgent}
          />
        ))}
         <button 
           onClick={handleAddAgent}
           className="min-h-[140px] border-2 border-dashed border-slate-700 rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-400 hover:border-blue-500/50 hover:bg-slate-800/50 transition-all gap-2"
         >
            <Plus size={32} />
            <span className="font-medium">{t.addParticipant}</span>
         </button>
        {state.agents.length < 2 && (
          <div className="col-span-full p-4 text-center text-red-400/80 text-sm">
            {t.needMoreParticipants}
          </div>
        )}
      </div>

      <div className="flex gap-4 justify-center py-4 border-t border-slate-800 flex-shrink-0">
        <Button variant="secondary" onClick={() => setStage('topic')}>
          {t.back}
        </Button>
        <Button 
          variant="primary" 
          onClick={startMeeting}
          disabled={state.agents.length < 2}
          className="px-8"
        >
          {t.startMeeting}
        </Button>
      </div>
    </div>
  );

  const renderMeetingStage = () => (
    <div className="flex flex-1 overflow-hidden bg-slate-900 relative">
      {/* Sidebar - Participants */}
      <div className="hidden md:flex w-72 bg-slate-800 border-r border-slate-700 flex-col">
        <div className="p-4 border-b border-slate-700">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Users size={18} />
            {t.participants}
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center gap-3 p-2 rounded-lg bg-blue-600/10 border border-blue-500/20">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
              <User size={16} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-medium text-white">{t.you}</div>
              <div className="text-xs text-blue-400">{t.hostRole}</div>
            </div>
          </div>
           {/* Assistant Badge */}
           <div className="flex items-center gap-3 p-2 rounded-lg bg-purple-600/10 border border-transparent opacity-60">
            <div className="w-8 h-8 rounded-full bg-purple-900 flex items-center justify-center">
              <Bot size={16} className="text-purple-400" />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-300">{t.assistantName}</div>
              <div className="text-xs text-slate-500">AI Observer</div>
            </div>
          </div>

          {state.agents.map(agent => (
            <div key={agent.id} className={`flex items-center gap-3 p-2 rounded-lg border transition-colors ${
              thinkingAgentId === agent.id 
                ? 'bg-purple-500/10 border-purple-500/50' 
                : 'bg-slate-700/30 border-transparent'
            }`}>
              <div className="relative">
                <img 
                  src={`https://picsum.photos/seed/${agent.avatarId}/200`} 
                  alt={agent.name}
                  className="w-8 h-8 rounded-full object-cover" 
                />
                {thinkingAgentId === agent.id && (
                  <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-200 truncate">{agent.name}</div>
                <div className="text-xs text-slate-500 truncate">{agent.role}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-slate-700">
          <Button variant="secondary" onClick={saveSession} className="w-full text-xs">
            <Save size={14} /> {t.saveProgress}
          </Button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative">
        {/* Header */}
        <header className="h-14 bg-slate-800/50 backdrop-blur border-b border-slate-700 flex items-center justify-between px-4 sm:px-6 flex-shrink-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-lg font-semibold text-white truncate max-w-md" title={state.topic}>
              {state.topic}
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-mono animate-pulse">
              {t.live}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleQuickSummary}
              className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2"
              title={t.quickSummary}
            >
              <FileText size={20} /> <span className="hidden sm:inline text-sm font-medium">{t.quickSummary}</span>
            </button>
            <div className="h-6 w-px bg-slate-700 mx-1"></div>
             <button 
              onClick={() => setState(prev => ({ ...prev, isActive: !prev.isActive }))}
              className={`p-2 rounded-lg transition-colors ${state.isActive ? 'text-orange-400 hover:bg-orange-400/10' : 'text-green-400 hover:bg-green-400/10'}`}
              title={state.isActive ? "Pause" : "Resume"}
            >
              {state.isActive ? <StopCircle size={20} /> : <PlayCircle size={20} />}
            </button>
            <Button variant="danger" onClick={endMeeting} className="text-xs py-1.5 px-3 ml-2">
              {t.endMeeting}
            </Button>
            <button 
               onClick={saveSession}
               className="md:hidden p-2 text-slate-400 hover:text-white"
            >
               <Save size={20} />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div 
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 scroll-smooth"
        >
          {state.messages.map(msg => (
            <ChatMessage 
              key={msg.id} 
              message={msg} 
              agent={state.agents.find(a => a.id === msg.senderId)} 
            />
          ))}
          {thinkingAgentId && !state.messages.some(m => m.senderId === thinkingAgentId && m.content === '') && (
            <div className="flex items-center gap-2 text-slate-500 text-sm pl-4 animate-pulse">
              <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-0"></span>
              <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-150"></span>
              <span className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-300"></span>
              <span>
                {state.agents.find(a => a.id === thinkingAgentId)?.name} {t.typing}
              </span>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-slate-800 border-t border-slate-700 flex-shrink-0 z-20">
          <div className="max-w-4xl mx-auto relative flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleUserMessage()}
              placeholder={t.joinDiscussion}
              className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
            <button 
              onClick={handleUserMessage}
              disabled={!inputValue.trim()}
              className="bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={20} />
            </button>
          </div>
          <div className="text-center mt-2">
            <span className="text-xs text-slate-500">
              {t.aiDisclaimer}
            </span>
          </div>
        </div>
      </div>

      {/* Summary Modal */}
      {isSummaryOpen && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
           <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200">
              <div className="p-4 border-b border-slate-700 flex items-center justify-between">
                <h3 className="font-semibold text-white flex items-center gap-2">
                   <FileText size={18} className="text-blue-400"/>
                   {t.currentSummaryTitle}
                </h3>
                <button onClick={() => setIsSummaryOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto">
                 {isSummaryLoading ? (
                   <div className="flex flex-col items-center justify-center py-8 text-slate-400 gap-3">
                      <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
                      <p>{t.generating}</p>
                   </div>
                 ) : (
                   <div className="prose prose-invert max-w-none text-sm leading-relaxed">
                      <ReactMarkdown>{summaryText}</ReactMarkdown>
                   </div>
                 )}
              </div>
              <div className="p-4 border-t border-slate-700 bg-slate-800/50 flex justify-end rounded-b-xl">
                 <Button variant="secondary" onClick={() => setIsSummaryOpen(false)}>
                    {t.close}
                 </Button>
              </div>
           </div>
        </div>
      )}
    </div>
  );

  const renderReportStage = () => (
    <div className="max-w-3xl mx-auto w-full p-6 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between mb-8 flex-shrink-0">
        <div>
          <h2 className="text-3xl font-bold text-white flex items-center gap-3">
            <FileText className="text-blue-400" />
            {t.meetingMinutes}
          </h2>
          <p className="text-slate-400 mt-1">Topic: {state.topic}</p>
        </div>
        <div className="flex gap-2">
           <Button variant="secondary" onClick={saveSession}>
            <Save size={16} /> {t.save}
          </Button>
          <Button variant="ghost" onClick={restartApp}>
            <RotateCcw size={16} /> {t.newMeeting}
          </Button>
        </div>
      </div>

      <div className="bg-white text-slate-800 p-8 rounded-xl shadow-2xl overflow-y-auto flex-1 font-serif leading-relaxed min-h-0">
        <div className="prose max-w-none">
          <ReactMarkdown>
            {report || "Generating report..."}
          </ReactMarkdown>
        </div>
      </div>
      
      <div className="mt-6 flex justify-center flex-shrink-0">
         <p className="text-xs text-slate-500">{t.autoSaveHint}</p>
      </div>
    </div>
  );

  return (
    <div className="h-screen overflow-hidden bg-slate-900 text-slate-100 flex flex-col">
      {stage === 'topic' && renderTopicStage()}
      {stage === 'roles' && renderRolesStage()}
      {stage === 'meeting' && renderMeetingStage()}
      {stage === 'report' && renderReportStage()}
    </div>
  );
}
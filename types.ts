export interface Agent {
  id: string;
  name: string;
  role: string;
  personality: string;
  avatarId: number;
}

export interface Message {
  id: string;
  senderId: string; // 'user' or agent.id
  senderName: string;
  content: string;
  thought?: string; // Internal monologue
  timestamp: number;
  type: 'speech' | 'system';
}

export type AppStage = 'topic' | 'roles' | 'meeting' | 'report';
export type Language = 'en' | 'zh';

export interface MeetingState {
  topic: string;
  agents: Agent[];
  messages: Message[];
  isActive: boolean; // Is the discussion currently flowing auto-pilot?
  isGenerating: boolean; // Is an agent currently generating a response?
  language: Language;
}

export interface ReportData {
  summary: string;
  conclusion: string;
  actionItems: string[];
}
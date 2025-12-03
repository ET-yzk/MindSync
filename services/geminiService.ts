import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Agent, Message, Language } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const MODEL_FAST = 'gemini-2.5-flash';
const MODEL_SMART = 'gemini-2.5-flash'; 

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000;

/**
 * Wraps an async function with retry logic for handling Rate Limit (429) errors.
 */
async function callWithRetry<T>(fn: () => Promise<T>, retries = MAX_RETRIES, delay = INITIAL_BACKOFF_MS): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isRateLimit = 
      error?.status === 429 || 
      error?.code === 429 || 
      error?.message?.includes('429') || 
      error?.status === 'RESOURCE_EXHAUSTED';
    
    if (isRateLimit && retries > 0) {
      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 500;
      const actualDelay = delay + jitter;
      console.warn(`Rate limit hit. Retrying in ${Math.round(actualDelay)}ms... (${retries} retries left)`);
      
      await new Promise(resolve => setTimeout(resolve, actualDelay));
      return callWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

/**
 * Generates a list of suggested roles/agents based on the discussion topic.
 */
export const generateRolesForTopic = async (topic: string, language: Language): Promise<Agent[]> => {
  const langInstruction = language === 'zh' ? 'Simplified Chinese (zh-CN)' : 'English';
  
  const schema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        role: { type: Type.STRING, description: "Job title or perspective (e.g., 'Skeptic', 'Optimist', 'Financial Expert')" },
        personality: { type: Type.STRING, description: "Short description of how they behave and speak." },
      },
      required: ["name", "role", "personality"],
    },
  };

  const prompt = `
    Analyze the following meeting topic: "${topic}".
    Generate 3 to 4 distinct, diverse, and relevant participants/experts to debate or discuss this topic.
    Ensure they have conflicting or complementary viewpoints to make the discussion interesting.
    The agents should be rational, objective, and capable of changing their minds if presented with good arguments.
    
    IMPORTANT: The output JSON content (names, roles, personalities) MUST be in ${langInstruction}.
  `;

  return callWithRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: MODEL_FAST,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
          systemInstruction: "You are an expert meeting facilitator.",
        },
      });

      const data = JSON.parse(response.text || "[]");
      
      // Enrich with IDs and Avatar IDs
      return data.map((item: any, index: number) => ({
        ...item,
        id: `agent-${Date.now()}-${index}`,
        avatarId: index + 1,
      }));
    } catch (error) {
      console.error("Error generating roles:", error);
      throw error;
    }
  });
};

/**
 * Step 1: Generate the Agent's internal thought (Fast, Non-streaming).
 */
export const generateAgentThought = async (
  agent: Agent,
  topic: string,
  history: Message[],
  allAgents: Agent[],
  language: Language
): Promise<string> => {
  const langInstruction = language === 'zh' ? 'Simplified Chinese (zh-CN)' : 'English';

  const transcript = history
    .slice(-10)
    .map(m => `${m.senderName}: ${m.content}`)
    .join("\n");

  const otherAgents = allAgents
    .filter(a => a.id !== agent.id)
    .map(a => `${a.name} (${a.role})`)
    .join(", ");

  const prompt = `
    Topic: "${topic}"
    You are: ${agent.name} (${agent.role}). Personality: ${agent.personality}.
    Others: ${otherAgents}
    
    Transcript:
    ${transcript}

    Task: Generate a ONE sentence internal thought about what you want to say next. 
    Reasoning only. Do not generate the speech yet.
    Be rational. If you agree with a previous point, acknowledge it.
    
    Output JSON: { "thought": "string" }
    Language: ${langInstruction}
    Format: Plain Text (No Markdown)
  `;

  return callWithRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: MODEL_FAST,
        contents: prompt,
        config: { 
          responseMimeType: "application/json",
          responseSchema: { type: Type.OBJECT, properties: { thought: { type: Type.STRING } } }
        }
      });
      const data = JSON.parse(response.text || "{}");
      return data.thought || "Thinking...";
    } catch (e) {
      return "Thinking...";
    }
  });
};

/**
 * Step 2: Generate the Agent's speech (Streaming).
 */
export async function* generateAgentSpeechStream(
  agent: Agent,
  thought: string,
  topic: string,
  history: Message[],
  language: Language
) {
  const langInstruction = language === 'zh' ? 'Simplified Chinese (zh-CN)' : 'English';
  
  const transcript = history
    .slice(-10)
    .map(m => `${m.senderName}: ${m.content}`)
    .join("\n");

  const prompt = `
    Topic: "${topic}"
    You are: ${agent.name} (${agent.role}). Personality: ${agent.personality}.
    
    Transcript:
    ${transcript}

    Your Internal Thought: "${thought}"

    Task: Speak to the group based on your thought. Be conversational, rational, and objective.
    Output: Just the spoken text. No JSON. No Markdown formatting.
    Language: ${langInstruction}
  `;

  try {
    // We retry the connection/start of the stream
    const result = await callWithRetry(async () => {
       return await ai.models.generateContentStream({
        model: MODEL_FAST,
        contents: prompt,
      });
    });

    for await (const chunk of result) {
      const text = chunk.text;
      if (text) yield text;
    }
  } catch (error) {
    console.error("Stream error after retries", error);
    yield "Error: Service busy. Please try again later.";
  }
}

/**
 * Checks if the Meeting Assistant should intervene to summarize or guide.
 */
export const generatePhaseCheck = async (
  topic: string,
  history: Message[],
  language: Language,
  currentPhaseTurns: number
): Promise<string | null> => {
  const langInstruction = language === 'zh' ? 'Simplified Chinese (zh-CN)' : 'English';

  // Only check roughly the last few turns to see if we need a summary
  const transcript = history.slice(-8).map(m => `${m.senderName}: ${m.content}`).join("\n");

  const prompt = `
    Topic: ${topic}
    Current Phase Turns: ${currentPhaseTurns}
    Transcript:
    ${transcript}

    You are the "Meeting Assistant".
    Analyze the recent discussion and deciding if you need to intervene based on these rules:
    
    1. CONSENSUS: If ALL participants have agreed on a point, output a summary and suggest moving on.
    2. MAJORITY + TIME: If a majority agree AND turns > 6, output a summary noting the majority view and suggest moving on.
    3. STALEMATE: If NO consensus AND turns > 12, output a summary of the conflict and suggest a new angle or vote.

    If none of these apply, output "NO_ACTION".

    Output specific intervention text (max 40 words) or "NO_ACTION".
    Language: ${langInstruction}
    Format: Plain Text
  `;

  return callWithRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: MODEL_FAST,
        contents: prompt,
      });
      
      const text = response.text?.trim();
      if (!text || text.includes("NO_ACTION")) return null;
      return text;
    } catch (e) {
      return null;
    }
  });
};

export const generateQuickSummary = async (topic: string, history: Message[], language: Language): Promise<string> => {
  const langInstruction = language === 'zh' ? 'Simplified Chinese (zh-CN)' : 'English';
  
  const transcript = history
    .filter(m => m.type === 'speech')
    .map(m => `${m.senderName}: ${m.content}`)
    .join("\n");

  const prompt = `
    Topic: ${topic}
    Transcript:
    ${transcript}

    Task: Provide a concise summary of the discussion so far (maximum 200 words). 
    Highlight the main points raised and any emerging consensus or conflict.
    
    IMPORTANT: Write the summary in ${langInstruction}.
  `;

  return callWithRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: MODEL_FAST,
        contents: prompt,
      });
      return response.text || "No summary available.";
    } catch (error) {
      console.error("Error generating quick summary:", error);
      return "Error generating summary (Quota Exceeded).";
    }
  });
};

export const generateMeetingReport = async (topic: string, history: Message[], language: Language): Promise<string> => {
  const langInstruction = language === 'zh' ? 'Simplified Chinese (zh-CN)' : 'English';
  
  const transcript = history
    .filter(m => m.type === 'speech')
    .map(m => `${m.senderName}: ${m.content}`)
    .join("\n");

  const prompt = `
    Topic: ${topic}

    Transcript:
    ${transcript}

    Task:
    Generate a professional meeting report in Markdown format.
    Include:
    1. Executive Summary
    2. Key Arguments/Points Discussed
    3. Conclusion/Consensus Reached (if any)
    4. Suggested Next Steps

    IMPORTANT: Write the report in ${langInstruction}.
  `;

  return callWithRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: MODEL_SMART,
        contents: prompt,
      });
      return response.text || "Failed to generate report.";
    } catch (error) {
      console.error("Error generating report:", error);
      return "An error occurred while generating the report. Please try again later.";
    }
  });
};

export const generateTopicSuggestions = async (language: Language): Promise<string[]> => {
  const langInstruction = language === 'zh' ? 'Simplified Chinese (zh-CN)' : 'English';

  const prompt = `
    Generate 4 distinct, engaging, and debatable topics for a meeting simulation or debate.
    Topics should be diverse, covering technology, ethics, society, or business.
    Topics should be specific enough to spark immediate discussion.
    Return ONLY a JSON array of strings.

    IMPORTANT: The topics MUST be in ${langInstruction}.
  `;
  
  const schema: Schema = {
    type: Type.ARRAY,
    items: { type: Type.STRING }
  };

  return callWithRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: MODEL_FAST,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      });
      
      return JSON.parse(response.text || "[]");
    } catch (error) {
      console.error("Error generating topic suggestions:", error);
      return [];
    }
  });
};
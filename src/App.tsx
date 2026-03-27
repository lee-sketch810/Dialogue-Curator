/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, type FormEvent } from 'react';
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import { Search, Heart, Sparkles, MessageSquare, Quote, Loader2, Film, User, Info, Copy, Check, Flame, CloudRain, Coffee, Moon, HeartOff, Shield, Plane, Home, Users, Laugh, Shuffle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Remove top-level genAI initialization to ensure fresh key usage
const getGenAI = () => {
  const key = 
    process.env.GEMINI_API_KEY2 || 
    process.env.GEMINI_API_KEY || 
    (import.meta as any).env?.VITE_GEMINI_API_KEY2 || 
    (import.meta as any).env?.VITE_GEMINI_API_KEY;
    
  if (!key || key === 'MY_GEMINI_API_KEY' || key === 'MY_GEMINI_API_KEY2' || key === 'undefined') {
    throw new Error("API_KEY_MISSING");
  }
  return new GoogleGenAI({ apiKey: key });
};

interface Dialogue {
  quote: string;
  work: string;
  character: string;
  actor: string;
  context: string;
  category: string;
}

const CATEGORIES = [
  { id: 'comfort', label: '위로가 필요할 때', icon: Heart },
  { id: 'confidence', label: '자신감이 필요할 때', icon: Sparkles },
  { id: 'love', label: '사랑을 느낄 때', icon: MessageSquare },
  { id: 'growth', label: '성장이 필요할 때', icon: Quote },
  { id: 'sad', label: '펑펑 울고 싶을 때', icon: CloudRain },
  { id: 'angry', label: '답답하고 화날 때', icon: Flame },
  { id: 'dream', label: '꿈을 향해 나아갈 때', icon: Moon },
  { id: 'parting', label: '이별의 아픔이 있을 때', icon: HeartOff },
  { id: 'courage', label: '용기가 부족할 때', icon: Shield },
  { id: 'travel', label: '어딘가 떠나고 싶을 때', icon: Plane },
  { id: 'family', label: '가족이 그리울 때', icon: Home },
  { id: 'friend', label: '우정이 소중할 때', icon: Users },
  { id: 'humor', label: '크게 웃고 싶을 때', icon: Laugh },
  { id: 'bored', label: '일상에 지루함을 느낄 때', icon: Coffee },
];

const DEFAULT_DIALOGUES: Dialogue[] = [
  {
    quote: "내일은 내일의 태양이 뜰 거야.",
    work: "바람과 함께 사라지다",
    character: "스칼렛 오하라",
    actor: "비비안 리",
    context: "어떤 절망적인 상황에서도 희망을 잃지 말라는 메시지를 담은 고전 명대사입니다.",
    category: "위로"
  },
  {
    quote: "카르페 디엠. 오늘을 즐겨라. 너희들의 삶을 특별하게 만들어라.",
    work: "죽은 시인의 사회",
    character: "존 키팅",
    actor: "로빈 윌리엄스",
    context: "현재의 소중함과 주체적인 삶의 중요성을 일깨워주는 대사입니다.",
    category: "성장"
  },
  {
    quote: "가장 낮은 곳에서 가장 높은 곳까지, 당신은 할 수 있어요.",
    work: "포레스트 검프",
    character: "포레스트 검프",
    actor: "톰 행크스",
    context: "순수한 열정과 끈기가 만들어내는 기적을 보여주는 따뜻한 위로의 문장입니다.",
    category: "위로"
  }
];

export default function App() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Dialogue[]>(DEFAULT_DIALOGUES);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [quotePool, setQuotePool] = useState<Dialogue[]>([]);

  useEffect(() => {
    const cached = localStorage.getItem('daily_dialogues');
    if (cached) {
      try {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < 1000 * 60 * 60 * 12) {
          setResults(data);
          setIsInitialLoad(true);
          // Pre-fill pool in background
          fillQuotePool();
          return;
        }
      } catch (e) {}
    }
    searchDialogues('', '인생에 영감을 주는 무작위');
    fillQuotePool();
  }, []);

  const DIALOGUE_SCHEMA = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        quote: { type: Type.STRING, description: "The movie/drama quote. Escape double quotes with backslashes." },
        work: { type: Type.STRING, description: "Title of the work" },
        character: { type: Type.STRING, description: "Character name" },
        actor: { type: Type.STRING, description: "Actor name" },
        context: { type: Type.STRING, description: "Brief context or reason for recommendation in Korean" },
        category: { type: Type.STRING, description: "Emotion category" },
      },
      required: ["quote", "work", "character", "actor", "context", "category"],
    },
  };

  const fillQuotePool = async () => {
    try {
      const ai = getGenAI();
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: "Recommend 3 random movie/drama quotes" }] }],
        config: {
          systemInstruction: "Return a JSON array of 3 objects. Use Korean. CRITICAL: Do NOT wrap the quote in quotation marks. Escape internal quotes with \\\". Return ONLY JSON.",
          responseMimeType: "application/json",
          responseSchema: DIALOGUE_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          maxOutputTokens: 1500
        },
      });
      const text = response.text;
      if (text) {
        const cleaned = text.replace(/```json\n?|```/g, '').trim();
        const start = cleaned.indexOf('[');
        const end = cleaned.lastIndexOf(']');
        const jsonStr = (start !== -1 && end !== -1) ? cleaned.substring(start, end + 1) : cleaned;
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) {
          const sanitized = parsed.map(item => ({
            ...item,
            quote: item.quote.replace(/^[ "'“‘]+|[ "'”’]+$/g, '').trim()
          }));
          setQuotePool(sanitized);
        }
      }
    } catch (e) {
      console.error("Pool Fill Error:", e);
    }
  };

  const searchDialogues = async (searchQuery: string, category?: string, isBackground = false) => {
    if (!isBackground) {
      setLoading(true);
      setResults([]);
    }
    setError(null);
    try {
      const ai = getGenAI();
      const model = "gemini-3-flash-preview";
      const prompt = category 
        ? `Recommend 3 unique movie or drama quotes for: "${category}".`
        : `Find 3 movie or drama quotes for: "${searchQuery}".`;

      const systemInstruction = `You are a professional Dialogue Curator. 
      Return a JSON array of 3 objects. 
      CRITICAL: Do NOT wrap the "quote" value in quotation marks (e.g., use "Hello" not "\"Hello\""). 
      Escape any internal double quotes with a backslash. 
      Do not use actual newlines inside strings. 
      Return ONLY the JSON array. Use Korean.`;

      const response = await ai.models.generateContent({
        model: model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: DIALOGUE_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          maxOutputTokens: 1500
        },
      });

      const text = response.text;
      if (text) {
        // Robust JSON extraction
        const cleaned = text.replace(/```json\n?|```/g, '').trim();
        const start = cleaned.indexOf('[');
        const end = cleaned.lastIndexOf(']');
        const jsonStr = (start !== -1 && end !== -1) ? cleaned.substring(start, end + 1) : cleaned;
        const parsed = JSON.parse(jsonStr);
        
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Sanitize quotes to remove extra wrapping quotes if AI provided them
          const sanitized = parsed.map(item => ({
            ...item,
            quote: item.quote.replace(/^[ "'“‘]+|[ "'”’]+$/g, '').trim()
          }));
          setResults(sanitized);
          
          if (!searchQuery && (category === '인생에 영감을 주는 무작위' || !category)) {
            localStorage.setItem('daily_dialogues', JSON.stringify({
              data: sanitized,
              timestamp: Date.now()
            }));
          }
        }
      }
    } catch (err: any) {
      console.error("Search Error:", err);
      if (!isBackground) {
        if (err.message === "API_KEY_MISSING") {
          setError("API 키가 설정되지 않았습니다. 환경 변수 설정을 확인해주세요.");
        } else {
          setError("데이터를 처리하는 중 오류가 발생했습니다. 버튼을 다시 눌러주세요.");
        }
      }
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSelectedCategory(null);
    setIsInitialLoad(false);
    searchDialogues(query);
  };

  const handleCategoryClick = (categoryId: string, label: string) => {
    setSelectedCategory(categoryId);
    setQuery('');
    setIsInitialLoad(false);
    searchDialogues('', label);
  };

  const handleRandomClick = () => {
    if (quotePool.length > 0) {
      setResults(quotePool);
      setQuotePool([]);
      fillQuotePool(); // Refill pool
      setSelectedCategory(null);
      setQuery('');
      setIsInitialLoad(true);
    } else {
      setSelectedCategory(null);
      setQuery('');
      setIsInitialLoad(true);
      searchDialogues('', '인생에 영감을 주는 무작위');
    }
  };

  const copyToClipboard = async (item: Dialogue, index: number) => {
    const text = `"${item.quote}" -<${item.work}>, ${item.character}(${item.actor})`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(index);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#2C2C2C] font-sans selection:bg-[#E6D5B8]">
      {/* Hero Section */}
      <header className="pt-20 pb-12 px-6 max-w-4xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-4xl md:text-5xl font-serif italic mb-4 tracking-tight">
            Dialogue Curator
          </h1>
          <p className="text-[#6B6B6B] text-lg font-light mb-12">
            당신의 마음을 대변할 한 문장을 찾아드립니다.
          </p>
        </motion.div>

        {/* Search Bar */}
        <motion.form 
          onSubmit={handleSearch}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="relative max-w-2xl mx-auto mb-12"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="작품명, 배우, 혹은 지금의 기분을 입력해보세요..."
            className="w-full px-6 py-4 rounded-full bg-white border border-[#E5E5E5] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#D4A373] transition-all text-lg placeholder:text-[#A0A0A0]"
          />
          <button 
            type="submit"
            disabled={loading}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-[#2C2C2C] text-white rounded-full hover:bg-[#404040] transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Search className="w-6 h-6" />}
          </button>
        </motion.form>

        {/* Categories */}
        <div className="flex flex-wrap justify-center gap-3 mb-16">
          <button
            onClick={handleRandomClick}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-[#D4A373] bg-[#FDFCFB] text-[#D4A373] hover:bg-[#D4A373] hover:text-white transition-all text-sm font-bold shadow-sm"
          >
            <Shuffle className="w-4 h-4" />
            랜덤 추천
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat.id, cat.label)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-full border transition-all text-sm font-medium",
                selectedCategory === cat.id
                  ? "bg-[#2C2C2C] text-white border-[#2C2C2C]"
                  : "bg-white text-[#6B6B6B] border-[#E5E5E5] hover:border-[#D4A373] hover:text-[#D4A373]"
              )}
            >
              <cat.icon className="w-4 h-4" />
              {cat.label}
            </button>
          ))}
        </div>
      </header>

      {/* Results Section */}
      <main className="max-w-5xl mx-auto px-6 pb-24">
        <AnimatePresence mode="popLayout">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="grid gap-8"
            >
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white p-8 md:p-12 rounded-3xl border border-[#F0F0F0] animate-pulse">
                  <div className="w-10 h-10 bg-[#F5EBE0] rounded-lg mb-6" />
                  <div className="h-8 bg-[#F5F5F5] rounded-md w-3/4 mb-6" />
                  <div className="flex gap-4 mb-6">
                    <div className="h-4 bg-[#F5F5F5] rounded-md w-24" />
                    <div className="h-4 bg-[#F5F5F5] rounded-md w-32" />
                  </div>
                  <div className="pt-6 border-t border-[#F5F5F5]">
                    <div className="h-4 bg-[#F5F5F5] rounded-md w-full mb-2" />
                    <div className="h-4 bg-[#F5F5F5] rounded-md w-2/3" />
                  </div>
                </div>
              ))}
            </motion.div>
          ) : results.length > 0 ? (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="grid gap-8"
            >
              {isInitialLoad && !selectedCategory && !query && (
                <motion.div 
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-2 text-[#D4A373] mb-2"
                >
                  <Sparkles className="w-5 h-5" />
                  <h2 className="text-sm font-bold uppercase tracking-widest">오늘의 추천 대사</h2>
                </motion.div>
              )}
              {results.map((item, idx) => (
                <motion.article
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: idx * 0.05 }}
                  className="bg-white p-8 md:p-12 rounded-3xl border border-[#F0F0F0] shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group"
                >
                  <div className="absolute top-0 left-0 w-1.5 h-full bg-[#D4A373] opacity-50 group-hover:opacity-100 transition-opacity" />
                  
                  <div className="flex flex-col gap-6">
                    <div className="flex items-start justify-between">
                      <Quote className="w-10 h-10 text-[#F5EBE0]" />
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => copyToClipboard(item, idx)}
                          className="p-2 rounded-full hover:bg-[#F5F5F5] text-[#A0A0A0] hover:text-[#2C2C2C] transition-all flex items-center gap-2 text-xs font-medium"
                          title="대사 복사하기"
                        >
                          {copiedId === idx ? (
                            <>
                              <Check className="w-4 h-4 text-green-500" />
                              <span className="text-green-600">복사됨</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              <span>복사</span>
                            </>
                          )}
                        </button>
                        <span className="text-[10px] uppercase tracking-widest text-[#A0A0A0] font-bold">
                          {item.category}
                        </span>
                      </div>
                    </div>

                    <blockquote className="text-2xl md:text-3xl font-serif leading-relaxed text-[#2C2C2C]">
                      "{item.quote}"
                    </blockquote>

                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <div className="flex items-center gap-1.5 text-[#6B6B6B]">
                        <Film className="w-4 h-4" />
                        <span className="font-medium">{item.work}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[#6B6B6B]">
                        <User className="w-4 h-4" />
                        <span>{item.character} ({item.actor})</span>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-[#F5F5F5]">
                      <div className="flex items-start gap-3">
                        <Info className="w-4 h-4 text-[#D4A373] mt-1 shrink-0" />
                        <p className="text-[#6B6B6B] leading-relaxed text-sm md:text-base italic">
                          {item.context}
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.article>
              ))}
            </motion.div>
          ) : !loading && !error && (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20"
            >
              <p className="text-[#A0A0A0]">검색어나 카테고리를 선택하여 명대사를 찾아보세요.</p>
            </motion.div>
          )}

          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-10 text-red-400 text-sm italic"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-[#F0F0F0] text-center">
        <p className="text-[#A0A0A0] text-xs tracking-widest uppercase">
          © 2026 Dialogue Curator • Curated with Heart
        </p>
      </footer>
    </div>
  );
}

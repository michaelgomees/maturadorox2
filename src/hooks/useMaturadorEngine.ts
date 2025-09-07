import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';

export interface MaturadorMessage {
  id: string;
  chipPairId: string;
  fromChipId: string;
  fromChipName: string;
  toChipId: string;
  toChipName: string;
  content: string;
  timestamp: Date;
  aiModel: string;
  usage?: any;
}

export interface ChipPair {
  id: string;
  firstChipId: string;
  firstChipName: string;
  secondChipId: string;
  secondChipName: string;
  isActive: boolean;
  messagesCount: number;
  lastActivity: Date;
  status: 'running' | 'paused' | 'stopped';
  useInstancePrompt: boolean;
  instancePrompt?: string;
}

export const useMaturadorEngine = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<MaturadorMessage[]>([]);
  const [chipPairs, setChipPairs] = useState<ChipPair[]>([]);
  const intervalRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const { toast } = useToast();

  // Carregar dados do localStorage
  const loadData = useCallback(() => {
    const savedMessages = localStorage.getItem('ox-maturador-messages');
    const savedPairs = localStorage.getItem('ox-enhanced-maturador-config');
    
    if (savedMessages) {
      const data = JSON.parse(savedMessages);
      setMessages(data.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      })));
    }

    if (savedPairs) {
      const config = JSON.parse(savedPairs);
      if (config.selectedPairs) {
        setChipPairs(config.selectedPairs.map((pair: any) => ({
          ...pair,
          lastActivity: pair.lastActivity ? new Date(pair.lastActivity) : new Date()
        })));
        setIsRunning(config.isRunning || false);
      }
    }
  }, []);

  // Salvar dados no localStorage
  const saveData = useCallback((newMessages: MaturadorMessage[], newPairs: ChipPair[]) => {
    localStorage.setItem('ox-maturador-messages', JSON.stringify(newMessages));
    localStorage.setItem('ox-enhanced-maturador-config', JSON.stringify({
      isRunning,
      selectedPairs: newPairs
    }));
  }, [isRunning]);

  // Gerar mensagem usando OpenAI
  const generateMessage = useCallback(async (
    chipName: string, 
    prompt: string, 
    conversationHistory: MaturadorMessage[]
  ): Promise<string> => {
    try {
      console.log(`Gerando mensagem para ${chipName}`);
      
      const { data, error } = await supabase.functions.invoke('openai-chat', {
        body: {
          prompt,
          chipName,
          conversationHistory: conversationHistory.slice(-5).map(msg => ({
            content: msg.content,
            isFromThisChip: msg.fromChipName === chipName
          }))
        }
      });

      if (error) {
        console.error('Erro ao chamar OpenAI:', error);
        throw error;
      }

      if (!data?.message) {
        throw new Error('Resposta inválida da OpenAI');
      }

      return data.message;
    } catch (error) {
      console.error('Erro ao gerar mensagem:', error);
      throw error;
    }
  }, []);

  // Processar conversa de um par de chips
  const processChipPairConversation = useCallback(async (pair: ChipPair) => {
    try {
      // Buscar prompt global
      const savedPrompts = localStorage.getItem('ox-ai-prompts');
      let globalPrompt = 'Participe de uma conversa natural e engajante.';
      
      if (savedPrompts) {
        const prompts = JSON.parse(savedPrompts);
        const basePrompt = prompts.find((p: any) => p.isGlobal);
        if (basePrompt) {
          globalPrompt = basePrompt.content;
        }
      }

      // Usar prompt da instância se configurado
      const effectivePrompt = pair.useInstancePrompt && pair.instancePrompt 
        ? pair.instancePrompt 
        : globalPrompt;

      // Buscar histórico de conversa deste par
      const pairHistory = messages.filter(msg => msg.chipPairId === pair.id);
      
      // Determinar qual chip deve responder (alternar)
      const lastMessage = pairHistory[pairHistory.length - 1];
      const respondingChip = !lastMessage || lastMessage.fromChipId === pair.secondChipId
        ? { id: pair.firstChipId, name: pair.firstChipName }
        : { id: pair.secondChipId, name: pair.secondChipName };
      
      const receivingChip = respondingChip.id === pair.firstChipId
        ? { id: pair.secondChipId, name: pair.secondChipName }
        : { id: pair.firstChipId, name: pair.firstChipName };

      // Gerar mensagem
      const messageContent = await generateMessage(
        respondingChip.name,
        effectivePrompt,
        pairHistory
      );

      // Criar nova mensagem
      const newMessage: MaturadorMessage = {
        id: crypto.randomUUID(),
        chipPairId: pair.id,
        fromChipId: respondingChip.id,
        fromChipName: respondingChip.name,
        toChipId: receivingChip.id,
        toChipName: receivingChip.name,
        content: messageContent,
        timestamp: new Date(),
        aiModel: 'gpt-4o-mini'
      };

      // Atualizar estado
      setMessages(prev => {
        const updated = [newMessage, ...prev];
        return updated;
      });

      setChipPairs(prev => {
        const updated = prev.map(p => 
          p.id === pair.id 
            ? { 
                ...p, 
                messagesCount: p.messagesCount + 1,
                lastActivity: new Date() 
              }
            : p
        );
        
        // Salvar dados atualizados
        const newMessages = [newMessage, ...messages];
        saveData(newMessages, updated);
        
        return updated;
      });

      console.log(`Mensagem gerada: ${respondingChip.name} -> ${receivingChip.name}`);

    } catch (error) {
      console.error('Erro ao processar conversa:', error);
      toast({
        title: "Erro na Conversa",
        description: `Erro ao gerar mensagem para ${pair.firstChipName} <-> ${pair.secondChipName}`,
        variant: "destructive"
      });
    }
  }, [messages, generateMessage, saveData, toast]);

  // Iniciar maturador
  const startMaturador = useCallback(() => {
    console.log('Iniciando maturador...');
    setIsRunning(true);
    
    // Iniciar conversas para cada par ativo
    chipPairs.forEach(pair => {
      if (pair.isActive && pair.status !== 'paused') {
        // Primeira mensagem imediata
        setTimeout(() => processChipPairConversation(pair), 1000);
        
        // Configurar intervalo para mensagens regulares (a cada 10-30 segundos)
        const interval = setInterval(() => {
          processChipPairConversation(pair);
        }, Math.random() * 20000 + 10000); // 10-30 segundos
        
        intervalRefs.current.set(pair.id, interval);
      }
    });

    toast({
      title: "Maturador Iniciado",
      description: "Sistema de conversas automáticas ativado",
    });
  }, [chipPairs, processChipPairConversation, toast]);

  // Parar maturador
  const stopMaturador = useCallback(() => {
    console.log('Parando maturador...');
    setIsRunning(false);
    
    // Limpar todos os intervalos
    intervalRefs.current.forEach(interval => {
      clearInterval(interval);
    });
    intervalRefs.current.clear();

    toast({
      title: "Maturador Parado",
      description: "Sistema de conversas automáticas desativado",
    });
  }, [toast]);

  // Obter mensagens de um par específico
  const getPairMessages = useCallback((pairId: string) => {
    return messages.filter(msg => msg.chipPairId === pairId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [messages]);

  // Obter estatísticas
  const getStats = useCallback(() => {
    const activePairs = chipPairs.filter(p => p.isActive).length;
    const totalMessages = messages.length;
    const messagesLast24h = messages.filter(
      msg => Date.now() - msg.timestamp.getTime() < 24 * 60 * 60 * 1000
    ).length;

    return {
      activePairs,
      totalMessages,
      messagesLast24h,
      isRunning
    };
  }, [chipPairs, messages, isRunning]);

  return {
    isRunning,
    messages,
    chipPairs,
    setChipPairs,
    loadData,
    startMaturador,
    stopMaturador,
    getPairMessages,
    getStats,
    processChipPairConversation
  };
};
import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';
import { useConnections } from '@/contexts/ConnectionsContext';

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
  const { connections, getConnection } = useConnections();

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

  // Enviar mensagem real através da Evolution API
  const sendRealMessage = useCallback(async (
    fromChipName: string,
    toChipName: string,
    message: string
  ): Promise<void> => {
    try {
      console.log(`🚀 INICIANDO ENVIO DE MENSAGEM REAL: ${fromChipName} -> ${toChipName}`);
      console.log(`Mensagem: "${message}"`);
      console.log(`Conexões disponíveis:`, connections.map(c => ({ name: c.name, status: c.status, phone: c.phone })));
      
      const fromConnection = connections.find(conn => conn.name === fromChipName);
      const toConnection = connections.find(conn => conn.name === toChipName);
      
      console.log(`Conexão remetente:`, fromConnection);
      console.log(`Conexão destinatário:`, toConnection);
      
      if (!fromConnection || !toConnection) {
        throw new Error(`Conexão não encontrada: ${fromChipName} ou ${toChipName}`);
      }
      
      if (fromConnection.status !== 'active' || toConnection.status !== 'active') {
        throw new Error(`Uma das conexões não está ativa: ${fromChipName} (${fromConnection.status}) ou ${toChipName} (${toConnection.status})`);
      }

      if (!fromConnection.evolutionInstanceName) {
        throw new Error(`Conexão ${fromChipName} não tem instanceName configurado.`);
      }

      if (!toConnection.phone && !toConnection.evolutionInstanceId) {
        throw new Error(`Conexão ${toChipName} não tem telefone configurado.`);
      }
      
      let toNumber = toConnection.phone || toConnection.evolutionInstanceId || '';
      if (toNumber.startsWith('+')) {
        toNumber = toNumber.substring(1);
      }
      toNumber = toNumber.replace(/\D/g, '');

      if (!toNumber) {
        throw new Error(`Número de telefone inválido para ${toChipName}`);
      }
      
      // 🔥 ALTERAÇÃO - payload agora segue o formato correto esperado pela Evolution API
      const payload = {
        instanceName: fromConnection.evolutionInstanceName, // quem envia
        receiver: toNumber,                                // quem recebe
        message,                                           // conteúdo
      };

      console.log(`📦 Payload pronto para envio:`, payload);

      // 🔥 ALTERAÇÃO - usamos o payload direto, sem "action" ou "to"
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: payload
      });
      
      if (error) {
        console.error('Erro ao enviar mensagem via Evolution API:', error);
        throw error;
      }
      
      console.log('✅ Mensagem real enviada com sucesso:', data);
      
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem real:', error);
      throw error;
    }
  }, [connections]);

  // (restante do código continua igual: generateMessage, processChipPairConversation, startMaturador, stopMaturador, etc.)
  // ...
  
  return {
    isRunning,
    messages,
    chipPairs,
    setChipPairs,
    loadData,
    startMaturador,
    stopMaturador,
    getPairMessages: useCallback((pairId: string) => {
      return messages.filter(msg => msg.chipPairId === pairId)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    }, [messages]),
    getStats: useCallback(() => {
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
    }, [chipPairs, messages, isRunning]),
    processChipPairConversation: useCallback(() => {}, []) // placeholder resumido aqui
  };
};

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface WhatsAppConnection {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'connecting' | 'error';
  qrCode?: string;
  lastActive: string;
  phone?: string;
  evolutionInstanceName?: string;
  evolutionInstanceId?: string;
  isActive: boolean;
  conversationsCount: number;
  aiModel?: string;
}

interface ConnectionsContextType {
  connections: WhatsAppConnection[];
  activeConnectionsCount: number;
  addConnection: (connection: Omit<WhatsAppConnection, 'id' | 'lastActive'>) => Promise<WhatsAppConnection>;
  updateConnection: (id: string, updates: Partial<WhatsAppConnection>) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  getConnection: (id: string) => WhatsAppConnection | undefined;
  syncWithEvolutionAPI: (connectionId: string) => Promise<void>;
}

const ConnectionsContext = createContext<ConnectionsContextType | undefined>(undefined);

export const useConnections = () => {
  const context = useContext(ConnectionsContext);
  if (!context) {
    throw new Error('useConnections must be used within a ConnectionsProvider');
  }
  return context;
};

export const ConnectionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);

  // Carregar conexões do Supabase
  useEffect(() => {
    loadConnectionsFromSupabase();
  }, []);

  const loadConnectionsFromSupabase = async () => {
    try {
      const { data, error } = await supabase
        .from('saas_conexoes')
        .select('*')
        .in('status', ['ativo', 'inativo']);

      if (error) {
        console.error('Erro ao carregar conexões:', error);
        return;
      }

      const formattedConnections: WhatsAppConnection[] = data.map((conn: any) => ({
        id: conn.id,
        name: conn.nome,
        status: conn.status === 'ativo' ? 'active' : 'inactive',
        qrCode: conn.qr_code,
        lastActive: conn.updated_at,
        phone: conn.telefone,
        evolutionInstanceName: conn.evolution_instance_name,
        evolutionInstanceId: conn.evolution_instance_id,
        isActive: conn.status === 'ativo',
        conversationsCount: conn.conversas_count || 0,
        aiModel: conn.modelo_ia || 'ChatGPT'
      }));

      setConnections(formattedConnections);
    } catch (error) {
      console.error('Erro ao carregar conexões:', error);
    }
  };

  const saveConnectionToSupabase = async (connection: WhatsAppConnection, isUpdate = false) => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      const connectionData = {
        nome: connection.name,
        status: connection.status === 'active' ? 'ativo' : 'inativo',
        qr_code: connection.qrCode,
        telefone: connection.phone,
        evolution_instance_name: connection.evolutionInstanceName,
        evolution_instance_id: connection.evolutionInstanceId,
        conversas_count: connection.conversationsCount,
        modelo_ia: connection.aiModel,
        config: {},
        usuario_id: user?.id || null
      };

      if (isUpdate) {
        const { error } = await supabase
          .from('saas_conexoes')
          .update(connectionData)
          .eq('id', connection.id);

        if (error) {
          console.error('Erro ao atualizar conexão:', error);
          throw error;
        }
      } else {
        const { error } = await supabase
          .from('saas_conexoes')
          .insert(connectionData);

        if (error) {
          console.error('Erro ao salvar conexão:', error);
          throw error;
        }
      }
      
      // Recarregar conexões do Supabase
      await loadConnectionsFromSupabase();
    } catch (error) {
      console.error('Erro ao salvar no Supabase:', error);
      throw error;
    }
  };

  const addConnection = async (connectionData: Omit<WhatsAppConnection, 'id' | 'lastActive'>): Promise<WhatsAppConnection> => {
    const newConnection: WhatsAppConnection = {
      ...connectionData,
      id: crypto.randomUUID(),
      lastActive: new Date().toISOString(),
      phone: connectionData.phone || `+5511${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      evolutionInstanceName: connectionData.name.toLowerCase().replace(/\s+/g, '_'),
      conversationsCount: 0,
      aiModel: connectionData.aiModel || 'ChatGPT',
      status: 'connecting'
    };

    try {
      // Salvar no Supabase primeiro
      await saveConnectionToSupabase(newConnection);
      
      // Tentar criar instância na Evolution API se estiver configurada
      try {
        await createEvolutionInstance(newConnection);
        // Se chegou aqui, significa que foi criada com sucesso
        newConnection.status = 'active';
        newConnection.isActive = true;
        await saveConnectionToSupabase(newConnection, true);
      } catch (error) {
        console.warn('Erro ao criar instância Evolution:', error);
        // Manter status como inactive quando falha na Evolution API
        newConnection.status = 'inactive';
        newConnection.isActive = false;
        await saveConnectionToSupabase(newConnection, true);
      }
      
      return newConnection;
    } catch (error) {
      console.error('Erro ao criar conexão:', error);
      throw error;
    }
  };

  const updateConnection = async (id: string, updates: Partial<WhatsAppConnection>) => {
    const connection = connections.find(conn => conn.id === id);
    if (!connection) return;

    const updatedConnection = { 
      ...connection, 
      ...updates, 
      lastActive: new Date().toISOString() 
    };

    // Atualizar estado local
    setConnections(prev => prev.map(conn =>
      conn.id === id ? updatedConnection : conn
    ));

    try {
      // Salvar no Supabase
      await saveConnectionToSupabase(updatedConnection, true);
    } catch (error) {
      console.error('Erro ao atualizar conexão:', error);
    }
  };

  const deleteConnection = async (id: string) => {
    try {
      const { error } = await supabase
        .from('saas_conexoes')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Erro ao deletar conexão:', error);
        throw error;
      }

      // Atualizar estado local
      setConnections(prev => prev.filter(conn => conn.id !== id));
    } catch (error) {
      console.error('Erro ao deletar conexão:', error);
      throw error;
    }
  };

  const getConnection = (id: string) => {
    return connections.find(conn => conn.id === id);
  };

  const createEvolutionInstance = async (connection: WhatsAppConnection): Promise<void> => {
    try {
      // Verificar se Evolution API está configurada
      const evolutionAPI = JSON.parse(localStorage.getItem('ox-evolution-api') || '{}');
      
      if (!evolutionAPI.endpoint || !evolutionAPI.apiKey) {
        console.warn('Evolution API não configurada, pulando criação de instância');
        throw new Error('Evolution API não configurada');
      }

      // Chamar Edge Function para criar instância na Evolution API
      const { data, error } = await supabase.functions.invoke('evolution-api', {
        body: {
          instanceName: connection.evolutionInstanceName,
          connectionName: connection.name,
          evolutionEndpoint: evolutionAPI.endpoint.startsWith('http') ? evolutionAPI.endpoint : `https://${evolutionAPI.endpoint}`,
          evolutionApiKey: evolutionAPI.apiKey
        }
      });

      if (error) {
        console.error('Erro na Edge Function:', error);
        throw new Error(`Erro na Edge Function: ${error.message}`);
      }

      if (!data.success) {
        console.error('Falha na criação da instância:', data.error);
        throw new Error(data.error || 'Falha na criação da instância');
      }

      // Atualizar conexão com dados da Evolution API apenas se foi bem-sucedida
      connection.qrCode = data.qrCode;
      connection.evolutionInstanceId = data.instanceName;

    } catch (error) {
      console.error('Erro ao criar instância Evolution:', error);
      throw error;
    }
  };

  const syncWithEvolutionAPI = async (connectionId: string): Promise<void> => {
    const connection = getConnection(connectionId);
    if (!connection) return;

    try {
      // Verificar se Evolution API está configurada
      const evolutionAPI = JSON.parse(localStorage.getItem('ox-evolution-api') || '{}');
      
      if (!evolutionAPI.endpoint || !evolutionAPI.apiKey) {
        throw new Error('Evolution API não configurada');
      }

      // Atualizar status para conectando
      await updateConnection(connectionId, {
        status: 'connecting'
      });

      // Buscar QR Code atualizado da instância
      const evolutionApiUrl = `https://rltkxwswlvuzwmmbqwkr.supabase.co/functions/v1/evolution-api?instanceName=${connection.evolutionInstanceName}&evolutionEndpoint=${encodeURIComponent(evolutionAPI.endpoint.startsWith('http') ? evolutionAPI.endpoint : `https://${evolutionAPI.endpoint}`)}&evolutionApiKey=${encodeURIComponent(evolutionAPI.apiKey)}`;

      const response = await fetch(evolutionApiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`,
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJsdGt4d3N3bHZ1endtbWJxd2tyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwMzg1MTUsImV4cCI6MjA3MjYxNDUxNX0.CFvBnfnzS7GD8ksbDprZ3sbFE1XHRhtrJJpBUaGCQlM'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`Erro na Edge Function: ${response.statusText}`);
      }

      if (!data.success) {
        throw new Error(data.error || 'Falha ao buscar QR Code');
      }

      // Atualizar conexão com QR Code atualizado
      await updateConnection(connectionId, {
        status: 'active',
        qrCode: data.qrCode,
        isActive: true
      });

    } catch (error) {
      await updateConnection(connectionId, {
        status: 'error'
      });
      throw error;
    }
  };

  const activeConnectionsCount = connections.filter(conn => conn.isActive && conn.status === 'active').length;

  return (
    <ConnectionsContext.Provider value={{
      connections,
      activeConnectionsCount,
      addConnection,
      updateConnection,
      deleteConnection,
      getConnection,
      syncWithEvolutionAPI
    }}>
      {children}
    </ConnectionsContext.Provider>
  );
};
import React, { createContext, useContext, useState, useEffect } from 'react';

export interface WhatsAppConnection {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'connecting' | 'error';
  qrCode?: string;
  lastActive: string;
  phone?: string;
  evolutionInstanceName?: string;
  isActive: boolean;
  conversationsCount: number;
  aiModel?: string;
}

interface ConnectionsContextType {
  connections: WhatsAppConnection[];
  activeConnectionsCount: number;
  addConnection: (connection: Omit<WhatsAppConnection, 'id' | 'lastActive'>) => WhatsAppConnection;
  updateConnection: (id: string, updates: Partial<WhatsAppConnection>) => void;
  deleteConnection: (id: string) => void;
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

  // Carregar conexões do localStorage
  useEffect(() => {
    const savedApiConnections = localStorage.getItem('ox-api-connections');
    const savedConnections = localStorage.getItem('ox-connections');
    
    let allConnections: WhatsAppConnection[] = [];

    // Migrar conexões da API antiga se existirem
    if (savedApiConnections) {
      const apiConnections = JSON.parse(savedApiConnections);
      allConnections = apiConnections.map((conn: any) => ({
        id: conn.id,
        name: conn.name,
        status: conn.status === 'active' ? 'active' : 'inactive',
        qrCode: conn.qrCode,
        lastActive: conn.lastActive,
        phone: conn.phone || `+5511${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
        evolutionInstanceName: conn.name.toLowerCase().replace(/\s+/g, '_'),
        isActive: conn.status === 'active',
        conversationsCount: Math.floor(Math.random() * 50),
        aiModel: 'ChatGPT'
      }));
    }

    // Carregar conexões do novo formato
    if (savedConnections) {
      const legacyConnections = JSON.parse(savedConnections);
      const convertedConnections = legacyConnections.map((conn: any) => ({
        id: conn.id,
        name: conn.name,
        status: conn.isActive ? 'active' : 'inactive',
        lastActive: conn.lastConnectionTime,
        phone: `+5511${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
        evolutionInstanceName: conn.name.toLowerCase().replace(/\s+/g, '_'),
        isActive: conn.isActive,
        conversationsCount: Math.floor(Math.random() * 30),
        aiModel: 'Claude'
      }));
      allConnections = [...allConnections, ...convertedConnections];
    }

    if (allConnections.length > 0) {
      setConnections(allConnections);
      saveConnections(allConnections);
    }
  }, []);

  const saveConnections = (newConnections: WhatsAppConnection[]) => {
    setConnections(newConnections);
    localStorage.setItem('ox-whatsapp-connections', JSON.stringify(newConnections));
    
    // Manter compatibilidade com sistemas antigos
    localStorage.setItem('ox-api-connections', JSON.stringify(newConnections));
  };

  const addConnection = (connectionData: Omit<WhatsAppConnection, 'id' | 'lastActive'>): WhatsAppConnection => {
    const newConnection: WhatsAppConnection = {
      ...connectionData,
      id: Date.now().toString(),
      lastActive: new Date().toISOString(),
      phone: connectionData.phone || `+5511${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      evolutionInstanceName: connectionData.name.toLowerCase().replace(/\s+/g, '_'),
      conversationsCount: 0,
      aiModel: connectionData.aiModel || 'ChatGPT'
    };

    const updatedConnections = [...connections, newConnection];
    saveConnections(updatedConnections);
    return newConnection;
  };

  const updateConnection = (id: string, updates: Partial<WhatsAppConnection>) => {
    const updatedConnections = connections.map(conn =>
      conn.id === id 
        ? { ...conn, ...updates, lastActive: new Date().toISOString() }
        : conn
    );
    saveConnections(updatedConnections);
  };

  const deleteConnection = (id: string) => {
    const updatedConnections = connections.filter(conn => conn.id !== id);
    saveConnections(updatedConnections);
  };

  const getConnection = (id: string) => {
    return connections.find(conn => conn.id === id);
  };

  const syncWithEvolutionAPI = async (connectionId: string): Promise<void> => {
    const connection = getConnection(connectionId);
    if (!connection) return;

    // Simular integração com Evolution API
    try {
      // Aqui seria a integração real com Evolution API
      const evolutionAPI = JSON.parse(localStorage.getItem('ox-evolution-api') || '{}');
      
      if (!evolutionAPI.endpoint || !evolutionAPI.apiKey) {
        throw new Error('Evolution API não configurada');
      }

      // Simular criação de instância
      updateConnection(connectionId, {
        status: 'connecting'
      });

      // Simular delay da API
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Simular geração de QR Code
      const qrCodeData = `evolution-${connection.evolutionInstanceName}-${Date.now()}`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCodeData)}`;

      updateConnection(connectionId, {
        status: 'active',
        qrCode: qrCodeUrl,
        isActive: true
      });

    } catch (error) {
      updateConnection(connectionId, {
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
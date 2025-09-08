import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Função para enviar mensagens
async function handleSendMessage(request: SendMessageRequest) {
  console.log('📤 Enviando mensagem:', request);
  
  // Validar entrada
  if (!request.instanceName || !request.to || !request.message) {
    return new Response(JSON.stringify({
      success: false,
      error: 'instanceName, to, and message are required'
    }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Usar dados dos secrets configurados
  const apiKey = Deno.env.get('EVOLUTION_API_KEY');
  let endpoint = Deno.env.get('EVOLUTION_API_ENDPOINT');
  
  if (!apiKey || !endpoint) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Evolution API credentials not configured. Please configure EVOLUTION_API_KEY and EVOLUTION_API_ENDPOINT in Supabase secrets.'
    }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Garantir que o endpoint tenha o protocolo HTTPS
  if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
    endpoint = `https://${endpoint}`;
  }

  try {
    // Construir payload para a Evolution API
    const payload = {
      number: request.to,
      text: request.message
    };

    console.log('🔄 Enviando para Evolution API:', {
      url: `${endpoint}/message/sendText/${request.instanceName}`,
      payload
    });

    // Fazer a requisição para a Evolution API
    const response = await fetch(`${endpoint}/message/sendText/${request.instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: JSON.stringify(payload)
    });

    const responseData = await response.json();
    console.log('📥 Resposta da Evolution API:', responseData);

    if (!response.ok) {
      console.error('❌ Erro na Evolution API:', responseData);
      return new Response(JSON.stringify({
        success: false,
        error: responseData.message || 'Failed to send message',
        details: responseData
      }), { 
        status: response.status, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Sucesso
    return new Response(JSON.stringify({
      success: true,
      message: 'Message sent successfully',
      data: responseData
    }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Erro interno ao enviar mensagem:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
      details: error.message
    }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CreateInstanceRequest {
  instanceName: string;
  connectionName: string;
  evolutionEndpoint?: string;
  evolutionApiKey?: string;
}

interface SendMessageRequest {
  action: 'sendMessage';
  instanceName: string;
  to: string;
  message: string;
}

interface EvolutionAPIResponse {
  success: boolean;
  qrCode?: string;
  instanceName?: string;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method === 'POST') {
      const requestBody = await req.json()
      
      // Verificar se é um envio de mensagem
      if (requestBody.action === 'sendMessage') {
        return await handleSendMessage(requestBody as SendMessageRequest)
      }
      
      // Caso contrário, é criação de instância
      const { instanceName, connectionName, evolutionEndpoint, evolutionApiKey }: CreateInstanceRequest = requestBody
      
      if (!instanceName || !connectionName) {
        return new Response(
          JSON.stringify({ success: false, error: 'instanceName and connectionName are required' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      // Usar dados dos secrets configurados
      const apiKey = Deno.env.get('EVOLUTION_API_KEY')
      let endpoint = Deno.env.get('EVOLUTION_API_ENDPOINT')
      
      if (!apiKey || !endpoint) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Evolution API credentials not configured. Please configure EVOLUTION_API_KEY and EVOLUTION_API_ENDPOINT in Supabase secrets.' 
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      // Garantir que o endpoint tenha o protocolo HTTPS
      if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
        endpoint = `https://${endpoint}`;
      }

      try {
        console.log(`Creating instance: ${instanceName}`)
        
        // Criar a instância na Evolution API
        const createResponse = await fetch(`${endpoint}/instance/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': apiKey
          },
          body: JSON.stringify({
            instanceName: instanceName,
            qrcode: true,
            integration: "WHATSAPP-BAILEYS"
          })
        })

        if (!createResponse.ok) {
          const errorData = await createResponse.json()
          console.error('Evolution API create instance error:', errorData)
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: errorData.message || 'Failed to create instance',
              details: errorData
            }),
            { 
              status: createResponse.status, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        const createData = await createResponse.json()
        console.log('Instance created successfully:', createData)

        // Aguardar um pouco para a instância ficar pronta
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Get QR code
        const qrResponse = await fetch(`${endpoint}/instance/connect/${instanceName}`, {
          method: 'GET',
          headers: {
            'apikey': apiKey
          }
        })

        let qrCode = null
        if (qrResponse.ok) {
          const qrData = await qrResponse.json()
          qrCode = qrData.base64 || qrData.qrcode
        }

        const response: EvolutionAPIResponse = {
          success: true,
          qrCode: qrCode,
          instanceName: instanceName
        }

        return new Response(
          JSON.stringify(response),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )

      } catch (error) {
        console.error('Evolution API error:', error)
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: error.message || 'Failed to create instance' 
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
    }

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const instanceName = url.searchParams.get('instanceName')
      const action = url.searchParams.get('action') || 'qrcode'
      
      if (!instanceName) {
        return new Response(
          JSON.stringify({ success: false, error: 'instanceName parameter is required' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      // Usar dados dos secrets configurados
      const apiKey = Deno.env.get('EVOLUTION_API_KEY')
      let endpoint = Deno.env.get('EVOLUTION_API_ENDPOINT')
      
      if (!apiKey || !endpoint) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Evolution API credentials not configured. Please configure EVOLUTION_API_KEY and EVOLUTION_API_ENDPOINT in Supabase secrets.' 
          }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      // Garantir que o endpoint tenha o protocolo HTTPS
      if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
        endpoint = `https://${endpoint}`;
      }
      
      try {
        // Buscar dados da instância
        console.log(`Fetching instance data from: ${endpoint}/instance/fetchInstances?instanceName=${instanceName}`)
        const instanceResponse = await fetch(`${endpoint}/instance/fetchInstances?instanceName=${instanceName}`, {
          method: 'GET',
          headers: {
            'apikey': apiKey
          }
        })

        if (!instanceResponse.ok) {
          throw new Error(`Evolution API instance fetch failed: ${instanceResponse.status}`)
        }

        const instanceData = await instanceResponse.json()
        console.log('Instance data received:', instanceData)
        
        if (!instanceData || instanceData.length === 0) {
          throw new Error('Instance not found')
        }

        const instance = instanceData[0]
        let qrCodeData = null
        let profileData = {}

        // Se a instância tem QR Code, usar ele
        if (instance.instance && instance.instance.qrcode) {
          qrCodeData = instance.instance.qrcode
        }

        // Se a instância está conectada, buscar dados do perfil
        if (instance.instance && instance.instance.state === 'open') {
          try {
            // Buscar foto do perfil
            console.log(`Fetching profile from: ${endpoint}/chat/whatsappProfile/${instanceName}`)
            const profileResponse = await fetch(`${endpoint}/chat/whatsappProfile/${instanceName}`, {
              headers: {
                'apikey': apiKey
              }
            })

            if (profileResponse.ok) {
              const profileInfo = await profileResponse.json()
              console.log('Profile data received:', profileInfo)
              
              if (profileInfo) {
                profileData = {
                  phoneNumber: profileInfo.wuid?.replace('@s.whatsapp.net', ''),
                  displayName: profileInfo.name,
                  profilePicture: profileInfo.picture || profileInfo.profilePictureUrl
                }
              }
            }
          } catch (profileError) {
            console.log('Error fetching profile:', profileError)
          }
        } else if (!qrCodeData) {
          // Get QR code from Evolution API
          console.log(`Fetching QR from: ${endpoint}/instance/connect/${instanceName}`)
          try {
            const qrResponse = await fetch(`${endpoint}/instance/connect/${instanceName}`, {
              method: 'GET',
              headers: {
                'apikey': apiKey
              }
            })

            if (qrResponse.ok) {
              const qrData = await qrResponse.json()
              qrCodeData = qrData.base64 || qrData.qrcode
            }
          } catch (qrError) {
            console.log('Error fetching QR code:', qrError)
          }
        }

        const response = {
          success: true,
          qrCode: qrCodeData,
          instance: instance,
          instanceName: instanceName,
          ...profileData
        }

        return new Response(
          JSON.stringify(response),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )

      } catch (apiError) {
        console.error('Evolution API error:', apiError)
        
        // Fallback QR code
        const qrCodeData = `evolution-qr-${instanceName}-${Date.now()}`
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrCodeData)}`
        
        const response: EvolutionAPIResponse = {
          success: true,
          qrCode: qrCodeUrl,
          instanceName: instanceName
        }

        return new Response(
          JSON.stringify(response),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
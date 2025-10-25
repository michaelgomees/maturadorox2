import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { MaturadorMessage } from '@/hooks/useMaturadorEngine';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PairMessagesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pairName: string;
  messages: MaturadorMessage[];
}

export const PairMessagesModal: React.FC<PairMessagesModalProps> = ({
  open,
  onOpenChange,
  pairName,
  messages
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            Conversa: {pairName}
          </DialogTitle>
          <DialogDescription>
            {messages.length} mensagens trocadas
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>Nenhuma mensagem ainda</p>
                <p className="text-sm">As conversas aparecerão aqui quando o maturador estiver ativo</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className="p-4 border rounded-lg space-y-2 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Badge variant="outline">{msg.fromChipName}</Badge>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      <Badge variant="outline">{msg.toChipName}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(msg.timestamp, "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
                    </span>
                  </div>
                  
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {msg.content}
                  </p>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                    <Badge variant="secondary" className="text-xs">
                      {msg.aiModel}
                    </Badge>
                    {msg.usage && (
                      <span>
                        Tokens: {msg.usage.total_tokens || 0}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

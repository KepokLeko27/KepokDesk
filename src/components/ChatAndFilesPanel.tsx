import React, { useEffect, useRef, useState } from 'react';
import { Download, FileCheck2, FileText, Paperclip, Send } from 'lucide-react';
import type { ChatMessage, PeerRole } from '../types/session';
import { formatBytes } from '../utils/fileChunker';

interface ChatAndFilesPanelProps {
  messages: ChatMessage[];
  localRole: PeerRole;
  peerName: string;
  onSendText: (text: string) => Promise<void>;
  onSendFile: (file: File, viaChat: boolean, caption?: string) => Promise<void>;
}

export const ChatAndFilesPanel: React.FC<ChatAndFilesPanelProps> = ({
  messages,
  localRole,
  peerName,
  onSendText,
  onSendFile,
}) => {
  const [draft, setDraft] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || sending) return;
    const text = draft;
    setDraft('');
    setSending(true);
    try {
      await onSendText(text);
    } finally {
      setSending(false);
    }
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const caption = draft.trim() || undefined;
    if (caption) setDraft('');
    for (let i = 0; i < files.length; i++) {
      await onSendFile(files[i], true, i === 0 ? caption : undefined);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    await handleFilesSelected(e.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className="relative flex h-full flex-col bg-white"
    >
      {isDragging && (
        <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-[2px] border-2 border-dashed border-[#D9381E] bg-[#F7F7F4]/95">
          <p className="text-sm font-medium text-[#111214]">
            Drop files here to send encrypted over chat
          </p>
        </div>
      )}

      {/* Message Thread */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="rounded-[2px] border border-[#D6D6CE] bg-[#F7F7F4] p-5 text-center">
            <p className="text-sm font-medium text-[#111214]">
              End-to-end encrypted chat ready
            </p>
            <p className="mt-1.5 text-xs text-[#4B5058] leading-relaxed">
              Messages and attached files are encrypted with AES-256-GCM before leaving your device.
              Drop a file here or click the paperclip to share with {peerName || 'your peer'}.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isLocal = msg.sender === localRole;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isLocal ? 'items-end' : 'items-start'}`}
              >
                <div className="mb-1 flex items-center gap-1.5 text-[11px] text-[#6E747E]">
                  <span>{isLocal ? 'You' : msg.senderName}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div
                  className={`max-w-[90%] rounded-[2px] border px-3.5 py-2.5 text-sm ${
                    isLocal
                      ? 'border-[#111214] bg-[#111214] text-white'
                      : 'border-[#D6D6CE] bg-[#F7F7F4] text-[#111214]'
                  }`}
                >
                  {msg.text && <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.text}</p>}

                  {msg.attachment && (
                    <div
                      className={`${
                        msg.text
                          ? `mt-2.5 pt-2.5 border-t ${
                              isLocal ? 'border-[#32363E]' : 'border-[#D6D6CE]'
                            }`
                          : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          {msg.attachment.verifiedSha256 ? (
                            <FileCheck2
                              className={`mt-0.5 h-4 w-4 shrink-0 ${
                                isLocal ? 'text-[#86EFAC]' : 'text-[#15803D]'
                              }`}
                              aria-hidden="true"
                            />
                          ) : (
                            <FileText
                              className={`mt-0.5 h-4 w-4 shrink-0 ${
                                isLocal ? 'text-white' : 'text-[#D9381E]'
                              }`}
                              aria-hidden="true"
                            />
                          )}
                          <div className="min-w-0">
                            <p
                              className={`truncate font-medium text-xs ${
                                isLocal ? 'text-white' : 'text-[#111214]'
                              }`}
                            >
                              {msg.attachment.name}
                            </p>
                            <div
                              className={`mt-0.5 flex items-center gap-1.5 text-[11px] font-mono tabular-nums ${
                                isLocal ? 'text-[#D1D5DB]' : 'text-[#4B5058]'
                              }`}
                            >
                              <span>{formatBytes(msg.attachment.size)}</span>
                              <span aria-hidden="true">·</span>
                              <span>
                                {msg.attachment.status === 'verified'
                                  ? 'SHA-256 Verified'
                                  : msg.attachment.status === 'completed'
                                    ? 'Sent'
                                    : msg.attachment.status === 'error'
                                      ? 'Checksum mismatch'
                                      : `${msg.attachment.progress}%`}
                              </span>
                            </div>
                          </div>
                        </div>

                        {msg.attachment.downloadUrl && (
                          <a
                            href={msg.attachment.downloadUrl}
                            download={msg.attachment.name}
                            aria-label={`Download ${msg.attachment.name}`}
                            className="flex items-center gap-1 rounded-[2px] bg-[#D9381E] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#B82D16] transition-colors whitespace-nowrap shrink-0"
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden="true" />
                            Save
                          </a>
                        )}
                      </div>

                      {msg.attachment.progress < 100 && (
                        <div className="mt-2 h-1.5 w-full overflow-hidden bg-[#D6D6CE]">
                          <div
                            className="h-full bg-[#D9381E] transition-all"
                            style={{ width: `${msg.attachment.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={listEndRef} />
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-[#D6D6CE] bg-[#F7F7F4] p-3"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={(e) => {
            handleFilesSelected(e.target.files);
            e.target.value = '';
          }}
          className="hidden"
          aria-label="Attach files to encrypted chat"
        />

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach file to send"
            title="Send encrypted file"
            className="rounded-[2px] border border-[#D6D6CE] bg-white p-2.5 text-[#111214] hover:border-[#111214] transition-colors shrink-0"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Send encrypted message or attach file..."
            aria-label="Encrypted message input"
            className="flex-1 rounded-[2px] border border-[#D6D6CE] bg-white px-3 py-2 text-sm text-[#111214] placeholder:text-[#6E747E] focus:border-[#111214] focus:outline-none"
          />

          <button
            type="submit"
            disabled={!draft.trim() || sending}
            aria-label="Send message"
            className="rounded-[2px] bg-[#D9381E] p-2.5 text-white hover:bg-[#B82D16] transition-colors disabled:opacity-40 shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </form>
    </div>
  );
};

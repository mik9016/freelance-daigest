import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { generateProposal, listMessages, sendMessage, type ChatMessage } from "../api/offers";

interface Props {
  offerId: number;
  hasExistingThread: boolean;
}

export default function ChatWindow({ offerId, hasExistingThread }: Props) {
  const qc = useQueryClient();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], refetch } = useQuery({
    queryKey: ["messages", offerId],
    queryFn: () => listMessages(offerId),
    enabled: hasExistingThread
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const generate = useMutation({
    mutationFn: () => generateProposal(offerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", offerId] });
      qc.invalidateQueries({ queryKey: ["offer", offerId] });
      refetch();
    }
  });

  const send = useMutation({
    mutationFn: (content: string) => sendMessage(offerId, content),
    onSuccess: () => {
      setInput("");
      qc.invalidateQueries({ queryKey: ["messages", offerId] });
      refetch();
    }
  });

  const submit = () => {
    const content = input.trim();
    if (!content || send.isPending) return;
    send.mutate(content);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="card flex h-[420px] flex-col">
      <div className="border-b border-[var(--color-line)] px-4 py-3 text-xs font-medium uppercase tracking-wide text-[var(--color-quiet)]">
        Chat with OpenWebUI
      </div>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
        {messages.length === 0 && !generate.isPending && (
          <div className="flex h-full flex-col items-center justify-center text-center text-sm text-[var(--color-quiet)]">
            <p>No message yet.</p>
            <button
              type="button"
              onClick={() => generate.mutate()}
              className="btn-primary mt-3"
              disabled={generate.isPending}
            >
              {generate.isPending ? "Generating…" : "Generate initial proposal"}
            </button>
            {generate.isError && (
              <p className="mt-2 text-xs text-red-600">Generation failed. Try again.</p>
            )}
          </div>
        )}
        {generate.isPending && messages.length === 0 && (
          <p className="text-sm text-[var(--color-quiet)]">Generating proposal…</p>
        )}
      </div>
      <div className="border-t border-[var(--color-line)] px-4 py-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={messages.length === 0 || send.isPending}
          rows={2}
          placeholder={messages.length === 0 ? "Generate a proposal first…" : "Ask for changes… (Enter to send, Shift+Enter for newline)"}
          className="input w-full resize-none text-sm disabled:bg-neutral-50"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={!input.trim() || send.isPending || messages.length === 0}
            className="btn-primary disabled:opacity-50"
          >
            {send.isPending ? "Sending…" : "Send"}
          </button>
        </div>
        {send.isError && (
          <p className="mt-2 text-right text-xs text-red-600">
            Failed to send. Your message was saved; retry to add an assistant reply.
          </p>
        )}
      </div>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
            isUser ? "bg-black text-white" : "bg-[var(--color-mute)] text-black"
          }`}
        >
          {message.content}
        </div>
        {!isUser && (
          <button
            type="button"
            onClick={onCopy}
            className="mt-1 flex items-center gap-1 text-xs text-[var(--color-quiet)] hover:text-black"
            aria-label="Copy message"
          >
            {copied ? (
              <>
                <CheckIcon /> Copied
              </>
            ) : (
              <>
                <CopyIcon /> Copy
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  SparklesIcon,
  Loader2Icon,
  WandIcon,
  CheckCircleIcon,
  BookOpenIcon,
  MinimizeIcon,
  LanguagesIcon,
  PenLineIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useEditorStore } from "@/store/use-editor-store";

type AIAction =
  | "improve"
  | "fix-grammar"
  | "summarize"
  | "expand"
  | "simplify"
  | "translate"
  | "custom";

const actions: {
  action: AIAction;
  label: string;
  icon: typeof SparklesIcon;
  description: string;
}[] = [
  {
    action: "improve",
    label: "Improve Writing",
    icon: WandIcon,
    description: "Make text clearer and more professional",
  },
  {
    action: "fix-grammar",
    label: "Fix Grammar",
    icon: CheckCircleIcon,
    description: "Correct grammar and spelling",
  },
  {
    action: "summarize",
    label: "Summarize",
    icon: MinimizeIcon,
    description: "Create a concise summary",
  },
  {
    action: "expand",
    label: "Expand",
    icon: BookOpenIcon,
    description: "Add more detail and examples",
  },
  {
    action: "simplify",
    label: "Simplify",
    icon: PenLineIcon,
    description: "Use simpler language",
  },
  {
    action: "translate",
    label: "Translate",
    icon: LanguagesIcon,
    description: "Translate to another language",
  },
];

export function AIAssistant() {
  const { editor } = useEditorStore();
  const [isLoading, setIsLoading] = useState(false);
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [showTranslate, setShowTranslate] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState("Spanish");

  const getSelectedText = (): string => {
    if (!editor) return "";
    const { from, to } = editor.state.selection;
    if (from === to) {
      // No selection — use full document text
      return editor.getText();
    }
    return editor.state.doc.textBetween(from, to, " ");
  };

  const handleAIAction = async (action: AIAction, extraParams?: Record<string, string>) => {
    const selectedText = getSelectedText();
    if (!selectedText.trim()) {
      toast.error("Select some text or ensure the document has content");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          prompt: action === "custom" ? customPrompt : selectedText,
          context: selectedText,
          ...extraParams,
        }),
      });

      if (!response.ok) {
        throw new Error("AI request failed");
      }

      // Read streamed response
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        // Parse SSE data chunks
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("0:")) {
            // Text chunk from Vercel AI SDK
            try {
              const text = JSON.parse(line.slice(2));
              fullText += text;
            } catch {
              // Ignore parse errors for non-text chunks
            }
          } else if (line.startsWith("3:")) {
            try {
              const errorMessage = JSON.parse(line.slice(2));
              throw new Error(typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage));
            } catch (e: any) {
              throw new Error(e.message || "AI Error");
            }
          }
        }
      }

      if (fullText && editor) {
        const { from, to } = editor.state.selection;
        if (from !== to) {
          // Replace selected text
          editor.chain().focus().deleteSelection().insertContent(fullText).run();
        } else {
          // Replace the entire document
          editor.chain().focus().clearContent().insertContent(fullText).run();
        }
        toast.success("AI suggestion applied");
      }
    } catch (err) {
      toast.error("AI request failed. Check your API key.");
      console.error(err);
    } finally {
      setIsLoading(false);
      setShowCustomPrompt(false);
      setShowTranslate(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="h-7 min-w-7 shrink-0 flex items-center justify-center gap-1 rounded-sm hover:bg-neutral-200/80 px-2 overflow-hidden text-sm font-medium text-violet-600"
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <SparklesIcon className="size-4" />
            )}
            <span className="hidden sm:inline">AI</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[220px]">
          {actions.map(({ action, label, icon: Icon, description }) => (
            <DropdownMenuItem
              key={action}
              onClick={() => {
                if (action === "translate") {
                  setShowTranslate(true);
                } else {
                  handleAIAction(action);
                }
              }}
              disabled={isLoading}
            >
              <Icon className="size-4 mr-2 text-violet-600" />
              <div>
                <div className="text-sm">{label}</div>
                <div className="text-xs text-muted-foreground">
                  {description}
                </div>
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowCustomPrompt(true)}
            disabled={isLoading}
          >
            <SparklesIcon className="size-4 mr-2 text-violet-600" />
            <div>
              <div className="text-sm">Custom Prompt</div>
              <div className="text-xs text-muted-foreground">
                Write your own AI instruction
              </div>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Custom Prompt Dialog */}
      <Dialog open={showCustomPrompt} onOpenChange={setShowCustomPrompt}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SparklesIcon className="size-5 text-violet-600" />
              Custom AI Prompt
            </DialogTitle>
          </DialogHeader>
          <Input
            placeholder="e.g., Rewrite this as a formal business email..."
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customPrompt.trim()) {
                handleAIAction("custom");
              }
            }}
          />
          <DialogFooter>
            <Button
              onClick={() => handleAIAction("custom")}
              disabled={!customPrompt.trim() || isLoading}
            >
              {isLoading ? (
                <Loader2Icon className="size-4 animate-spin mr-2" />
              ) : (
                <SparklesIcon className="size-4 mr-2" />
              )}
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Translate Dialog */}
      <Dialog open={showTranslate} onOpenChange={setShowTranslate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LanguagesIcon className="size-5 text-violet-600" />
              Translate
            </DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Target language (e.g., Spanish, French, Hindi)"
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && targetLanguage.trim()) {
                handleAIAction("translate", { language: targetLanguage });
              }
            }}
          />
          <DialogFooter>
            <Button
              onClick={() =>
                handleAIAction("translate", { language: targetLanguage })
              }
              disabled={!targetLanguage.trim() || isLoading}
            >
              {isLoading ? (
                <Loader2Icon className="size-4 animate-spin mr-2" />
              ) : (
                <LanguagesIcon className="size-4 mr-2" />
              )}
              Translate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

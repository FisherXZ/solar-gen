"use client";

const PROMPTS = [
  "Show me the biggest Texas solar projects",
  "Find ERCOT projects over 200 MW",
  "Research projects needing EPC discovery",
  "Show confirmed EPCs",
];

interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void;
}

export default function SuggestedPrompts({ onSelect }: SuggestedPromptsProps) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {PROMPTS.map((prompt) => (
        <button
          key={prompt}
          onClick={() => onSelect(prompt)}
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}

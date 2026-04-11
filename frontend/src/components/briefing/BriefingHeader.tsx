// frontend/src/components/briefing/BriefingHeader.tsx
"use client";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning.";
  if (hour < 17) return "Good afternoon.";
  return "Good evening.";
}

export default function BriefingHeader() {
  return (
    <div className="mb-8">
      <h1 className="font-serif text-3xl tracking-tight text-text-primary">
        Briefing
      </h1>
      <p className="mt-1 text-sm text-text-tertiary">{getGreeting()}</p>
    </div>
  );
}

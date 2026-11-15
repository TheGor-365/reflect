import React from 'react';
import {
  BrainCircuit, SlidersHorizontal, HeartHandshake, Compass,
  MessagesSquare, BarChart3, Lightbulb, Target, MessageSquareText,
  ShieldCheck, Network, BookOpen, Sparkles, RotateCcw, History,
  Info, Layers3, UserRoundCheck
} from 'lucide-react';

/** Reflect-wide semantic icon contract — stable across every surface. */
const ICONS = Object.freeze({
  account: SlidersHorizontal, reflection: BrainCircuit,
  support: HeartHandshake, coach: Compass,
  companion: MessagesSquare, analytic: BarChart3,
  recommendation: Lightbulb, goal: Target, session: MessageSquareText,
  privacy: ShieldCheck, journey: Network, diary: BookOpen,
  insight: Sparkles, return: RotateCcw, history: History,
  information: Info, context: Layers3, evidence: UserRoundCheck
});

export const MODE_CAPTIONS = Object.freeze({
  account: 'Как в настройках AI', reflection: 'Рефлексия',
  support: 'Поддержка', coach: 'Коучинг',
  companion: 'Собеседник', analytic: 'Аналитика'
});

export default function ReflectContentIcon({ kind, size = 18, ...props }) {
  const Icon = ICONS[kind] || Info;
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" {...props}/>;
}

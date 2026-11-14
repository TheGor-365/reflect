import React from 'react';
import { Compass } from 'lucide-react';

/**
 * RC05.3 — permanent visible type marker, independent of content location.
 * A recommendation is a proposed direction, never a fact, diagnosis or goal.
 * Keep exactly this icon and name across Diary, Sessions, Journey, Mindspace,
 * Dashboard and Recommendations.
 */
export default function RecommendationMark({ className = '', qualifier = '' }) {
  return <span className={['reflect-recommendation-mark',className].filter(Boolean).join(' ')}>
    <Compass size={16} strokeWidth={2} aria-hidden="true"/>
    <span>Рекомендация AI{qualifier ? ` · ${qualifier}` : ''}</span>
  </span>;
}

/**
 * Legacy Firestore data model: additive, not a migration.
 *
 * Only fields read by existing Journal/Mood screens are modeled here.
 * Older documents can have other fields and sometimes no createdAt;
 * never interpret these types as a reason to rewrite live records.
 */
export interface DateConvertible {
  toDate(): Date;
}

export interface FirestoreTimestampLike extends DateConvertible {
  toMillis(): number;
}

export type MoodCode = 'happy' | 'content' | 'neutral' | 'sad' | 'anxious';

export interface JournalEntry {
  text: string;
  createdAt?: DateConvertible | null;
}

export interface JournalNote {
  title?: string;
  entries?: JournalEntry[];
  createdAt?: FirestoreTimestampLike | null;
}

export interface MoodEntry {
  mood: MoodCode;
  intensity?: number;
  comment?: string;
  createdAt?: FirestoreTimestampLike | null;
}

export type DocumentWithId<T extends object> = T & { id: string };

import { LIMITS } from '../config/limits';
import { Material, QuizAttempt } from '@fast-learning/shared';

const GUEST_USAGE_KEY = 'fl_guest_usage';
const GUEST_MATERIALS_KEY = 'fl_guest_materials';
const GUEST_LATEST_ATTEMPT_KEY = 'fl_guest_attempt';

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

interface GuestUsageRecord {
  date: string;
  count: number;
}

export function getGuestQuizzesUsedToday(): number {
  try {
    const raw = localStorage.getItem(GUEST_USAGE_KEY);
    if (!raw) return 0;
    const data: GuestUsageRecord = JSON.parse(raw);
    if (data.date !== getTodayString()) {
      return 0;
    }
    return data.count || 0;
  } catch {
    return 0;
  }
}

export function getGuestUsageToday(): { quizzesGenerated: number } {
  return {
    quizzesGenerated: getGuestQuizzesUsedToday()
  };
}

export function getGuestQuizzesRemainingToday(): number {
  const used = getGuestQuizzesUsedToday();
  return Math.max(0, LIMITS.guest.maxQuizzesPerDay - used);
}

export function incrementGuestQuizCount(): void {
  try {
    const today = getTodayString();
    const current = getGuestQuizzesUsedToday();
    const next: GuestUsageRecord = {
      date: today,
      count: current + 1
    };
    localStorage.setItem(GUEST_USAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('Failed to save guest quiz usage:', err);
  }
}

export function getGuestSavedMaterials(): Material[] {
  try {
    const raw = localStorage.getItem(GUEST_MATERIALS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Material[];
  } catch {
    return [];
  }
}

export function saveGuestMaterial(material: Material): void {
  try {
    const existing = getGuestSavedMaterials();
    // Keep max 5 for guest
    const updated = [material, ...existing.filter(m => m.id !== material.id)].slice(
      0,
      LIMITS.guest.maxSavedMaterials
    );
    localStorage.setItem(GUEST_MATERIALS_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save guest material:', err);
  }
}

export function getGuestLatestAttempt(materialId: number): QuizAttempt | null {
  try {
    const raw = localStorage.getItem(`${GUEST_LATEST_ATTEMPT_KEY}_${materialId}`);
    if (!raw) return null;
    return JSON.parse(raw) as QuizAttempt;
  } catch {
    return null;
  }
}

export function saveGuestAttempt(attempt: QuizAttempt): void {
  try {
    localStorage.setItem(
      `${GUEST_LATEST_ATTEMPT_KEY}_${attempt.material_id}`,
      JSON.stringify(attempt)
    );
  } catch (err) {
    console.warn('Failed to save guest attempt:', err);
  }
}

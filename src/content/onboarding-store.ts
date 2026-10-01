import {
  STRICTNESS,
  buildPrompt,
  onboardingRecordSchema,
  type OnboardingAnswers,
  type OnboardingRecord
} from "../shared/onboarding";

const STORAGE_KEY = "talos.onboarding";

export async function loadOnboarding(): Promise<OnboardingRecord | null> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const parsed = onboardingRecordSchema.safeParse(stored[STORAGE_KEY]);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function saveOnboarding(answers: OnboardingAnswers): Promise<OnboardingRecord> {
  const record: OnboardingRecord = {
    version: 1,
    answers,
    prompt: buildPrompt(answers),
    unsubscribeAt: STRICTNESS[answers.strictness].unsubscribeAt,
    savedAt: new Date().toISOString()
  };
  await chrome.storage.local.set({ [STORAGE_KEY]: record });
  return record;
}

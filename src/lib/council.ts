import { type Answer, type ProviderId, type Turn } from "./contracts";

export const councilActive = (turn: Turn) => !!turn.council && ["researching", "routing", "answering", "reviewing", "voting", "planning", "arbitrating", "auditing"].includes(turn.council.status);
export function completedAnswers(answers: Partial<Record<ProviderId, Answer>> = {}) {
  return Object.values(answers).filter((a): a is Answer => !!a && a.status === "complete" && !!a.text.trim());
}
export async function reviewCouncil(options: {
  participants: ProviderId[]; lead: ProviderId; signal: AbortSignal;
  read: () => Turn | undefined;
  run: (provider: ProviderId, phase: "critique" | "master") => Promise<void>;
  update: (status: NonNullable<Turn["council"]>["status"], message?: string) => void;
}) {
  const { participants, lead, signal, read, run, update } = options;
  if (signal.aborted) return;
  const answers = completedAnswers(read()?.answers);
  if (answers.length < 2) { update("error", "At least two completed answers are needed. Retry failed answers, then run the review again."); return; }
  update("reviewing", "Each model is reviewing the other models’ completed answers.");
  await Promise.all(participants.map(id => run(id, "critique")));
  if (signal.aborted) return;
  const reviews = completedAnswers(read()?.reviews);
  if (!reviews.length) { update("error", "No critiques completed. Check provider errors and run the review again."); return; }
  const missing = participants.length - answers.length + participants.length - reviews.length;
  const message = missing ? `${missing} answer or critique requests did not complete. The master plan uses only completed results; review the missing perspectives.` : "All selected models completed their answers and critiques.";
  update("planning", message);
  await run(lead, "master");
  if (signal.aborted) return;
  if (read()?.synthesis?.status === "complete") update("complete", message);
  else update("error", "The master plan did not complete. Earlier answers and critiques are preserved. Check the lead model’s error.");
}

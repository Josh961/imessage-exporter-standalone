import type { Contact } from "../types";

export type FallbackCandidate = Contact & { matchScore: number; matchReasons: string[] };

const DEFAULT_MIN_SCORE = 35;
const DEFAULT_MAX_CANDIDATES = 5;

function normalizeName(value?: string): string {
  return (value || "").toLowerCase().replace(/[^a-z0-9@]+/g, "");
}

function normalizeParticipant(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 7) {
    return digits.length > 10 ? digits.slice(-10) : digits;
  }
  return trimmed.replace(/\s+/g, "");
}

function getParticipantSet(contact: Contact): Set<string> {
  if (contact.type === "GROUP") {
    const rawParticipants: string[] = [];
    if (contact.participants) {
      rawParticipants.push(...contact.participants.split(","));
    }
    if (contact.participantHandles) {
      rawParticipants.push(...contact.participantHandles.split(","));
    }
    return new Set(rawParticipants.map(normalizeParticipant).filter(Boolean));
  }

  return new Set([contact.contact].map(normalizeParticipant).filter(Boolean));
}

export function scoreFallbackCandidate(
  selected: Contact,
  candidate: Contact,
): FallbackCandidate | null {
  if (!candidate.chatIds) return null;

  const reasons: string[] = [];
  let score = 0;

  if (selected.chatIds && selected.chatIds === candidate.chatIds) {
    score += 120;
    reasons.push("same chat IDs");
  }

  if (selected.type === candidate.type) {
    score += 15;
  }

  const selectedName = normalizeName(selected.displayName || selected.contact);
  const candidateName = normalizeName(candidate.displayName || candidate.contact);
  if (selectedName && candidateName) {
    if (selectedName === candidateName) {
      score += 45;
      reasons.push("same chat name");
    } else if (selectedName.includes(candidateName) || candidateName.includes(selectedName)) {
      score += 20;
      reasons.push("similar chat name");
    }
  }

  const selectedParticipants = getParticipantSet(selected);
  const candidateParticipants = getParticipantSet(candidate);
  const sharedParticipants = [...selectedParticipants].filter((participant) =>
    candidateParticipants.has(participant),
  );
  if (sharedParticipants.length > 0) {
    score += sharedParticipants.length * 25;
    reasons.push(
      `${sharedParticipants.length} matching participant${sharedParticipants.length === 1 ? "" : "s"}`,
    );
    if (
      sharedParticipants.length === selectedParticipants.size &&
      selectedParticipants.size === candidateParticipants.size
    ) {
      score += 35;
      reasons.push("same participant list");
    }
  }

  const countDelta = Math.abs(selected.messageCount - candidate.messageCount);
  const countRatio = selected.messageCount > 0 ? countDelta / selected.messageCount : 1;
  if (countRatio <= 0.01) {
    score += 25;
    reasons.push("same message count");
  } else if (countRatio <= 0.05) {
    score += 15;
    reasons.push("similar message count");
  } else if (countRatio <= 0.15) {
    score += 8;
  }

  if (selected.lastMessageDate && selected.lastMessageDate === candidate.lastMessageDate) {
    score += 15;
    reasons.push("same latest message date");
  }
  if (selected.firstMessageDate && selected.firstMessageDate === candidate.firstMessageDate) {
    score += 10;
  }

  if (score < DEFAULT_MIN_SCORE) return null;
  return { ...candidate, matchScore: score, matchReasons: reasons.slice(0, 3) };
}

export function rankFallbackCandidates(
  selected: Contact,
  contacts: Contact[],
  maxCandidates = DEFAULT_MAX_CANDIDATES,
): FallbackCandidate[] {
  return contacts
    .filter((contact) => contact.chatIds)
    .map((contact) => scoreFallbackCandidate(selected, contact))
    .filter((contact): contact is FallbackCandidate => contact !== null)
    .toSorted((a, b) => b.matchScore - a.matchScore)
    .slice(0, maxCandidates);
}

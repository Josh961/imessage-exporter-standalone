import { describe, expect, it } from "vitest";
import { rankFallbackCandidates, scoreFallbackCandidate } from "./fallback-matches";
import type { Contact } from "../types";

const selectedFamilyChat: Contact = {
  type: "GROUP",
  contact: "Family Chat",
  messageCount: 1250,
  firstMessageDate: "2024-01-01T00:00:00Z",
  lastMessageDate: "2024-12-31T00:00:00Z",
  participants: "+1 (555) 111-2222,+1 (555) 333-4444,mom@example.com",
  chatIds: "12",
};

function contact(overrides: Partial<Contact>): Contact {
  return {
    type: "CONTACT",
    contact: "+15550000000",
    messageCount: 100,
    firstMessageDate: "2024-01-01T00:00:00Z",
    lastMessageDate: "2024-01-02T00:00:00Z",
    ...overrides,
  };
}

describe("fallback chat matching", () => {
  it("ranks exact chat-id and participant matches above weaker candidates", () => {
    const exact = contact({
      type: "GROUP",
      contact: "Family Chat",
      messageCount: 1250,
      firstMessageDate: "2024-01-01T00:00:00Z",
      lastMessageDate: "2024-12-31T00:00:00Z",
      participants: "5551112222,5553334444,mom@example.com",
      chatIds: "12",
    });
    const weak = contact({
      type: "GROUP",
      contact: "Family",
      messageCount: 1180,
      participants: "5551112222,5559998888",
      chatIds: "99",
    });

    const candidates = rankFallbackCandidates(selectedFamilyChat, [weak, exact]);

    expect(candidates).toHaveLength(2);
    expect(candidates[0].chatIds).toBe("12");
    expect(candidates[0].matchReasons).toContain("same chat IDs");
    expect(candidates[0].matchReasons).toContain("same chat name");
  });

  it("matches phone participants despite punctuation and country code differences", () => {
    const candidate = contact({
      type: "GROUP",
      contact: "Family Chat",
      messageCount: 1255,
      participants: "5551112222,+15553334444,mom@example.com",
      chatIds: "44",
    });

    const scored = scoreFallbackCandidate(selectedFamilyChat, candidate);

    expect(scored).not.toBeNull();
    expect(scored?.matchReasons).toContain("3 matching participants");
  });

  it("excludes candidates without chat IDs because they cannot be retried safely", () => {
    const candidate = contact({
      type: "GROUP",
      contact: "Family Chat",
      messageCount: 1250,
      participants: selectedFamilyChat.participants,
      chatIds: undefined,
    });

    expect(scoreFallbackCandidate(selectedFamilyChat, candidate)).toBeNull();
    expect(rankFallbackCandidates(selectedFamilyChat, [candidate])).toEqual([]);
  });

  it("excludes unrelated low-confidence chats", () => {
    const unrelated = contact({
      type: "GROUP",
      contact: "Work Chat",
      messageCount: 300,
      participants: "+15559990000,+15558887777",
      chatIds: "77",
    });

    expect(rankFallbackCandidates(selectedFamilyChat, [unrelated])).toEqual([]);
  });
});

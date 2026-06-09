import { useCallback, useState } from "react";
import { useWizard } from "../../context/wizard-context";
import { useLocalStorage } from "../../hooks/use-local-storage";
import { rankFallbackCandidates, type FallbackCandidate } from "../../lib/fallback-matches";
import type { Contact } from "../../types";
import { ProgressBar } from "../progress-bar";

type FallbackStatus = "idle" | "loading" | "ready" | "none" | "error";

export function Step4Export() {
  const {
    state,
    setContacts,
    setSelectedContact,
    setExportStatus,
    setExportProgress,
    setExportError,
    setExportZipPath,
    prevStep,
    resetToContactSelect,
  } = useWizard();
  const [fallbackStatus, setFallbackStatus] = useState<FallbackStatus>("idle");
  const [fallbackCandidates, setFallbackCandidates] = useState<FallbackCandidate[]>([]);

  const [debugMode] = useLocalStorage("debugMode", false);
  const [simulateNoChatMatch] = useLocalStorage("simulateNoChatMatch", false);
  const isDevelopment = import.meta.env.DEV;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getContactName = (): string => {
    if (!state.selectedContact) return "";
    return state.selectedContact.displayName || state.selectedContact.contact;
  };

  const getContactDisplay = (contact: Contact): string => {
    return contact.displayName || contact.contact;
  };

  const callListContacts = useCallback(
    (folder: string) => {
      return state.backupPassword
        ? window.electronAPI.listContacts(folder, { backupPassword: state.backupPassword })
        : window.electronAPI.listContacts(folder);
    },
    [state.backupPassword],
  );

  const findFallbackCandidates = useCallback(
    async (selected: Contact) => {
      setFallbackStatus("loading");
      setFallbackCandidates([]);

      try {
        const result = await callListContacts(state.inputFolder);
        if (!result.success) {
          setFallbackStatus("error");
          return;
        }

        const refreshedContacts = result.contacts.filter(
          (contact) => contact.contact && contact.messageCount >= 20,
        );
        setContacts(refreshedContacts);

        const candidates = rankFallbackCandidates(selected, refreshedContacts);

        setFallbackCandidates(candidates);
        setFallbackStatus(candidates.length > 0 ? "ready" : "none");
      } catch {
        setFallbackStatus("error");
      }
    },
    [callListContacts, setContacts, state.inputFolder],
  );

  const getDateRangeText = (): string => {
    const start = formatDate(state.startDate);
    if (state.endDate) {
      return `${start} to ${formatDate(state.endDate)}`;
    }
    return `${start} onwards`;
  };

  const getCandidateMeta = (candidate: Contact): string => {
    const pieces = [`${candidate.messageCount.toLocaleString()} messages`];
    if (candidate.firstMessageDate && candidate.lastMessageDate) {
      pieces.push(
        `${formatDate(candidate.firstMessageDate)} to ${formatDate(candidate.lastMessageDate)}`,
      );
    }
    if (candidate.type === "GROUP" && candidate.participants) {
      pieces.push(`${candidate.participants.split(",").length} people`);
    }
    return pieces.join(" • ");
  };

  const getParticipantPreview = (candidate: Contact): string | null => {
    if (!candidate.participants) return null;
    const participants = candidate.participants
      .split(",")
      .map((participant) => participant.trim())
      .filter(Boolean);
    if (participants.length === 0) return null;
    const preview = participants.slice(0, 4).join(", ");
    return participants.length > 4 ? `${preview}, and ${participants.length - 4} more` : preview;
  };

  const runExport = useCallback(
    async (contactOverride?: Contact, options: { simulateFailure?: boolean } = {}) => {
      const contact = contactOverride || state.selectedContact;
      if (!contact) return;
      const shouldSimulateFailure = options.simulateFailure ?? true;

      setExportStatus("exporting");
      setExportError(null);
      setExportProgress(null);
      setFallbackStatus("idle");
      setFallbackCandidates([]);

      // Prepare selected contacts for export
      let selectedContacts: (string | string[])[];
      if (contact.type === "GROUP" && contact.participants) {
        selectedContacts = [contact.participants.split(",").map((p) => p.trim())];
      } else {
        selectedContacts = [contact.contact];
      }

      if (shouldSimulateFailure && isDevelopment && simulateNoChatMatch) {
        await new Promise((r) => setTimeout(r, 300));
        setExportStatus("error");
        setExportError(
          "No chats were found with the supplied contacts. Development fallback simulation.",
        );
        await findFallbackCandidates(contact);
        return;
      }

      const selectedChatIds = contact.chatIds
        ?.split(",")
        .map((chatId) => chatId.trim())
        .filter(Boolean);

      let maxPercentage = 0;
      const unsubscribe = window.electronAPI.onExportProgress((progressData) => {
        if (progressData.percentage >= maxPercentage) {
          maxPercentage = progressData.percentage;
          setExportProgress(progressData);
        }
      });

      try {
        const result = await window.electronAPI.runExporter({
          inputFolder: state.inputFolder,
          outputFolder: state.outputFolder,
          startDate: state.startDate,
          endDate: state.endDate || "",
          selectedContacts,
          selectedChatIds,
          ...(state.backupPassword ? { backupPassword: state.backupPassword } : {}),
          includeVideos: true, // Always include videos in simplified version
          debugMode,
          isFullExport: false,
        });

        unsubscribe();
        setExportProgress({ phase: "complete", current: 0, total: 0, percentage: 100 });

        // Let the 100% progress bar render before transitioning
        await new Promise((r) => setTimeout(r, 500));

        if (result.success) {
          if (result.hasMessages === false) {
            setExportStatus("error");
            setExportError("No messages found in the specified date range.");
          } else {
            setExportStatus("success");
            setExportZipPath(result.zipPath || null);
          }
        } else {
          setExportStatus("error");
          setExportError(result.error || "Export failed");
          if (result.errorCode === "NO_CHAT_MATCH") {
            await findFallbackCandidates(contact);
          }
        }
      } catch (err) {
        unsubscribe();
        setExportStatus("error");
        setExportError(err instanceof Error ? err.message : "An unexpected error occurred");
      }
    },
    [
      state.selectedContact,
      state.inputFolder,
      state.outputFolder,
      state.startDate,
      state.endDate,
      state.backupPassword,
      debugMode,
      isDevelopment,
      simulateNoChatMatch,
      findFallbackCandidates,
      setExportStatus,
      setExportError,
      setExportProgress,
      setExportZipPath,
    ],
  );

  const retryFallbackCandidate = async (candidate: Contact) => {
    setSelectedContact(candidate);
    await runExport(candidate, { simulateFailure: false });
  };

  const goBackFromExportError = () => {
    setFallbackStatus("idle");
    setFallbackCandidates([]);
    setExportStatus("idle");
    setExportError(null);
    setExportProgress(null);
    prevStep();
  };

  const getProgressText = (): string => {
    if (!state.exportProgress) return "Initializing...";

    switch (state.exportProgress.phase) {
      case "scanning":
        return (
          state.exportProgress.message ||
          `Scanning... found ${state.exportProgress.total.toLocaleString()} messages`
        );
      case "exporting":
        return `Exporting: ${state.exportProgress.current.toLocaleString()} / ${state.exportProgress.total.toLocaleString()}`;
      case "copying-attachments":
        return `Copying attachments: ${state.exportProgress.current.toLocaleString()} / ${state.exportProgress.total.toLocaleString()}`;
      case "complete":
        return "Export complete!";
      default:
        return "Processing...";
    }
  };

  if (state.exportStatus === "exporting") {
    return (
      <div className="rounded-3xl bg-white p-8 shadow-md ring-1 ring-slate-950/5">
        <h2 className="mb-6 text-center text-2xl font-semibold text-slate-800">
          Exporting messages
        </h2>
        <ProgressBar percentage={state.exportProgress?.percentage || 0} text={getProgressText()} />
      </div>
    );
  }

  const handleOpenFolder = async () => {
    if (state.exportZipPath) {
      await window.electronAPI.showItemInFolder(state.exportZipPath);
    }
  };

  if (state.exportStatus === "success") {
    return (
      <div className="rounded-3xl bg-white p-8 shadow-md ring-1 ring-slate-950/5">
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-8 w-8 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        </div>
        <h2 className="mb-2 text-center text-2xl font-semibold text-slate-800">Export complete!</h2>
        <p className="mb-6 text-center text-slate-600">
          Your messages have been exported successfully.
        </p>
        {state.exportZipPath && (
          <div className="mb-6 rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-slate-600">
              <span className="font-medium">Saved to:</span>
            </p>
            <p className="mt-1 break-all text-sm text-slate-700">{state.exportZipPath}</p>
          </div>
        )}
        <div className="flex gap-3">
          <button
            onClick={handleOpenFolder}
            className="flex-1 rounded-xl border border-slate-300 px-6 py-3 font-semibold text-slate-700 transition-all hover:bg-slate-50"
          >
            Open folder
          </button>
          <button
            onClick={resetToContactSelect}
            className="flex-1 rounded-xl bg-sky-500 px-6 py-3 font-semibold text-white transition-all hover:bg-sky-600"
          >
            Export another contact
          </button>
        </div>
      </div>
    );
  }

  if (state.exportStatus === "error") {
    return (
      <div className="rounded-3xl bg-white p-8 shadow-md ring-1 ring-slate-950/5">
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-8 w-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
        </div>
        <h2 className="mb-2 text-center text-2xl font-semibold text-slate-800">Export failed</h2>
        <p className="mb-6 text-center text-red-600">{state.exportError}</p>

        {fallbackStatus === "loading" && (
          <div className="mb-6 rounded-lg border border-sky-100 bg-sky-50 p-4 text-sm text-sky-800">
            Looking for matching chats you can retry...
          </div>
        )}

        {fallbackStatus === "ready" && (
          <div className="mb-6 rounded-lg border border-sky-100 bg-sky-50 p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Possible matching chats</h3>
            <p className="mb-3 text-sm text-slate-600">
              Choose the correct chat below to retry the export.
            </p>
            <div className="space-y-2">
              {fallbackCandidates.map((candidate) => {
                const participantPreview = getParticipantPreview(candidate);
                return (
                  <div
                    key={candidate.chatIds || candidate.contact}
                    className="rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-800">
                          {getContactDisplay(candidate)}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {getCandidateMeta(candidate)}
                        </div>
                        {participantPreview && (
                          <div className="mt-1 truncate text-xs text-slate-500">
                            {participantPreview}
                          </div>
                        )}
                        {candidate.matchReasons.length > 0 && (
                          <div className="mt-2 text-xs text-sky-700">
                            Match: {candidate.matchReasons.join(", ")}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => retryFallbackCandidate(candidate)}
                        className="shrink-0 rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-white transition-all hover:bg-sky-600"
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {fallbackStatus === "none" && (
          <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            We refreshed your chat list but did not find a close match. Go back and choose the chat
            again.
          </div>
        )}

        {fallbackStatus === "error" && (
          <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            We could not refresh your chat list. Go back and choose the chat again.
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={goBackFromExportError}
            className="flex-1 rounded-xl border border-slate-300 px-6 py-3 font-semibold text-slate-700 transition-all hover:bg-slate-50"
          >
            Go back
          </button>
          <button
            onClick={() => runExport()}
            className="flex-1 rounded-xl bg-sky-500 px-6 py-3 font-semibold text-white transition-all hover:bg-sky-600"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Default: idle state - show summary and export button
  return (
    <div className="rounded-3xl bg-white p-8 shadow-md ring-1 ring-slate-950/5">
      <h2 className="mb-6 text-center text-2xl font-semibold text-slate-800">Ready to export</h2>

      <div className="mb-6 space-y-4 rounded-xl bg-slate-50 p-4">
        <div className="flex justify-between">
          <span className="text-slate-600">Contact:</span>
          <span className="font-medium text-slate-800">{getContactName()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Date range:</span>
          <span className="font-medium text-slate-800">{getDateRangeText()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-600">Messages:</span>
          <span className="font-medium text-slate-800">
            {state.selectedContact?.messageCount.toLocaleString()} available
          </span>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={prevStep}
          className="flex-1 rounded-xl border border-slate-300 px-6 py-3 font-semibold text-slate-700 transition-all hover:bg-slate-50"
        >
          Back
        </button>
        <button
          onClick={() => runExport()}
          className="flex-1 rounded-xl bg-sky-500 px-6 py-3 font-semibold text-white transition-all hover:bg-sky-600"
        >
          Export messages
        </button>
      </div>
    </div>
  );
}

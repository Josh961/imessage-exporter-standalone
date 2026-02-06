import { useMemo, useState } from 'react';
import { useWizard } from '../../context/wizard-context';
import type { Contact } from '../../types';

function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function formatDateRange(firstDate: string, lastDate: string): string {
  const format = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const first = format(firstDate);
  const last = format(lastDate);

  if (first === last) return first;
  return `${first} - ${last}`;
}

export function Step2ContactSelection() {
  const { state, setSelectedContact, setStartDate, setEndDate, nextStep, prevStep } = useWizard();
  const [searchTerm, setSearchTerm] = useState('');
  const [tooltip, setTooltip] = useState<{ participants: string; x: number; y: number } | null>(null);

  const filteredContacts = useMemo(() => {
    const term = searchTerm.toLowerCase().replace(/[()-\s]/g, '');
    if (!term) return state.contacts;

    return state.contacts.filter((contact) => {
      const name = (contact.displayName || contact.contact).toLowerCase().replace(/[()-\s]/g, '');
      const participants = contact.participants?.toLowerCase().replace(/[()-\s]/g, '') || '';
      return name.includes(term) || participants.includes(term);
    });
  }, [state.contacts, searchTerm]);

  const handleContactClick = (contact: Contact) => {
    if (state.selectedContact?.contact !== contact.contact) {
      setStartDate('');
      setEndDate('');
    }
    setSelectedContact(contact);
    nextStep();
  };

  const getContactDisplay = (contact: Contact): string => {
    if (contact.displayName) return contact.displayName;
    if (contact.contact.includes('@')) return contact.contact;
    return formatPhoneNumber(contact.contact);
  };

  return (
    <div className="rounded-3xl bg-white p-8 shadow-md ring-1 ring-slate-950/5">
      <h2 className="mb-2 text-center text-2xl font-semibold text-slate-800">Select a contact</h2>
      <p className="mb-6 text-center text-slate-600">Choose who you want to export messages with.</p>

      {/* Search bar */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by phone number or group name..."
          className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-4 text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>

      {/* Contact list */}
      <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200">
        {filteredContacts.length === 0 ? (
          <div className="py-8 text-center text-slate-500">No contacts found matching your search.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredContacts.map((contact, index) => (
              <button
                key={`${contact.contact}-${index}`}
                onClick={() => handleContactClick(contact)}
                onMouseEnter={(e) => {
                  if (contact.type === 'GROUP' && contact.participants) {
                    setTooltip({ participants: contact.participants, x: e.clientX, y: e.clientY });
                  }
                }}
                onMouseMove={(e) => {
                  if (tooltip) setTooltip((t) => t && { ...t, x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => setTooltip(null)}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-sky-50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-slate-800">{getContactDisplay(contact)}</span>
                    {contact.type === 'GROUP' && (
                      <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {contact.participants ? contact.participants.split(',').length : 0} people
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {contact.messageCount.toLocaleString()} messages
                    {contact.firstMessageDate && contact.lastMessageDate && (
                      <span className="ml-2 text-slate-400">{formatDateRange(contact.firstMessageDate, contact.lastMessageDate)}</span>
                    )}
                  </div>
                </div>
                <svg className="ml-2 h-5 w-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>

      <button onClick={prevStep} className="mt-6 w-full rounded-xl border border-slate-300 px-6 py-3 font-semibold text-slate-700 transition-all hover:bg-slate-50">
        Back
      </button>

      {tooltip && (
        <div className="pointer-events-none fixed z-50 rounded-lg bg-white px-3 py-2 shadow-lg ring-1 ring-slate-950/5" style={{ left: tooltip.x + 12, top: tooltip.y + 12 }}>
          <div className="mb-1 text-xs font-semibold text-slate-500">Participants</div>
          {tooltip.participants.split(',').map((p, i) => (
            <div key={i} className="text-sm text-slate-700">
              {formatPhoneNumber(p.trim())}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

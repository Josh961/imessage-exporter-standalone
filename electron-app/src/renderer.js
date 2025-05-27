document.addEventListener('DOMContentLoaded', async () => {
  // DOM Element References
  const elements = {
    infoButton: document.getElementById('info-button'),
    infoModal: document.getElementById('info-modal'),
    infoModalContent: document.getElementById('info-modal-content'),
    closeModal: document.getElementById('close-modal'),
    websiteLink: document.getElementById('website-link'),
    inputFolder: document.getElementById('input-folder'),
    outputFolder: document.getElementById('output-folder'),
    selectInputFolder: document.getElementById('select-input-folder'),
    selectOutputFolder: document.getElementById('select-output-folder'),
    exportButton: document.getElementById('export-button'),
    loadingIndicator: document.getElementById('loading-indicator'),
    status: document.getElementById('status'),
    inputFolderError: document.getElementById('input-folder-error'),
    outputFolderError: document.getElementById('output-folder-error'),
    startDate: document.getElementById('start-date'),
    endDate: document.getElementById('end-date'),
    footer: document.getElementById('footer'),
    selectContacts: document.getElementById('select-contacts'),
    contactsModal: document.getElementById('contacts-modal'),
    contactsModalContent: document.getElementById('contacts-modal-content'),
    closeContactsModal: document.getElementById('close-contacts-modal'),
    contactsList: document.getElementById('contacts-list'),
    individualChatsBody: document.getElementById('individual-chats-body'),
    groupChatsBody: document.getElementById('group-chats-body'),
    toggleIndividual: document.querySelector('.toggle-individual'),
    toggleGroup: document.querySelector('.toggle-group'),
    selectAllIndividual: document.querySelector('.select-all-individual'),
    clearAllIndividual: document.querySelector('.clear-all-individual'),
    selectAllGroup: document.querySelector('.select-all-group'),
    clearAllGroup: document.querySelector('.clear-all-group'),
    selectedContactsCount: document.getElementById('selected-contacts-count'),
    selectedContactsCountTwo: document.getElementById('selected-contacts-count-two'),
    contactSearch: document.getElementById('contact-search'),
    permissionsModal: document.getElementById('permissions-modal'),
    openSystemPreferencesButton: document.getElementById('open-system-preferences'),
    checkPermissionsButton: document.getElementById('check-permissions'),
    restartAppButton: document.getElementById('restart-app'),
    permissionsInstructions: document.getElementById('permissions-instructions'),
    permissionsGranted: document.getElementById('permissions-granted'),
    settingsButton: document.getElementById('settings-button'),
    settingsModal: document.getElementById('settings-modal'),
    settingsModalContent: document.getElementById('settings-modal-content'),
    closeSettings: document.getElementById('close-settings'),
    includeVideos: document.getElementById('include-videos'),
    debugMode: document.getElementById('debug-mode'),
    manualContact: document.getElementById('manual-contact'),
    addManualContact: document.getElementById('add-manual-contact'),
    manualContactsList: document.getElementById('manual-contacts-list'),
    manualContactsCount: document.getElementById('manual-contacts-count'),
    manualContactsCountHome: document.getElementById('manual-contacts-count-home'),
    manualContactWarning: document.getElementById('manual-contact-warning'),
    manualContactEntry: document.getElementById('manual-contact-entry'),
    closeManualEntry: document.getElementById('close-manual-entry'),
    manualEntryModal: document.getElementById('manual-entry-modal'),
    manualEntryModalContent: document.getElementById('manual-entry-modal-content'),
    clearAllManualContacts: document.getElementById('clear-all-manual-contacts'),
    fullExportButton: document.getElementById('full-export-button'),
    filteredExportButton: document.getElementById('filtered-export-button'),
    dateRangeDisplay: document.getElementById('date-range-display'),
    filteredContactsDisplay: document.getElementById('filtered-contacts-display'),
  };

  // State
  let contacts = [];
  let selectedContacts = new Set();
  let manualContacts = [];
  let expandedSections = { individual: true, group: true };
  let includeVideos = false;
  let debugMode = false;

  // Initialization
  initializeDateInputs();
  await loadLastSelectedFolders();
  await setDefaultiMessageBackupFolder();
  updateFooter();
  setupEventListeners();

  // Helper Functions
  function initializeDateInputs() {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    elements.startDate.value = oneYearAgo.toISOString().split('T')[0];
  }

  async function loadLastSelectedFolders() {
    const lastInputFolder = await window.electronAPI.getLastInputFolder();
    const lastOutputFolder = await window.electronAPI.getLastOutputFolder();

    if (lastInputFolder) {
      elements.inputFolder.value = lastInputFolder;
    }

    if (lastOutputFolder) {
      elements.outputFolder.value = lastOutputFolder;
    } else {
      // If no last output folder, set it to the user's Documents folder
      const documentsFolder = await window.electronAPI.getDocumentsFolder();
      elements.outputFolder.value = documentsFolder;
      await window.electronAPI.saveLastOutputFolder(documentsFolder);
    }
  }

  async function setDefaultiMessageBackupFolder() {
    // If a last input folder was already set, don't override it
    if (elements.inputFolder.value) {
      return;
    }

    const possibleLocations = [
      // Direct macOS iMessage database location
      '~/Library/Messages/',
      // macOS iTunes backup locations
      '~/Library/Application Support/MobileSync/Backup/',
      '/Library/Application Support/MobileSync/Backup/',
      // Windows iTunes backup locations
      '%appdata%\\Apple Computer\\MobileSync\\Backup\\',
      '%appdata%\\Apple\\MobileSync\\Backup\\',
      '%USERPROFILE%\\Apple Computer\\MobileSync\\Backup\\',
      '%USERPROFILE%\\Apple\\MobileSync\\Backup\\'
    ];

    for (const location of possibleLocations) {
      try {
        let expandedPath = location;
        // Expand paths for both Unix-like and Windows systems
        if (location.includes('%') || location.startsWith('~')) {
          expandedPath = await window.electronAPI.expandPath(location);
        }

        const exists = await window.electronAPI.checkPathExists(expandedPath);
        if (exists) {
          const platform = await window.electronAPI.getPlatform();

          // For Windows paths, check for nested folders
          if (platform !== 'darwin' && location.includes('%USERPROFILE%')) {
            const nestedFolders = await window.electronAPI.getNestedFolders(expandedPath);
            if (nestedFolders && nestedFolders.length > 0) {
              expandedPath = nestedFolders[0]; // Select the first nested folder
            }
          }
          elements.inputFolder.value = expandedPath;
          await window.electronAPI.saveLastInputFolder(expandedPath);
          break;
        }
      } catch (error) {
        console.error(`Error checking path ${location}:`, error);
      }
    }
  }

  function updateFooter() {
    const currentYear = new Date().getFullYear();
    elements.footer.textContent = `© ${currentYear} My Forever Books. All rights reserved.`;
  }

  function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  function isValidDate(dateString) {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date) && date.toISOString().slice(0, 10) === dateString;
  }

  // Event Listeners Setup
  function setupEventListeners() {
    setupModalListeners();
    setupFolderSelectionListeners();
    setupContactSelectionListeners();
    setupExportButtonListener();
    setupPermissionsModalListeners();
    setupSettingsListeners();
    setupManualEntryListeners();
  }

  function setupPermissionsModalListeners() {
    elements.openSystemPreferencesButton.addEventListener('click', () => {
      window.electronAPI.openSystemPreferences();
    });

    elements.checkPermissionsButton.addEventListener('click', async () => {
      const hasAccess = await window.electronAPI.checkFullDiskAccess();
      if (hasAccess) {
        elements.checkPermissionsButton.classList.add('hidden');
        elements.permissionsInstructions.classList.add('hidden');
        elements.permissionsGranted.classList.remove('hidden');
        elements.restartAppButton.classList.remove('hidden');
      } else {
        alert('Full Disk Access has not been granted yet. Please try again.');
      }
    });

    elements.restartAppButton.addEventListener('click', () => {
      window.electronAPI.restartApp();
    });
  }

  window.electronAPI.onShowPermissionsModal(() => {
    showPermissionsModal();
  });

  function showPermissionsModal() {
    elements.permissionsModal.classList.remove('hidden');
  }

  function setupModalListeners() {
    elements.infoButton.addEventListener('click', () => elements.infoModal.classList.remove('hidden'));
    elements.closeModal.addEventListener('click', () => elements.infoModal.classList.add('hidden'));
    elements.infoModal.addEventListener('click', (e) => {
      if (!elements.infoModalContent.contains(e.target)) {
        elements.infoModal.classList.add('hidden');
      }
    });
    elements.infoModalContent.addEventListener('click', (e) => e.stopPropagation());
  }

  function setupFolderSelectionListeners() {
    elements.selectInputFolder.addEventListener('click', () => selectFolder('input'));
    elements.selectOutputFolder.addEventListener('click', () => selectFolder('output'));
  }

  async function selectFolder(type) {
    const currentPath = type === 'input' ? elements.inputFolder.value : elements.outputFolder.value;
    const result = await window.electronAPI.selectFolder(currentPath, type);
    if (result) {
      if (type === 'input') {
        elements.inputFolder.value = result;
        elements.inputFolderError.classList.add('hidden');
      } else {
        elements.outputFolder.value = result;
        elements.outputFolderError.classList.add('hidden');
      }
    }
  }

  function setupContactSelectionListeners() {
    elements.selectContacts.addEventListener('click', loadContacts);
    elements.closeContactsModal.addEventListener('click', closeContactsModal);
    elements.toggleIndividual.addEventListener('click', () => toggleSection('individual'));
    elements.toggleGroup.addEventListener('click', () => toggleSection('group'));
    elements.selectAllIndividual.addEventListener('click', () => selectAll('CONTACT'));
    elements.clearAllIndividual.addEventListener('click', () => clearAll('CONTACT'));
    elements.selectAllGroup.addEventListener('click', () => selectAll('GROUP'));
    elements.clearAllGroup.addEventListener('click', () => clearAll('GROUP'));

    elements.contactSearch.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase().replace(/[()-\s]/g, '');
      const rows = [...elements.individualChatsBody.querySelectorAll('tr'), ...elements.groupChatsBody.querySelectorAll('tr')];

      rows.forEach(row => {
        const label = row.querySelector('label');
        if (label) {
          const text = label.textContent.toLowerCase().replace(/[()-\s]/g, '');
          const participants = label.dataset.participants ? label.dataset.participants.toLowerCase().replace(/[()-\s]/g, '') : '';
          row.style.display = text.includes(searchTerm) || participants.includes(searchTerm) ? '' : 'none';
        }
      });
    });

    elements.contactsModal.addEventListener('click', (e) => {
      if (!elements.contactsModalContent.contains(e.target)) {
        closeContactsModal();
      }
    });
  }

  function closeContactsModal() {
    elements.contactsModal.classList.add('hidden');
  }

  async function loadContacts() {
    if (!elements.inputFolder.value) {
      alert('Please select an input folder first.');
      return;
    }

    const result = await window.electronAPI.listContacts(elements.inputFolder.value);
    if (result.success) {
      contacts = result.contacts.filter(x => x.contact && x.messageCount >= 20);
      if (contacts.length === 0) {
        alert('No contacts found in the selected folder. Please check that the iMessage backup folder is correct.');
        return;
      }
      renderContacts();
      updateSelectedContactsCount();
      elements.contactsModal.classList.remove('hidden');

      // Reapply search filter if there's a search term
      const searchTerm = elements.contactSearch.value;
      if (searchTerm) {
        const event = new Event('input');
        elements.contactSearch.dispatchEvent(event);
      }
    } else {
      alert(`Failed to list contacts: ${result.error}`);
    }
  }

  function renderContacts() {
    const individualChats = contacts.filter(c => c.type === 'CONTACT');
    const groupChats = contacts.filter(c => c.type === 'GROUP');

    addNumberingToGroupChats(groupChats);

    elements.individualChatsBody.innerHTML = renderContactRows(individualChats, false);
    elements.groupChatsBody.innerHTML = renderContactRows(groupChats, true);

    elements.toggleIndividual.textContent = expandedSections.individual ? 'Collapse' : 'Expand';
    elements.toggleGroup.textContent = expandedSections.group ? 'Collapse' : 'Expand';

    document.querySelector('.individual-chats').classList.toggle('hidden', !expandedSections.individual);
    document.querySelector('.group-chats').classList.toggle('hidden', !expandedSections.group);

    setupContactCheckboxListeners();
  }

  function addNumberingToGroupChats(groupChats) {
    const groupChatCounts = {};
    groupChats.forEach(chat => {
      groupChatCounts[chat.contact] = (groupChatCounts[chat.contact] || 0) + 1;
      chat.displayName = groupChatCounts[chat.contact] > 1
        ? `${chat.contact} (${groupChatCounts[chat.contact]})`
        : chat.contact;
    });
  }

  function renderContactRows(chats, isGroupChat) {
    return chats.map(chat => {
      const participantCount = isGroupChat && chat.participants ? chat.participants.split(',').length : null;
      return `
        <tr>
          <td><input type="checkbox" id="${chat.displayName || chat.contact}" value="${chat.displayName || chat.contact}" ${selectedContacts.has(chat.displayName || chat.contact) ? 'checked' : ''}></td>
          <td class="group-chat-container">
            <label for="${chat.displayName || chat.contact}" class="group-chat-label" ${isGroupChat ? `data-participants="${chat.participants || ''}"` : ''}>
              ${chat.displayName || formatPhoneNumber(chat.contact)}
            </label>
            ${isGroupChat ? '<div class="group-chat-popup hidden"></div>' : ''}
          </td>
          ${isGroupChat ? `<td>${participantCount}</td>` : ''}
          <td>${chat.messageCount}</td>
          <td>${formatDate(chat.lastMessageDate)}</td>
        </tr>
      `;
    }).join('');
  }

  function setupContactCheckboxListeners() {
    elements.contactsList.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        const contact = e.target.value;
        if (e.target.checked) {
          selectedContacts.add(contact);
        } else {
          selectedContacts.delete(contact);
        }
        updateSelectedContactsCount();
      });
    });

    // Add event listeners for group chat hover
    elements.contactsList.querySelectorAll('.group-chat-label').forEach(label => {
      const popup = label.nextElementSibling;
      if (popup && popup.classList.contains('group-chat-popup')) {
        label.addEventListener('mouseenter', (e) => {
          const participants = e.target.dataset.participants;
          if (participants) {
            const participantList = participants.split(',').map(p => p.trim()).join(', ');
            popup.innerHTML = `${participantList}`;
            popup.classList.remove('hidden');
          }
        });

        label.addEventListener('mouseleave', () => {
          popup.classList.add('hidden');
        });
      }
    });
  }

  function updateSelectedContactsCount() {
    const selectedIndividualCount = Array.from(selectedContacts).filter(contact =>
      contacts.find(c => (c.displayName || c.contact) === contact && c.type === 'CONTACT')
    ).length;

    const selectedGroupCount = Array.from(selectedContacts).filter(contact =>
      contacts.find(c => (c.displayName || c.contact) === contact && c.type === 'GROUP')
    ).length;

    elements.selectedContactsCount.textContent = `Selected: ${selectedIndividualCount} contact${selectedIndividualCount !== 1 ? 's' : ''}, ${selectedGroupCount} group chat${selectedGroupCount !== 1 ? 's' : ''}`;
    elements.selectedContactsCountTwo.textContent = `Selected: ${selectedIndividualCount} contact${selectedIndividualCount !== 1 ? 's' : ''}, ${selectedGroupCount} group chat${selectedGroupCount !== 1 ? 's' : ''}`;

    updateFilteredExportDisplay();
  }

  function toggleSection(section) {
    expandedSections[section] = !expandedSections[section];
    renderContacts();

    // Reapply search filter if there's a search term
    const searchTerm = elements.contactSearch.value;
    if (searchTerm) {
      const event = new Event('input');
      elements.contactSearch.dispatchEvent(event);
    }
  }

  function selectAll(type) {
    contacts.filter(c => c.type === type).forEach(contact => {
      selectedContacts.add(contact.displayName || contact.contact);
    });
    renderContacts();
    updateSelectedContactsCount();
  }

  function clearAll(type) {
    contacts.filter(c => c.type === type).forEach(contact => {
      selectedContacts.delete(contact.displayName || contact.contact);
    });
    renderContacts();
    updateSelectedContactsCount();
  }

  function setupExportButtonListener() {
    elements.exportButton.addEventListener('click', exportContacts);
  }

  let exportAnimationInterval;

  async function exportContacts() {
    resetErrorMessages();
    if (!validateExportInputs()) return;

    elements.exportButton.disabled = true;
    elements.exportButton.classList.remove('hover:bg-sky-600');
    elements.exportButton.classList.add('hover:bg-sky-500', 'opacity-60');

    elements.status.innerHTML = 'Exporting, please wait<span id="animatedDots">.</span>';
    const dotsElement = document.getElementById('animatedDots');

    let dots = 1;
    exportAnimationInterval = setInterval(() => {
      dots = (dots % 3) + 1;
      dotsElement.textContent = '.'.repeat(dots);
    }, 500);

    elements.status.className = 'text-center font-semibold text-sky-500';

    try {
      // Helper function to get last 10 digits of a phone number
      const getLast10Digits = (number) => {
        const digits = number.replace(/\D/g, '');
        return digits.slice(-10);
      };

      // Helper function to compare two arrays of phone numbers
      const areGroupsEqual = (group1, group2) => {
        if (group1.length !== group2.length) return false;
        const numbers1 = group1.map(n => getLast10Digits(n)).sort();
        const numbers2 = group2.map(n => getLast10Digits(n)).sort();
        return numbers1.every((num, idx) => num === numbers2[idx]);
      };

      // Get all selected contacts first
      const selectedContactsList = Array.from(selectedContacts).map(contact => {
        const contactData = contacts.find(c => (c.displayName || c.contact) === contact);
        if (contactData && contactData.type === 'GROUP') {
          return contactData.participants.split(',').map(p => p.trim());
        }
        return contact;
      });

      // Filter manual contacts to exclude those that match selected contacts
      const manualContactsList = manualContacts.filter(entry => {
        if (entry.type === 'GROUP') {
          // For groups, check if there's a matching group in selected contacts
          return !selectedContactsList.some(selectedContact => {
            if (Array.isArray(selectedContact)) {
              return areGroupsEqual(selectedContact, entry.contacts);
            }
            return false;
          });
        }
        // For individual contacts, check last 10 digits
        const manualNumber = getLast10Digits(entry.contacts[0]);
        return !Array.from(selectedContacts).some(contact => {
          const contactData = contacts.find(c => (c.displayName || c.contact) === contact);
          if (contactData && contactData.type === 'CONTACT') {
            return getLast10Digits(contactData.contact) === manualNumber;
          }
          return false;
        });
      }).map(entry => entry.type === 'GROUP' ? entry.contacts : entry.contacts[0]);

      const allSelectedContacts = [...selectedContactsList, ...manualContactsList];

      const exportParams = {
        inputFolder: elements.inputFolder.value,
        outputFolder: elements.outputFolder.value,
        startDate: elements.startDate.value,
        endDate: elements.endDate.value,
        selectedContacts: allSelectedContacts,
        includeVideos: includeVideos,
        debugMode: debugMode,
        isFullExport: false
      };

      const result = await window.electronAPI.runExporter(exportParams);
      updateExportStatus(result);
    } catch (error) {
      elements.status.textContent = `❌ An error occurred: ${error.message}`;
      elements.status.className = 'text-center font-semibold text-red-500';
    } finally {
      clearInterval(exportAnimationInterval);

      elements.exportButton.disabled = false;
      elements.exportButton.classList.remove('hover:bg-sky-500', 'opacity-60');
      elements.exportButton.classList.add('hover:bg-sky-600');
    }
  }

  function updateExportStatus(result) {
    clearInterval(exportAnimationInterval);

    if (result.success) {
      elements.status.textContent = `✅ Export completed successfully! Output folder: ${result.zipPath}`;
      elements.status.className = 'text-center font-semibold text-green-500';
    } else {
      elements.status.textContent = `❌ Export failed: ${result.error}`;
      elements.status.className = 'text-center font-semibold text-red-500';
    }
  }

  function resetErrorMessages() {
    elements.inputFolderError.classList.add('hidden');
    elements.outputFolderError.classList.add('hidden');
    elements.status.textContent = '';
    elements.status.className = 'text-center font-semibold';
  }

  function validateExportInputs() {
    let isValid = true;

    if (selectedContacts.size === 0 && manualContacts.length === 0) {
      elements.status.textContent = 'Select at least one contact or add a manual contact to export';
      elements.status.className = 'text-center font-semibold text-red-500';
      isValid = false;
    }

    if (!elements.inputFolder.value) {
      elements.inputFolderError.classList.remove('hidden');
      isValid = false;
    }
    if (!elements.outputFolder.value) {
      elements.outputFolderError.classList.remove('hidden');
      isValid = false;
    }

    const startDate = elements.startDate.value;
    const endDate = elements.endDate.value;

    if (startDate && !isValidDate(startDate)) {
      elements.status.textContent = 'Invalid start date';
      elements.status.className = 'text-center font-semibold text-red-500';
      isValid = false;
    }

    if (endDate && !isValidDate(endDate)) {
      elements.status.textContent = 'Invalid end date';
      elements.status.className = 'text-center font-semibold text-red-500';
      isValid = false;
    }

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      elements.status.textContent = 'Start date cannot be after end date';
      elements.status.className = 'text-center font-semibold text-red-500';
      isValid = false;
    }

    return isValid;
  }

  // Handle external links
  document.querySelectorAll('a[target="_blank"]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      window.electronAPI.openExternalLink(e.target.href);
    });
  });

  elements.websiteLink.addEventListener('click', (e) => {
    e.preventDefault();
    window.electronAPI.openExternalLink('https://myforeverbooks.com');
  });

  function setupSettingsListeners() {
    elements.settingsButton.addEventListener('click', () => {
      updateDateRangeDisplay();
      updateFilteredExportDisplay();
      openSettingsModal();
    });
    elements.closeSettings.addEventListener('click', closeSettingsModal);
    elements.settingsModal.addEventListener('click', (e) => {
      if (!elements.settingsModalContent.contains(e.target)) {
        closeSettingsModal();
      }
    });

    elements.fullExportButton.addEventListener('click', fullExport);
    elements.filteredExportButton.addEventListener('click', filteredExport);

    // Date change listeners
    elements.startDate.addEventListener('change', () => {
      updateDateRangeDisplay();
      updateFilteredExportDisplay();
    });
    elements.endDate.addEventListener('change', () => {
      updateDateRangeDisplay();
      updateFilteredExportDisplay();
    });

    // Load saved preferences
    elements.includeVideos.checked = localStorage.getItem('includeVideos') === 'true';
    includeVideos = elements.includeVideos.checked;

    elements.debugMode.checked = localStorage.getItem('debugMode') === 'true' || false;
    debugMode = elements.debugMode.checked;

    elements.includeVideos.addEventListener('change', (e) => {
      includeVideos = e.target.checked;
      localStorage.setItem('includeVideos', includeVideos);
    });

    elements.debugMode.addEventListener('change', (e) => {
      debugMode = e.target.checked;
      localStorage.setItem('debugMode', debugMode);
    });
  }

  function openSettingsModal() {
    elements.settingsModal.classList.remove('hidden');
  }

  function closeSettingsModal() {
    elements.settingsModal.classList.add('hidden');
  }

  function openManualEntryModal() {
    elements.manualEntryModal.classList.remove('hidden');
    elements.manualContact.focus();
  }

  function closeManualEntryModal() {
    elements.manualEntryModal.classList.add('hidden');
    elements.manualContact.value = '';
  }

  function addManualContact() {
    const input = elements.manualContact.value.trim();
    if (!input) {
      elements.manualContactWarning.textContent = 'Please enter a phone number';
      elements.manualContactWarning.classList.remove('hidden');
      elements.manualContact.focus();
      return;
    }

    const isGroup = input.includes(',');
    const contacts = isGroup ? input.split(',').map(c => c.trim()) : [input.trim()];

    if (contacts.some(c => !c)) {
      elements.manualContactWarning.textContent = 'Please enter valid phone numbers';
      elements.manualContactWarning.classList.remove('hidden');
      elements.manualContact.focus();
      return;
    }

    // Check for duplicates
    elements.manualContactWarning.classList.add('hidden');
    if (isGroup) {
      const exists = manualContacts.some(entry =>
        entry.type === 'GROUP' &&
        entry.contacts.length === contacts.length &&
        entry.contacts.every(c1 => contacts.some(c2 => formatPhoneNumber(c1) === formatPhoneNumber(c2)))
      );
      if (exists) {
        elements.manualContactWarning.textContent = 'This group chat has already been added';
        elements.manualContactWarning.classList.remove('hidden');
        elements.manualContact.focus();
        return;
      }
    } else {
      const exists = manualContacts.some(entry =>
        entry.type === 'CONTACT' &&
        formatPhoneNumber(entry.contacts[0]) === formatPhoneNumber(contacts[0])
      );
      if (exists) {
        elements.manualContactWarning.textContent = 'This contact has already been added';
        elements.manualContactWarning.classList.remove('hidden');
        elements.manualContact.focus();
        return;
      }
    }

    manualContacts.push({
      type: isGroup ? 'GROUP' : 'CONTACT',
      contacts: contacts,
      id: Date.now() + Math.random()
    });

    elements.manualContact.value = '';
    elements.manualContact.focus();
    renderManualContacts();
  }

  function renderManualContacts() {
    elements.manualContactsList.innerHTML = manualContacts.map(entry => `
      <div class="flex items-start gap-4 p-3 bg-slate-50 rounded border border-slate-200 hover:border-slate-300 transition-colors" data-id="${entry.id}">
        <div class="flex-1 px-2">
          <span class="text-sm text-slate-700 break-words">
            ${entry.type === 'GROUP' ?
        `Group: ${entry.contacts.join(', ')}` :
        entry.contacts[0]
      }
          </span>
        </div>
        <button class="delete-manual-contact text-xs text-red-500 hover:text-red-600 shrink-0 pr-2">
          Delete
        </button>
      </div>
    `).join('');

    // Show/hide delete all button based on contacts
    elements.clearAllManualContacts.classList.toggle('hidden', manualContacts.length === 0);

    // Update manual contacts count
    const individualCount = manualContacts.filter(c => c.type === 'CONTACT').length;
    const groupCount = manualContacts.filter(c => c.type === 'GROUP').length;

    // Update count on home screen only
    elements.manualContactsCountHome.textContent =
      `Manual: ${individualCount} contact${individualCount !== 1 ? 's' : ''}, ${groupCount} group chat${groupCount !== 1 ? 's' : ''}`;

    // Add event listeners for delete buttons
    elements.manualContactsList.querySelectorAll('.delete-manual-contact').forEach(button => {
      const handleDelete = (e) => {
        e.stopPropagation();
        const container = e.target.closest('[data-id]');
        const id = parseFloat(container.dataset.id);
        manualContacts = manualContacts.filter(c => c.id !== id);
        renderManualContacts();
      };

      button.addEventListener('click', handleDelete);
    });

    updateFilteredExportDisplay();
  }

  function setupManualEntryListeners() {
    elements.manualContactEntry.addEventListener('click', openManualEntryModal);
    elements.closeManualEntry.addEventListener('click', closeManualEntryModal);
    elements.addManualContact.addEventListener('click', addManualContact);
    elements.clearAllManualContacts.addEventListener('click', clearAllManualContacts);
    elements.manualContact.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addManualContact();
      }
    });

    // Close manual entry modal when clicking outside
    elements.manualEntryModal.addEventListener('click', (e) => {
      if (!elements.manualEntryModalContent.contains(e.target)) {
        closeManualEntryModal();
      }
    });
  }

  function clearAllManualContacts() {
    manualContacts = [];
    renderManualContacts();
  }

  async function fullExport() {
    const inputFolder = elements.inputFolder.value;
    const outputFolder = elements.outputFolder.value;
    const startDate = elements.startDate.value;
    const endDate = elements.endDate.value;

    if (!inputFolder || !outputFolder) {
      closeSettingsModal();
      if (!inputFolder) elements.inputFolderError.classList.remove('hidden');
      if (!outputFolder) elements.outputFolderError.classList.remove('hidden');
      return;
    }

    closeSettingsModal();

    const exportParams = {
      inputFolder,
      outputFolder,
      startDate,
      endDate,
      selectedContacts: [], // Empty array for full export
      includeVideos,
      debugMode,
      isFullExport: true // Add flag to skip contact validation
    };

    elements.status.innerHTML = 'Exporting all messages, this may take some time<span id="animatedDots">.</span>';
    const dotsElement = document.getElementById('animatedDots');

    let dots = 1;
    exportAnimationInterval = setInterval(() => {
      dots = (dots % 3) + 1;
      dotsElement.textContent = '.'.repeat(dots);
    }, 500);

    elements.status.className = 'text-center font-semibold text-sky-500';

    // Disable and style buttons
    elements.exportButton.disabled = true;
    elements.exportButton.classList.remove('hover:bg-sky-600');
    elements.exportButton.classList.add('hover:bg-sky-500', 'opacity-60');

    elements.fullExportButton.disabled = true;
    elements.fullExportButton.classList.remove('hover:bg-sky-50', 'hover:border-sky-600', 'hover:shadow-md', 'hover:scale-[1.02]');
    elements.fullExportButton.classList.add('opacity-60');

    elements.selectContacts.disabled = true;
    elements.manualContactEntry.disabled = true;
    elements.selectContacts.classList.add('opacity-50', 'cursor-not-allowed');
    elements.manualContactEntry.classList.add('opacity-50', 'cursor-not-allowed');

    try {
      const result = await window.electronAPI.runExporter(exportParams);
      updateExportStatus(result);
    } catch (error) {
      elements.status.textContent = `❌ An error occurred: ${error.message}`;
      elements.status.className = 'text-center font-semibold text-red-500';
    } finally {
      clearInterval(exportAnimationInterval);

      // Re-enable and restore button styles
      elements.exportButton.disabled = false;
      elements.exportButton.classList.remove('hover:bg-sky-500', 'opacity-60');
      elements.exportButton.classList.add('hover:bg-sky-600');

      elements.fullExportButton.disabled = false;
      elements.fullExportButton.classList.remove('opacity-60');
      elements.fullExportButton.classList.add('hover:bg-sky-50', 'hover:border-sky-600', 'hover:shadow-md', 'hover:scale-[1.02]');

      elements.selectContacts.disabled = false;
      elements.manualContactEntry.disabled = false;
      elements.selectContacts.classList.remove('opacity-50', 'cursor-not-allowed');
      elements.manualContactEntry.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  }

  async function filteredExport() {
    const inputFolder = elements.inputFolder.value;
    const outputFolder = elements.outputFolder.value;
    const startDate = elements.startDate.value;
    const endDate = elements.endDate.value;

    if (!inputFolder || !outputFolder) {
      closeSettingsModal();
      if (!inputFolder) elements.inputFolderError.classList.remove('hidden');
      if (!outputFolder) elements.outputFolderError.classList.remove('hidden');
      return;
    }

    if (selectedContacts.size === 0 && manualContacts.length === 0) {
      closeSettingsModal();
      elements.status.textContent = 'Select at least one contact or add a manual contact for slow export';
      elements.status.className = 'text-center font-semibold text-red-500';
      return;
    }

    closeSettingsModal();

    // Get all selected contacts first
    const getLast10Digits = (number) => {
      const digits = number.replace(/\D/g, '');
      return digits.slice(-10);
    };

    const areGroupsEqual = (group1, group2) => {
      if (group1.length !== group2.length) return false;
      const numbers1 = group1.map(n => getLast10Digits(n)).sort();
      const numbers2 = group2.map(n => getLast10Digits(n)).sort();
      return numbers1.every((num, idx) => num === numbers2[idx]);
    };

    const selectedContactsList = Array.from(selectedContacts).map(contact => {
      const contactData = contacts.find(c => (c.displayName || c.contact) === contact);
      if (contactData && contactData.type === 'GROUP') {
        return contactData.participants.split(',').map(p => p.trim());
      }
      return contact;
    });

    const manualContactsList = manualContacts.filter(entry => {
      if (entry.type === 'GROUP') {
        return !selectedContactsList.some(selectedContact => {
          if (Array.isArray(selectedContact)) {
            return areGroupsEqual(selectedContact, entry.contacts);
          }
          return false;
        });
      }
      const manualNumber = getLast10Digits(entry.contacts[0]);
      return !Array.from(selectedContacts).some(contact => {
        const contactData = contacts.find(c => (c.displayName || c.contact) === contact);
        if (contactData && contactData.type === 'CONTACT') {
          return getLast10Digits(contactData.contact) === manualNumber;
        }
        return false;
      });
    }).map(entry => entry.type === 'GROUP' ? entry.contacts : entry.contacts[0]);

    const allSelectedContacts = [...selectedContactsList, ...manualContactsList];

    const exportParams = {
      inputFolder,
      outputFolder,
      startDate,
      endDate,
      selectedContacts: allSelectedContacts,
      includeVideos,
      debugMode,
      isFilteredExport: true // New flag for filtered export
    };

    elements.status.innerHTML = 'Using slow export method, this may take some time<span id="animatedDots">.</span>';
    const dotsElement = document.getElementById('animatedDots');

    let dots = 1;
    exportAnimationInterval = setInterval(() => {
      dots = (dots % 3) + 1;
      dotsElement.textContent = '.'.repeat(dots);
    }, 500);

    elements.status.className = 'text-center font-semibold text-sky-500';

    // Disable and style buttons
    elements.exportButton.disabled = true;
    elements.exportButton.classList.remove('hover:bg-sky-600');
    elements.exportButton.classList.add('hover:bg-sky-500', 'opacity-60');

    elements.fullExportButton.disabled = true;
    elements.fullExportButton.classList.remove('hover:bg-sky-50', 'hover:border-sky-600', 'hover:shadow-md', 'hover:scale-[1.02]');
    elements.fullExportButton.classList.add('opacity-60');

    elements.filteredExportButton.disabled = true;
    elements.filteredExportButton.classList.remove('hover:bg-sky-50', 'hover:border-sky-600', 'hover:shadow-md', 'hover:scale-[1.02]');
    elements.filteredExportButton.classList.add('opacity-60');

    elements.selectContacts.disabled = true;
    elements.manualContactEntry.disabled = true;
    elements.selectContacts.classList.add('opacity-50', 'cursor-not-allowed');
    elements.manualContactEntry.classList.add('opacity-50', 'cursor-not-allowed');

    try {
      const result = await window.electronAPI.runExporter(exportParams);
      updateExportStatus(result);
    } catch (error) {
      elements.status.textContent = `❌ An error occurred: ${error.message}`;
      elements.status.className = 'text-center font-semibold text-red-500';
    } finally {
      clearInterval(exportAnimationInterval);

      // Re-enable and restore button styles
      elements.exportButton.disabled = false;
      elements.exportButton.classList.remove('hover:bg-sky-500', 'opacity-60');
      elements.exportButton.classList.add('hover:bg-sky-600');

      elements.fullExportButton.disabled = false;
      elements.fullExportButton.classList.remove('opacity-60');
      elements.fullExportButton.classList.add('hover:bg-sky-50', 'hover:border-sky-600', 'hover:shadow-md', 'hover:scale-[1.02]');

      elements.filteredExportButton.disabled = false;
      elements.filteredExportButton.classList.remove('opacity-60');
      elements.filteredExportButton.classList.add('hover:bg-sky-50', 'hover:border-sky-600', 'hover:shadow-md', 'hover:scale-[1.02]');

      elements.selectContacts.disabled = false;
      elements.manualContactEntry.disabled = false;
      elements.selectContacts.classList.remove('opacity-50', 'cursor-not-allowed');
      elements.manualContactEntry.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  }

  function updateDateRangeDisplay() {
    const startDate = elements.startDate.value;
    const endDate = elements.endDate.value;

    if (!startDate && !endDate) {
      elements.dateRangeDisplay.textContent = 'No date range selected - will export all messages';
    } else if (startDate && !endDate) {
      elements.dateRangeDisplay.textContent = `Exporting messages from ${formatDateForDisplay(startDate)} onwards`;
    } else if (!startDate && endDate) {
      elements.dateRangeDisplay.textContent = `Exporting messages up to ${formatDateForDisplay(endDate)}`;
    } else {
      elements.dateRangeDisplay.textContent = `Exporting messages from ${formatDateForDisplay(startDate)} to ${formatDateForDisplay(endDate)}`;
    }
  }

  function updateFilteredExportDisplay() {
    // Update contacts display
    const selectedIndividualCount = Array.from(selectedContacts).filter(contact =>
      contacts.find(c => (c.displayName || c.contact) === contact && c.type === 'CONTACT')
    ).length;

    const selectedGroupCount = Array.from(selectedContacts).filter(contact =>
      contacts.find(c => (c.displayName || c.contact) === contact && c.type === 'GROUP')
    ).length;

    const manualIndividualCount = manualContacts.filter(c => c.type === 'CONTACT').length;
    const manualGroupCount = manualContacts.filter(c => c.type === 'GROUP').length;

    const totalIndividual = selectedIndividualCount + manualIndividualCount;
    const totalGroup = selectedGroupCount + manualGroupCount;

    let contactText;
    if (totalIndividual === 0 && totalGroup === 0) {
      contactText = 'No contacts selected';
    } else {
      contactText = `Selected: ${totalIndividual} contact${totalIndividual !== 1 ? 's' : ''}, ${totalGroup} group chat${totalGroup !== 1 ? 's' : ''}`;
    }

    // Add date range information (same logic as updateDateRangeDisplay)
    const startDate = elements.startDate.value;
    const endDate = elements.endDate.value;

    let dateText;
    if (!startDate && !endDate) {
      dateText = 'No date range selected - will export all messages';
    } else if (startDate && !endDate) {
      dateText = `Exporting messages from ${formatDateForDisplay(startDate)} onwards`;
    } else if (!startDate && endDate) {
      dateText = `Exporting messages up to ${formatDateForDisplay(endDate)}`;
    } else {
      dateText = `Exporting messages from ${formatDateForDisplay(startDate)} to ${formatDateForDisplay(endDate)}`;
    }

    elements.filteredContactsDisplay.innerHTML = `${contactText}<br><span class="text-sm italic text-slate-400">${dateText}</span>`;
  }

  function formatDateForDisplay(dateString) {
    const date = new Date(dateString);
    // Add timezone offset to get the correct local date
    date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
});

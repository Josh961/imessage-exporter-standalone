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
    toggleIndividualHeader: document.querySelector('.toggle-individual-header'),
    toggleGroupHeader: document.querySelector('.toggle-group-header'),
    individualToggleIcon: document.querySelector('.individual-toggle-icon'),
    groupToggleIcon: document.querySelector('.group-toggle-icon'),
    selectAllIndividual: document.querySelector('.select-all-individual'),
    selectAllGroup: document.querySelector('.select-all-group'),
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
    fullExportButton: document.getElementById('full-export-button'),
    filteredExportButton: document.getElementById('filtered-export-button'),
    dateRangeDisplay: document.getElementById('date-range-display'),
    filteredContactsDisplay: document.getElementById('filtered-contacts-display'),
    useDefaultFolder: document.getElementById('use-default-folder'),
    useIphoneBackup: document.getElementById('use-iphone-backup'),
    macMessagesCheck: document.getElementById('mac-messages-check'),
    iphoneBackupCheck: document.getElementById('iphone-backup-check'),
    backupModal: document.getElementById('backup-modal'),
    backupModalContent: document.getElementById('backup-modal-content'),
    closeBackupModal: document.getElementById('close-backup-modal'),
    backupList: document.getElementById('backup-list'),
    noBackupsMessage: document.getElementById('no-backups-message'),
    emptyExportModal: document.getElementById('empty-export-modal'),
    emptyExportModalContent: document.getElementById('empty-export-modal-content'),
    closeEmptyExportModal: document.getElementById('close-empty-export-modal'),
  };

  // State
  let contacts = [];
  let selectedContacts = new Set();
  let expandedSections = { individual: true, group: true };
  let includeVideos = false;
  let debugMode = false;
  let platform = null;

  // Initialization
  platform = await window.electronAPI.getPlatform();
  await loadLastSelectedFolders();
  await setDefaultiMessageBackupFolder();
  updateFooter();
  setupPlatformUI();
  setupEventListeners();

  // Helper Functions
  async function loadLastSelectedFolders() {
    const lastInputFolder = await window.electronAPI.getLastInputFolder();
    const lastOutputFolder = await window.electronAPI.getLastOutputFolder();

    if (lastInputFolder) {
      elements.inputFolder.value = lastInputFolder;
      updateBackupSourceIndicator(lastInputFolder);
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

  function updateBackupSourceIndicator(folderPath) {
    if (!folderPath) return;

    // Check if elements exist
    if (!elements.iphoneBackupCheck) {
      console.log('Checkmark elements not found');
      return;
    }

    const isBackup = folderPath.includes('MobileSync') && folderPath.includes('Backup');
    const isDefaultMessages = platform === 'darwin' && folderPath.includes('/Library/Messages') && !isBackup;

    // Hide all checkmarks first
    elements.iphoneBackupCheck.classList.add('hidden');
    if (elements.macMessagesCheck) {
      elements.macMessagesCheck.classList.add('hidden');
    }

    // Show the appropriate checkmark
    if (isDefaultMessages && elements.macMessagesCheck) {
      elements.macMessagesCheck.classList.remove('hidden');
    } else if (isBackup) {
      elements.iphoneBackupCheck.classList.remove('hidden');
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
          updateBackupSourceIndicator(expandedPath);
          await window.electronAPI.saveLastInputFolder(expandedPath);
          break;
        }
      } catch (error) {
        console.error(`Error checking path ${location}:`, error);
      }
    }
  }

  function setupPlatformUI() {
    const macBackupOptions = document.getElementById('mac-backup-options');
    const backupButtonText = document.getElementById('backup-button-text');

    if (platform === 'darwin') {
      // Mac: show Mac Messages option
      if (macBackupOptions) macBackupOptions.style.display = 'flex';
      if (backupButtonText) backupButtonText.textContent = 'Use iPhone Backup';
    } else {
      // Windows: hide Mac Messages option
      if (macBackupOptions) macBackupOptions.style.display = 'none';
      if (backupButtonText) backupButtonText.textContent = 'Use iTunes Backup';
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
    setupEmptyExportModalListeners();
  }

  function setupEmptyExportModalListeners() {
    // Hide Mac-only elements on Windows
    if (platform !== 'darwin') {
      const macOnlyBackupTip = document.getElementById('mac-only-backup-tip');
      const macOnlyBackupSection = document.getElementById('mac-only-backup-section');
      const macOnlyBackupNote = document.getElementById('mac-only-backup-note');

      if (macOnlyBackupTip) macOnlyBackupTip.style.display = 'none';
      if (macOnlyBackupSection) macOnlyBackupSection.style.display = 'none';
      if (macOnlyBackupNote) macOnlyBackupNote.style.display = 'none';
    }

    const resetAllSections = () => {
      // Reset the expandable backup instructions section to collapsed state
      const content = document.getElementById('backup-instructions-content');
      const arrow = document.getElementById('backup-instructions-arrow');
      if (content) content.classList.add('hidden');
      if (arrow) arrow.style.transform = 'rotate(0deg)';
    };

    elements.closeEmptyExportModal.addEventListener('click', () => {
      elements.emptyExportModal.classList.add('hidden');
      resetAllSections();
    });

    elements.emptyExportModal.addEventListener('click', (e) => {
      if (!elements.emptyExportModalContent.contains(e.target)) {
        elements.emptyExportModal.classList.add('hidden');
        resetAllSections();
      }
    });

    // No sync tips section in current HTML, removed related code

    // Handle expandable backup instructions
    const backupToggle = document.getElementById('toggle-backup-instructions');
    if (backupToggle) {
      backupToggle.addEventListener('click', () => {
        const content = document.getElementById('backup-instructions-content');
        const arrow = document.getElementById('backup-instructions-arrow');

        if (content.classList.contains('hidden')) {
          content.classList.remove('hidden');
          arrow.style.transform = 'rotate(90deg)';

          // Show correct instructions based on platform
          const macSteps = document.getElementById('mac-backup-steps');
          const windowsSteps = document.getElementById('windows-backup-steps');
          if (platform === 'darwin') {
            if (macSteps) macSteps.classList.remove('hidden');
            if (windowsSteps) windowsSteps.classList.add('hidden');
          } else {
            if (macSteps) macSteps.classList.add('hidden');
            if (windowsSteps) windowsSteps.classList.remove('hidden');
          }
        } else {
          content.classList.add('hidden');
          arrow.style.transform = 'rotate(0deg)';
        }
      });
    }
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
        alert('Full Disk Access has not been granted yet. Try again.');
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

    // Quick access buttons for backup sources
    if (elements.useDefaultFolder) {
      elements.useDefaultFolder.addEventListener('click', async () => {
        const defaultFolder = await window.electronAPI.getDefaultMessagesFolder();
        if (defaultFolder) {
          elements.inputFolder.value = defaultFolder;
          elements.inputFolderError.classList.add('hidden');
          updateBackupSourceIndicator(defaultFolder);
          await window.electronAPI.saveLastInputFolder(defaultFolder);
        }
      });
    }

    elements.useIphoneBackup.addEventListener('click', async () => {
      await openBackupModal();
    });

    // Backup modal listeners
    elements.closeBackupModal.addEventListener('click', closeBackupModal);
    elements.backupModal.addEventListener('click', (e) => {
      if (!elements.backupModalContent.contains(e.target)) {
        closeBackupModal();
      }
    });
  }

  async function selectFolder(type) {
    const currentPath = type === 'input' ? elements.inputFolder.value : elements.outputFolder.value;
    const result = await window.electronAPI.selectFolder(currentPath, type);
    if (result) {
      if (type === 'input') {
        elements.inputFolder.value = result;
        elements.inputFolderError.classList.add('hidden');
        updateBackupSourceIndicator(result);
      } else {
        elements.outputFolder.value = result;
        elements.outputFolderError.classList.add('hidden');
      }
    }
  }

  async function openBackupModal() {
    elements.backupModal.classList.remove('hidden');
    elements.backupList.innerHTML = '<div class="text-center text-sm text-slate-600">Scanning for backups...</div>';
    elements.noBackupsMessage.classList.add('hidden');

    // Show appropriate instructions based on platform
    const macInstructions = document.getElementById('mac-backup-instructions');
    const windowsInstructions = document.getElementById('windows-backup-instructions');
    const windowsItunesNote = document.getElementById('windows-itunes-note');
    if (platform === 'darwin') {
      if (macInstructions) macInstructions.classList.remove('hidden');
      if (windowsInstructions) windowsInstructions.classList.add('hidden');
      if (windowsItunesNote) windowsItunesNote.classList.add('hidden');
    } else {
      if (macInstructions) macInstructions.classList.add('hidden');
      if (windowsInstructions) windowsInstructions.classList.remove('hidden');
      if (windowsItunesNote) windowsItunesNote.classList.remove('hidden');
    }

    const result = await window.electronAPI.scanIphoneBackups();

    // Clear the scanning message
    elements.backupList.innerHTML = '';

    if (result.success && result.backups && result.backups.length > 0) {
      elements.noBackupsMessage.classList.add('hidden');
      elements.backupList.innerHTML = result.backups.map(backup => {
        const backupDate = new Date(backup.backupDate);
        const dateStr = backupDate.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        return `
          <div class="backup-item rounded-md border border-slate-200 px-4 py-3 hover:border-sky-500 hover:bg-sky-50" style="cursor: pointer;" data-path="${backup.path}">
            <div class="font-semibold text-slate-800">${backup.folderName}</div>
            <div class="text-sm text-slate-600 mt-1">Created: ${dateStr}</div>
          </div>
        `;
      }).join('');

      // Add click handlers to backup items
      elements.backupList.querySelectorAll('.backup-item').forEach(item => {
        item.addEventListener('click', async () => {
          const backupPath = item.dataset.path;
          elements.inputFolder.value = backupPath;
          elements.inputFolderError.classList.add('hidden');
          updateBackupSourceIndicator(backupPath);
          await window.electronAPI.saveLastInputFolder(backupPath);
          closeBackupModal();
        });
      });
    } else {
      // No backups found - show the message
      elements.noBackupsMessage.classList.remove('hidden');
    }
  }

  function closeBackupModal() {
    elements.backupModal.classList.add('hidden');
  }

  function setupContactSelectionListeners() {
    elements.selectContacts.addEventListener('click', loadContacts);
    elements.closeContactsModal.addEventListener('click', closeContactsModal);
    elements.toggleIndividualHeader.addEventListener('click', () => toggleSection('individual'));
    elements.toggleGroupHeader.addEventListener('click', () => toggleSection('group'));

    // Handle select all checkboxes
    elements.selectAllIndividual.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectAll('CONTACT');
      } else {
        clearAll('CONTACT');
      }
    });

    elements.selectAllGroup.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectAll('GROUP');
      } else {
        clearAll('GROUP');
      }
    });

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
      alert('Select an input folder first.');
      return;
    }

    const result = await window.electronAPI.listContacts(elements.inputFolder.value);
    if (result.success) {
      contacts = result.contacts.filter(x => x.contact && x.messageCount >= 20);
      if (contacts.length === 0) {
        alert('No contacts found in the selected folder. Check that the iMessage backup folder is correct.');
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

    // Update arrow icons based on expanded state
    elements.individualToggleIcon.style.transform = expandedSections.individual ? 'rotate(90deg)' : 'rotate(0deg)';
    elements.groupToggleIcon.style.transform = expandedSections.group ? 'rotate(90deg)' : 'rotate(0deg)';

    document.querySelector('.individual-chats').classList.toggle('hidden', !expandedSections.individual);
    document.querySelector('.group-chats').classList.toggle('hidden', !expandedSections.group);

    // Update select all checkbox states
    updateSelectAllCheckboxStates();

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

      // Format the date range
      let dateRangeText = '';
      if (chat.firstMessageDate && chat.lastMessageDate) {
        const firstDate = new Date(chat.firstMessageDate);
        const lastDate = new Date(chat.lastMessageDate);

        // Format dates to show just the date without time
        const firstDateStr = firstDate.toLocaleDateString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric'
        });
        const lastDateStr = lastDate.toLocaleDateString('en-US', {
          year: 'numeric', month: 'short', day: 'numeric'
        });

        if (firstDateStr === lastDateStr) {
          dateRangeText = firstDateStr;
        } else {
          dateRangeText = `${firstDateStr} - ${lastDateStr}`;
        }
      } else if (chat.lastMessageDate) {
        // Fallback to just last message date if first is not available
        dateRangeText = formatDate(chat.lastMessageDate);
      }

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
          <td>${dateRangeText}</td>
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
        updateSelectAllCheckboxStates();
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

  function updateSelectAllCheckboxStates() {
    // Update individual select all checkbox
    const individualChats = contacts.filter(c => c.type === 'CONTACT');
    const selectedIndividualCount = individualChats.filter(chat =>
      selectedContacts.has(chat.displayName || chat.contact)
    ).length;

    if (individualChats.length > 0) {
      elements.selectAllIndividual.checked = selectedIndividualCount === individualChats.length;
      elements.selectAllIndividual.indeterminate = selectedIndividualCount > 0 && selectedIndividualCount < individualChats.length;
    }

    // Update group select all checkbox
    const groupChats = contacts.filter(c => c.type === 'GROUP');
    const selectedGroupCount = groupChats.filter(chat =>
      selectedContacts.has(chat.displayName || chat.contact)
    ).length;

    if (groupChats.length > 0) {
      elements.selectAllGroup.checked = selectedGroupCount === groupChats.length;
      elements.selectAllGroup.indeterminate = selectedGroupCount > 0 && selectedGroupCount < groupChats.length;
    }
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

    // Update arrow rotation
    if (section === 'individual') {
      if (expandedSections[section]) {
        elements.individualToggleIcon.style.transform = 'rotate(90deg)';
      } else {
        elements.individualToggleIcon.style.transform = 'rotate(0deg)';
      }
    } else if (section === 'group') {
      if (expandedSections[section]) {
        elements.groupToggleIcon.style.transform = 'rotate(90deg)';
      } else {
        elements.groupToggleIcon.style.transform = 'rotate(0deg)';
      }
    }

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

    elements.status.innerHTML = 'Exporting<span id="animatedDots">...</span>';
    const dotsElement = document.getElementById('animatedDots');

    let dots = 1;
    exportAnimationInterval = setInterval(() => {
      dots = (dots % 3) + 1;
      dotsElement.textContent = '.'.repeat(dots);
    }, 500);

    elements.status.className = 'text-center font-semibold text-sky-500';

    try {
      // Get all selected contacts first
      const selectedContactsList = Array.from(selectedContacts).map(contact => {
        const contactData = contacts.find(c => (c.displayName || c.contact) === contact);
        if (contactData && contactData.type === 'GROUP') {
          return contactData.participants.split(',').map(p => p.trim());
        }
        return contact;
      });

      const allSelectedContacts = selectedContactsList;

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
      if (result.hasMessages === false) {
        // Show warning - entire message is clickable
        elements.status.innerHTML = `<span class="cursor-pointer hover:text-amber-700 underline" id="show-empty-warning">⚠️ No messages found in the specified date range - click for details</span>`;
        elements.status.className = 'text-center font-semibold text-amber-600';

        // Add click handler for the entire warning message
        const warningLink = document.getElementById('show-empty-warning');
        if (warningLink) {
          warningLink.addEventListener('click', () => {
            elements.emptyExportModal.classList.remove('hidden');
          });
        }
      } else {
        elements.status.textContent = `✅ Export completed successfully! Output folder: ${result.zipPath}`;
        elements.status.className = 'text-center font-semibold text-green-500';
      }
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
    // Check contacts first - takes precedence
    if (selectedContacts.size === 0) {
      elements.status.textContent = 'Select at least one contact to export';
      elements.status.className = 'text-center font-semibold text-red-500';
      return false;
    }

    let isValid = true;

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

    if (!startDate) {
      elements.status.textContent = 'Start date is required';
      elements.status.className = 'text-center font-semibold text-red-500';
      isValid = false;
    } else if (!isValidDate(startDate)) {
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

  async function fullExport() {
    const inputFolder = elements.inputFolder.value;
    const outputFolder = elements.outputFolder.value;
    const startDate = elements.startDate.value;
    const endDate = elements.endDate.value;

    if (!inputFolder || !outputFolder || !startDate) {
      closeSettingsModal();
      if (!inputFolder) elements.inputFolderError.classList.remove('hidden');
      if (!outputFolder) elements.outputFolderError.classList.remove('hidden');
      if (!startDate) {
        elements.status.textContent = 'Start date is required';
        elements.status.className = 'text-center font-semibold text-red-500';
      }
      return;
    }

    if (!isValidDate(startDate)) {
      closeSettingsModal();
      elements.status.textContent = 'Invalid start date';
      elements.status.className = 'text-center font-semibold text-red-500';
      return;
    }

    if (endDate && !isValidDate(endDate)) {
      closeSettingsModal();
      elements.status.textContent = 'Invalid end date';
      elements.status.className = 'text-center font-semibold text-red-500';
      return;
    }

    if (endDate && new Date(startDate) > new Date(endDate)) {
      closeSettingsModal();
      elements.status.textContent = 'Start date cannot be after end date';
      elements.status.className = 'text-center font-semibold text-red-500';
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
    elements.selectContacts.classList.add('opacity-50', 'cursor-not-allowed');

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
      elements.selectContacts.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  }

  async function filteredExport() {
    const inputFolder = elements.inputFolder.value;
    const outputFolder = elements.outputFolder.value;
    const startDate = elements.startDate.value;
    const endDate = elements.endDate.value;

    if (!inputFolder || !outputFolder || !startDate) {
      closeSettingsModal();
      if (!inputFolder) elements.inputFolderError.classList.remove('hidden');
      if (!outputFolder) elements.outputFolderError.classList.remove('hidden');
      if (!startDate) {
        elements.status.textContent = 'Start date is required';
        elements.status.className = 'text-center font-semibold text-red-500';
      }
      return;
    }

    if (!isValidDate(startDate)) {
      closeSettingsModal();
      elements.status.textContent = 'Invalid start date';
      elements.status.className = 'text-center font-semibold text-red-500';
      return;
    }

    if (endDate && !isValidDate(endDate)) {
      closeSettingsModal();
      elements.status.textContent = 'Invalid end date';
      elements.status.className = 'text-center font-semibold text-red-500';
      return;
    }

    if (endDate && new Date(startDate) > new Date(endDate)) {
      closeSettingsModal();
      elements.status.textContent = 'Start date cannot be after end date';
      elements.status.className = 'text-center font-semibold text-red-500';
      return;
    }

    if (selectedContacts.size === 0) {
      closeSettingsModal();
      elements.status.textContent = 'Select at least one contact for slow export';
      elements.status.className = 'text-center font-semibold text-red-500';
      return;
    }

    closeSettingsModal();

    // Get all selected contacts first
    const selectedContactsList = Array.from(selectedContacts).map(contact => {
      const contactData = contacts.find(c => (c.displayName || c.contact) === contact);
      if (contactData && contactData.type === 'GROUP') {
        return contactData.participants.split(',').map(p => p.trim());
      }
      return contact;
    });

    const allSelectedContacts = selectedContactsList;

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
    elements.selectContacts.classList.add('opacity-50', 'cursor-not-allowed');

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
      elements.selectContacts.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  }

  function updateDateRangeDisplay() {
    const startDate = elements.startDate.value;
    const endDate = elements.endDate.value;

    if (!startDate) {
      elements.dateRangeDisplay.textContent = 'Select a start date';
    } else if (!endDate) {
      elements.dateRangeDisplay.textContent = `Exporting messages from ${formatDateForDisplay(startDate)} onwards`;
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

    const totalIndividual = selectedIndividualCount;
    const totalGroup = selectedGroupCount;

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
    if (!startDate) {
      dateText = 'Select a start date';
    } else if (!endDate) {
      dateText = `Exporting messages from ${formatDateForDisplay(startDate)} onwards`;
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

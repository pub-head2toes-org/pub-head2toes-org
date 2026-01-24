document.addEventListener('DOMContentLoaded', function() {
  // Initialize UI
  initUI();

  // Set up event listeners
  setupEventListeners();

  // Load initial data
  loadInitialData();
});

function initUI() {
  // Initialize the message list
  const messageList = document.getElementById('current-message-list');
  messageList.innerHTML = '';

  // Initialize the message display
  const messageDisplay = document.getElementById('message-display');
  messageDisplay.innerHTML = '';

  // Initialize parameter lists
  const modelList = document.getElementById('model-list');
  const endpointList = document.getElementById('endpoint-list');
  const contextList = document.getElementById('context-list');

  // Initialize search
  const globalSearch = document.getElementById('global-search');
  const searchBtn = document.getElementById('search-btn');

  // Initialize modal
  const historyModal = document.getElementById('history-modal');
  const historyList = document.getElementById('history-list');
  const closeHistoryBtn = document.getElementById('close-history-btn');
}

function setupEventListeners() {
  // New session button
  document.getElementById('new-session-btn').addEventListener('click', createNewSession);

  // Duplicate session button
  document.getElementById('dup-session-btn').addEventListener('click', duplicateSession);
  
  // Download session button
  document.getElementById('new-session-dwnl-btn').addEventListener('click', downloadSession);

  // Search button
  document.getElementById('search-btn').addEventListener('click', performGlobalSearch);
  document.getElementById('global-search').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      performGlobalSearch();
    }
  });

  // Parameter edit buttons
  document.getElementById('edit-model-btn').addEventListener('click', toggleEditMode);
  document.getElementById('edit-endpoint-btn').addEventListener('click', toggleEditMode);
  document.getElementById('edit-context-btn').addEventListener('click', toggleEditMode);

  // Save changes for parameters
  document.getElementById('new-model-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      saveParameterChange('model');
    }
  });

  document.getElementById('new-endpoint-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      saveParameterChange('endpoint');
    }
  });

  document.getElementById('new-context-input').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      saveParameterChange('context');
    }
  });

  document.getElementById('fileinput').addEventListener('change', function() {
    var file = this.files[0];
    var reader = new FileReader();

    reader.onload = function(e) {
        var text = reader.result;
	document.getElementById('user-message').value = text;
    }

    reader.readAsText(file);
  }, false);

  document.getElementById('fileinput2').addEventListener('change', function() {
    var file = this.files[0];
    var reader = new FileReader();

    reader.onload = function(e) {
      var text = reader.result;
      storageManager.loadExternalData(text);
      refreshSessions();
      loadInitialData();
    }

    reader.readAsText(file);
  }, false);

  // Add message button
  document.getElementById('add-btn').addEventListener('click', addMessage);

  // Send message button
  document.getElementById('send-btn').addEventListener('click', sendMessage);

  // Clear button
  document.getElementById('clear-btn').addEventListener('click', clearMessages);

  // History modal buttons
  document.getElementById('close-history-btn').addEventListener('click', closeHistoryModal);

  // Show history button (will be added dynamically)
}

function loadInitialData() {
  // Load current session info
  updateSessionInfo();

  // Load parameter history
  loadParameterHistory('model', document.getElementById('model-list'), document.getElementById('current-model'));
  loadParameterHistory('endpoint', document.getElementById('endpoint-list'), document.getElementById('current-endpoint'));
  loadParameterHistory('context', document.getElementById('context-list'), document.getElementById('current-context'));

  // Load messages
  loadMessages();
}

function updateSessionInfo() {
  const session = storageManager.getCurrentSession();
  const currentSessionElement = document.getElementById('current-session');

  if (session.id === 'current') {
    currentSessionElement.textContent = 'Current Session';
  } else {
    currentSessionElement.textContent = `Session ${session.name} (${new Date(session.date).toLocaleString()})`;
  }
}

function downloadSession () {
  storageManager.downloadData();
}

function duplicateSession() {
  const allMessages = storageManager.getCurrentSession().messages;
  createNewSession();
  allMessages.forEach(item => { storageManager.addMessage(item); addMessageToDisplay(item); } );
}

function refreshSessions() {
  updateSessionInfo();
  loadMessages();
  loadParameterHistory('model', document.getElementById('model-list'), document.getElementById('current-model'));
  loadParameterHistory('endpoint', document.getElementById('endpoint-list'), document.getElementById('current-endpoint'));
  loadParameterHistory('context', document.getElementById('context-list'), document.getElementById('current-context'));
}

function createNewSession() {
  const newSessionId = storageManager.createNewSession();
  storageManager.setCurrentSession(newSessionId);
  updateSessionInfo();
  loadMessages();
  loadParameterHistory('model', document.getElementById('model-list'), document.getElementById('current-model'));
  loadParameterHistory('endpoint', document.getElementById('endpoint-list'), document.getElementById('current-endpoint'));
  loadParameterHistory('context', document.getElementById('context-list'), document.getElementById('current-context'));
}

function loadParameterHistory(parameterType, listElement, currentValueElement) {
  const defaults = { model: ["gemma3:4b", "ministral-3:8b"], endpoint: ["http://localhost:11434","http://localhost:8000", "http://192.168.1.84:8000"], context: ["4096", "32000"]}
  const history = storageManager.getParameterHistory(parameterType);
  const currentSession = storageManager.getCurrentSession();

  // Default list
  if (history.length === 0){
    defaults[parameterType].forEach(item => {
      storageManager.addParameterHistory(parameterType, item);
    });
  }

  if (!currentSession.selections){
    currentSession.selections = {}
  }

  // Set current value if available
  let currentValue = defaults[parameterType][0];
  if (currentSession.selections[parameterType] >= currentSession.parameters[parameterType].length){
    currentSession.selections[parameterType] = 0;
  }
  if (currentSession.parameters[parameterType] && currentSession.parameters[parameterType].length > 0 && currentSession.selections[parameterType]) {
    currentValue = currentSession.parameters[parameterType][currentSession.selections[parameterType]].value;
  }

  // Update current value display
  if (currentValueElement) {
    currentValueElement.textContent = currentValue || 'Select...';
  }

  // Clear list element
  listElement.innerHTML = '';
  const list = document.createElement('ul');
  listElement.appendChild(list);


  // For model include refresh from server
  if (parameterType === 'model'){
    const refreshModels = document.createElement('li');
    refreshModels.textContent = 'Refresh...';
    refreshModels.style.color = 'var(--accent-color)';
    refreshModels.addEventListener('click', () => {
      const endpoint = document.getElementById('current-endpoint').innerHTML;
      if (endpoint){
        ollamaAPI.availableModels(endpoint).then(values => {
          storageManager.refreshParameterHistory('model', values);
          loadParameterHistory(parameterType, listElement, currentValueElement);
	})
        .catch(err => {
          storageManager.refreshParameterHistory('model',defaults['model']);
          loadParameterHistory(parameterType, listElement, currentValueElement);
	});
      }
    });
    list.append(refreshModels);
  }
 
/*
  // Create searchable list
  listElement.innerHTML = '';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = `Search ${parameterType}...`;
  listElement.appendChild(searchInput);

  const list = document.createElement('ul');
  listElement.appendChild(list);

  // Filter and display history items
  const filteredHistory = history.filter(item =>
    item.value.toLowerCase().includes(searchInput.value.toLowerCase())
  );
*/
  const filteredHistory = history;
  filteredHistory.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item.value;
    li.addEventListener('click', () => {
      updateParameter(parameterType, item.value);
      searchInput.value = '';
      list.innerHTML = '';
      loadParameterHistory(parameterType, listElement, currentValueElement);
    });
    list.appendChild(li);
  });

  // Add input field for new values
  const addNewItem = document.createElement('li');
  addNewItem.textContent = 'Add new...';
  addNewItem.style.color = 'var(--accent-color)';
  addNewItem.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = `Enter new ${parameterType}...`;
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const newValue = input.value.trim();
        if (newValue) {
          updateParameter(parameterType, newValue);
          searchInput.value = '';
          list.innerHTML = '';
          loadParameterHistory(parameterType, listElement, currentValueElement);
        }
      }
    });
    list.appendChild(input);
    input.focus();
  });
  list.appendChild(addNewItem);
}

function updateParameter(parameterType, value) {
  const session = storageManager.getCurrentSession();
  storageManager.addParameterHistory(parameterType, value);

  // Update current value display
  const currentValueElement = document.getElementById(`current-${parameterType}`);
  if (currentValueElement) {
    currentValueElement.textContent = value;
  }

  // Update the parameter in the current session
  if (!session.parameters[parameterType]) {
    session.parameters[parameterType] = [];
  }

  // Check if value already exists
  const existingIndex = session.parameters[parameterType].findIndex(item => item.value === value);
  if (existingIndex === -1) {
    session.selections[parameterType] = 0;
    session.parameters[parameterType].push({
      value: value,
      timestamp: new Date().toISOString()
    });
  } else {
    session.selections[parameterType] = existingIndex;
  }

  storageManager.saveData();
}

function toggleEditMode() {
  const btn = event.target;
  const input = document.getElementById(`new-${btn.id.replace('edit-', '')}-input`);
  const currentValue = document.getElementById(`current-${btn.id.replace('edit-', '')}`).textContent;

  if (input.classList.contains('hidden')) {
    // Show input
    input.value = currentValue;
    input.classList.remove('hidden');
    input.focus();
    btn.textContent = 'Save';
  } else {
    // Hide input and save
    const newValue = input.value.trim();
    if (newValue) {
      updateParameter(btn.id.replace('edit-', ''), newValue);
    }
    input.classList.add('hidden');
    btn.textContent = 'Edit';
  }
}

function saveParameterChange(parameterType) {
  const input = document.getElementById(`new-${parameterType}-input`);
  const newValue = input.value.trim();

  if (newValue) {
    updateParameter(parameterType, newValue);
  }

  input.classList.add('hidden');
  document.getElementById(`edit-${parameterType}-btn`).textContent = 'Edit';
}

function loadMessages() {
  const session = storageManager.getCurrentSession();
  const messageList = document.getElementById('current-message-list');
  const messageDisplay = document.getElementById('message-display');

  // Clear existing content
  messageList.innerHTML = '';
  messageDisplay.innerHTML = '';

  // Session history
  const sessionHistory = storageManager.getSessionHistory();
  sessionHistory.forEach((item, index) => {
    const li = document.createElement('div');
    li.className = 'message-item';
    li.textContent = `${item.id.substring(0, 50)}...`;
    li.dataset.index = index;
    li.addEventListener('click', () => switchSession(item.id));
    messageList.appendChild(li);
  });

  // Display messages in chat area
  session.messages.forEach(message => {
   addMessageToDisplay(message);
  });

  // Scroll to bottom
  messageDisplay.scrollTop = messageDisplay.scrollHeight;
}

function switchSession(sessionId) {
  storageManager.setCurrentSession(sessionId);
  loadInitialData();
}

function previewMessage(message) {
  const previewArea = document.createElement('div');
  const previewAreaConent = document.createElement('textarea');
  previewAreaConent.rows = 20;
  previewAreaConent.cols = 60;
  previewAreaConent.style = "padding:1px;"

  previewArea.className = 'message-preview';
  previewAreaConent.value = message.content;
  previewArea.style.position = 'fixed';
  previewArea.style.top = '50%';
  previewArea.style.left = '50%';
  previewArea.style.transform = 'translate(-50%, -50%)';
  previewArea.style.background = 'white';
  previewArea.style.padding = '20px';
  previewArea.style.borderRadius = '8px';
  previewArea.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)';
  previewArea.style.maxWidth = '80%';
  previewArea.style.maxHeight = '80%';
  previewArea.style.overflow = 'auto';
  previewArea.style.zIndex = '1000';

  previewArea.appendChild(previewAreaConent);
  document.body.appendChild(previewArea);

  // Add close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.style.position = 'absolute';
  closeBtn.style.top = '10px';
  closeBtn.style.right = '10px';
  closeBtn.style.background = 'var(--primary-color)';
  closeBtn.style.color = 'white';
  closeBtn.style.border = 'none';
  closeBtn.style.padding = '5px 10px';
  closeBtn.style.borderRadius = '4px';
  closeBtn.addEventListener('click', () => {
    document.body.removeChild(previewArea);
  });

  previewArea.appendChild(closeBtn);

  // Add delete button
  const delBtn = document.createElement('button');
  delBtn.textContent = 'Delete';
  delBtn.style.position = 'absolute';
  delBtn.style.top = '75px';
  delBtn.style.right = '10px';
  delBtn.style.background = 'var(--primary-color)';
  delBtn.style.color = 'white';
  delBtn.style.border = 'none';
  delBtn.style.padding = '5px 10px';
  delBtn.style.borderRadius = '4px';
  delBtn.addEventListener('click', () => {
    document.body.removeChild(previewArea);
    deleteMessage(message);
  });

  previewArea.appendChild(delBtn);

}

function deleteMessage(message) {

  const session = storageManager.getCurrentSession();
  session.messages = session.messages.filter(item => item !== message );
  storageManager.saveData();
  loadMessages();
}

function addMessage() {
  const userMessage = document.getElementById('user-message').value.trim();
  if (!userMessage) return;

  // Add user message to display
  addMessageToDisplay({ role: 'user', content: userMessage });

  // Add user message to storage
  const session = storageManager.getCurrentSession();
  session.messages.push({ role: 'user', content: userMessage });
  storageManager.saveData();

  // Clear input
  document.getElementById('user-message').value = '';
}

function sendMessage() {
  const userMessage = document.getElementById('user-message').value.trim();
  if (!userMessage) return;

  const session = storageManager.getCurrentSession();
  const model = document.getElementById('current-model').textContent;
  const endpoint = document.getElementById('current-endpoint').textContent;
  const context = document.getElementById('current-context').textContent;

  // Add user message to display
  addMessageToDisplay({ role: 'user', content: userMessage });

  // Add user message to storage
  session.messages.push({ role: 'user', content: userMessage });
  storageManager.saveData();

  // Clear input
  document.getElementById('user-message').value = '';

  // Prepare messages array for API call
  const messages = session.messages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));

  // Call Ollama API
  ollamaAPI.sendMessage(model, endpoint, parseInt(context), messages)
    .then(res => {
      // Add assistant response to display
      addMessageToDisplay({ role: 'assistant', content: res.content, time: res.time});

      // Add assistant response to storage
      session.messages.push({ role: 'assistant', content: res.content, time: res.time });
      storageManager.saveData();

      // Scroll to bottom
      const messageDisplay = document.getElementById('message-display');
      messageDisplay.scrollTop = messageDisplay.scrollHeight;
    })
    .catch(error => {
      console.error('Error:', error);
      addMessageToDisplay({
        role: 'assistant',
        content: `Error: ${error.message}`
      });
    });
}

function addMessageToDisplay(message) {
    const messageDisplay = document.getElementById('message-display');
    const messageDiv = document.createElement('div');
    const messageClassName = `message ${message.role === 'user' ? 'user-message' : 'assistant-message'}`;
    messageDiv.className = messageClassName;
    const textAreaConent = document.createElement('pre');
    textAreaConent.className = messageClassName;
    textAreaConent.textContent = `${message.content.substring(0, 50)}...`;
    if (message.time) {
      textAreaConent.textContent = `[t:${message.time}]${message.content.substring(0, 50)}...`;
    }
    messageDiv.appendChild(textAreaConent);
    messageDiv.addEventListener('click', () => {
      previewMessage(message);
    });
    messageDisplay.appendChild(messageDiv);
    messageDisplay.scrollTop = messageDisplay.scrollHeight;
}

function performGlobalSearch() {
  const query = document.getElementById('global-search').value.trim();
  if (!query) return;

  const results = storageManager.searchMessages(query);

  if (results.length === 0) {
    alert('No messages found matching your search.');
    return;
  }

  // Display results in a modal or new section
  const modal = document.createElement('div');
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
  modal.style.display = 'flex';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.zIndex = '1000';

  const content = document.createElement('div');
  content.style.backgroundColor = 'white';
  content.style.padding = '20px';
  content.style.borderRadius = '8px';
  content.style.maxWidth = '80%';
  content.style.maxHeight = '80%';
  content.style.overflow = 'auto';

  const title = document.createElement('h3');
  title.textContent = `Search Results (${results.length} matches)`;
  content.appendChild(title);

  const list = document.createElement('ul');
  list.style.listStyle = 'none';
  list.style.padding = '0';

  results.forEach((result, index) => {
    const item = document.createElement('li');
    item.style.padding = '10px';
    item.style.borderBottom = '1px solid #eee';
    item.style.cursor = 'pointer';

    const session = storageManager.getSessionById(result.sessionId);
    const date = new Date(result.timestamp).toLocaleString();

    item.innerHTML = `
      <strong>${result.role}:</strong> ${result.content.substring(0, 50)}...<br>
      <small>Session: ${session ? session.name : 'Unknown'}, ${date}</small>
    `;

    item.addEventListener('click', () => {
      // Load the session with this message
      if (session) {
        storageManager.setCurrentSession(session.id);
        updateSessionInfo();
        loadMessages();
      }
      document.body.removeChild(modal);
    });

    list.appendChild(item);
  });

  content.appendChild(list);
  modal.appendChild(content);
  document.body.appendChild(modal);
}

function clearMessages() {
  const session = storageManager.getCurrentSession();
  session.messages = [];
  storageManager.saveData();
  loadMessages();
}

function showParameterHistory(parameterType) {
  const session = storageManager.getCurrentSession();
  const history = session.parameters[parameterType] || [];
  const historyList = document.getElementById('history-list');
  historyList.innerHTML = '';

  if (history.length === 0) {
    historyList.innerHTML = '<p>No history for this parameter.</p>';
    return;
  }

  // Create history items
  history.forEach((item, index) => {
    const date = new Date(item.timestamp).toLocaleString();
    const changeItem = document.createElement('div');
    changeItem.className = 'history-item';
    changeItem.innerHTML = `
      <div class="history-date">${date}</div>
      <div class="change-item" data-index="${index}">
        <strong>Value:</strong> ${item.value}
      </div>
    `;

    // Add expand/collapse functionality
    changeItem.querySelector('.change-item').addEventListener('click', function() {
      this.classList.toggle('expanded');
    });

    historyList.appendChild(changeItem);
  });

  // Show modal
  document.getElementById('history-modal').style.display = 'flex';
}

function closeHistoryModal() {
  document.getElementById('history-modal').style.display = 'none';
  document.getElementById('history-list').innerHTML = '';
}

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js')
      .then(registration => {
        console.log('ServiceWorker registration successful');
      })
      .catch(err => {
        console.log('ServiceWorker registration failed: ', err);
      });
  });
}

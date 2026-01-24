class StorageManager {
  constructor() {
    this.storageKey = 'eveAppData';
    this.currentSessionId = null;
    this.allSessions = {};
    this.loadData();
  }

  downloadData() {
    const key = this.storageKey;
    const timestamp = Date.now();
    const fileName = `${key}-${timestamp}.data`;

    const data = localStorage.getItem(key);
    if (data) {

    const uriContent = "data:application/octet-stream," + encodeURIComponent(data);
    //const blob = new Blob([JSON.stringify(data)], { type: 'text/plain' });
    //const url = URL.createObjectURL(blob);

    // Trigger the download
    const a = document.createElement('a');
    //a.href = url;
    a.href = uriContent;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();

    // Clean up the URL
    //URL.revokeObjectURL(url);
    document.body.removeChild(a);
    }
}


  loadData() {
    const savedData = localStorage.getItem(this.storageKey);
    if (savedData) {
      this.allSessions = JSON.parse(savedData);
      this.currentSessionId = Object.keys(this.allSessions).find(key => key === 'current') || null;
    } else {
      this.allSessions = {
        current: {
          id: 'current',
          name: 'Current Session',
          date: new Date().toISOString(),
          parameters: {
            model: [],
            endpoint: [],
            context: []
          },
          messages: [],
          selections: {}
        }
      };
      this.currentSessionId = 'current';
    }
    this.saveData();
  }

  loadExternalData(data) {
    localStorage.setItem(this.storageKey, data);
    this.loadData();
  }

  saveData() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.allSessions));
  }

  createNewSession() {
    const newSessionId = new Date().toISOString().replace(/[:.]/g, '-');
    const newSession = {
      id: newSessionId,
      name: `Session ${newSessionId}`,
      date: new Date().toISOString(),
      parameters: {
        model: [],
        endpoint: [],
        context: []
      },
      messages: [],
      selections: {}
    };

    this.allSessions[newSessionId] = newSession;
    this.currentSessionId = newSessionId;
    this.saveData();
    return newSessionId;
  }

  getCurrentSession() {
    return this.allSessions[this.currentSessionId] || this.allSessions.current;
  }

  setCurrentSession(sessionId) {
    this.currentSessionId = sessionId;
    this.saveData();
  }

  refreshParameterHistory(parameterType, values) {
    const session = this.getCurrentSession();
    session.parameters[parameterType] = [];

    values.forEach(value => {
      session.parameters[parameterType].push({
        value: value,
        timestamp: new Date().toISOString()
      });
    });

    this.saveData();
  }

  addParameterHistory(parameterType, value) {
    const session = this.getCurrentSession();
    if (!session.parameters[parameterType]) {
      session.parameters[parameterType] = [];
    }

    // Check if value already exists
    const existingIndex = session.parameters[parameterType].findIndex(item => item.value === value);
    if (existingIndex === -1) {
      session.parameters[parameterType].push({
        value: value,
        timestamp: new Date().toISOString()
      });
    }

    this.saveData();
  }

  getParameterHistory(parameterType) {
    const session = this.getCurrentSession();
    return session.parameters[parameterType] || [];
  }

  addMessage(message) {
    const session = this.getCurrentSession();
    session.messages.push(message);
    this.saveData();
  }

  getAllMessages() {
    const allMessages = [];
    for (const sessionId in this.allSessions) {
      const messages = this.allSessions[sessionId].messages;
      for (const index in messages) {
        const message = messages[index];
        allMessages[index] = {role: message.role, content: message.content, sessionId: sessionId};
      }
    }
    return allMessages;
  }

  old_getAllMessages() {
    const allMessages = [];
    for (const sessionId in this.allSessions) {
      if (sessionId !== 'current') {
        allMessages.push(...this.allSessions[sessionId].messages);
      }
    }
    return allMessages;
  }

  getSessionHistory() {
    const sessions = [];
    for (const sessionId in this.allSessions) {
      if (sessionId !== 'current') {
        sessions.push({
          id: sessionId,
          name: this.allSessions[sessionId].name,
          date: this.allSessions[sessionId].date
        });
      }
    }
    return sessions.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  getParameterChangeHistory(parameterType) {
    const session = this.getCurrentSession();
    return session.parameters[parameterType] || [];
  }

  searchMessages(query) {
    const allMessages = this.getAllMessages();
    const queryLower = query.toLowerCase();
    return allMessages.filter(message =>
      message.content.toLowerCase().includes(queryLower) ||
      message.role.toLowerCase().includes(queryLower)
    );
  }

  getSessionById(sessionId) {
    return this.allSessions[sessionId] || null;
  }
}

const storageManager = new StorageManager();
window.storageManager = storageManager;

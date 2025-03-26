import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import styles from './styles/popup.module.css';

function Popup() {
  const [apiKey, setApiKey] = useState('');
  const [isEnabled, setIsEnabled] = useState(false);
  const [autoHighlight, setAutoHighlight] = useState(true);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  useEffect(() => {
    chrome.storage.sync.get(['geminiApiKey', 'highlightingEnabled', 'autoHighlight'], (result) => {
      if (result.geminiApiKey) {
        setApiKey(result.geminiApiKey);
      }
      setIsEnabled(result.highlightingEnabled === true);
      setAutoHighlight(result.autoHighlight !== false);
    });

    const messageListener = (message: any) => {
      if (message.type === 'HIGHLIGHTING_STOPPED') {
        setIsEnabled(false);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    return () => chrome.runtime.onMessage.removeListener(messageListener);
  }, []);

  const handleSave = () => {
    chrome.storage.sync.set({ 
      geminiApiKey: apiKey,
      highlightingEnabled: true,
      autoHighlight
    }, async () => {
      try {

        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (tab.id) {
            try {
              await chrome.tabs.sendMessage(tab.id, { 
                type: 'API_KEY_UPDATED',
                apiKey: apiKey,
                enableHighlighting: true,
                autoHighlight
              });
            } catch (error) {
              console.log('Could not send message to tab:', tab.id);
            }
          }
        }
        
        setIsEnabled(true);
        setMessage('API key saved successfully!');
        setMessageType('success');
        setTimeout(() => setMessage(''), 3000);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('API key not valid')) {
          setMessage('API key is not valid. Please check and try again.');
        } else {
          setMessage('Error saving API key. Please try again.');
        }
        setMessageType('error');
      }
    });
  };

  const handleClear = () => {
    setApiKey('');
    chrome.storage.sync.remove(['geminiApiKey', 'highlightingEnabled'], async () => {
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { 
            type: 'API_KEY_UPDATED',
            apiKey: null,
            enableHighlighting: false
          }).catch(() => {
            console.log('Could not send message to tab:', tab.id);
          });
        }
      }
      
      setIsEnabled(false);
      setMessage('API key cleared');
      setTimeout(() => setMessage(''), 3000);
    });
  };

  const handleInputFocus = () => {
    setIsEnabled(false);
    chrome.storage.sync.set({ highlightingEnabled: false });
    
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'STOP_HIGHLIGHTING' });
      }
    });
  };

  const toggleHighlighting = async () => {
    const newState = !isEnabled;
    setIsEnabled(newState);
    
    await chrome.storage.sync.set({ highlightingEnabled: newState });
    
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { 
        type: newState ? 'START_HIGHLIGHTING' : 'STOP_HIGHLIGHTING',
        autoHighlight
      });
    }
  };

  const toggleAutoHighlight = async () => {
    const newState = !autoHighlight;
    setAutoHighlight(newState);
    
    await chrome.storage.sync.set({ autoHighlight: newState });
    
    if (isEnabled) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          type: 'UPDATE_AUTO_HIGHLIGHT',
          autoHighlight: newState
        });
      }
    }
  };

  return (
    <div className={styles.popupContainer}>
      <h1 className={styles.popupTitle}>Word Highlighter</h1>
      
      <div className={styles.popupContent}>
        <div className={styles.apiKeySection}>
          <label htmlFor="apiKey">Gemini API Key:</label>
          <div className={styles.apiKeyInputContainer}>
            <input
              type="password"
              id="apiKey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className={styles.apiKeyInput}
              placeholder="Enter your API key"
              onFocus={handleInputFocus}
            />
            {apiKey && (
              <button 
                onClick={handleClear}
                className={styles.clearButton}
                title="Clear API key"
              >
                ×
              </button>
            )}
          </div>
          <button 
            onClick={handleSave} 
            className={styles.saveButton}
            disabled={!apiKey.trim()}
          >
            Save API Key
          </button>
          {message && (
            <p className={`${styles.popupStatus} ${styles[messageType]}`}>
              {message}
            </p>
          )}
        </div>

        <div className={styles.toggleSection}>
          <label className={styles.toggleLabel}>
            Highlighting:
            <div className={styles.toggleSwitch}>
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={toggleHighlighting}
                className={styles.toggleInput}
              />
              <span className={styles.toggleSlider}></span>
            </div>
          </label>

          <label className={styles.toggleLabel}>
            Auto-highlight words:
            <div className={styles.toggleSwitch}>
              <input
                type="checkbox"
                checked={autoHighlight}
                onChange={toggleAutoHighlight}
                className={styles.toggleInput}
                disabled={!isEnabled}
              />
              <span className={styles.toggleSlider}></span>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}

// Initialize React
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Popup />);
}

export default Popup; 
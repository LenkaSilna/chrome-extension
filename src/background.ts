chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'analyze-text',
      title: 'Analyzovat vybraný text',
      contexts: ['selection']
    });
  });
});


chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_API_KEY') {
    chrome.storage.sync.get(['geminiApiKey'], (result) => {
      sendResponse({ apiKey: result.geminiApiKey });
    });
    return true;
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'analyze-text' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'ANALYZE_SELECTED_TEXT',
      text: info.selectionText
    });
  }
}); 
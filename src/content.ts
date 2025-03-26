import { GoogleGenerativeAI } from '@google/generative-ai';
import './styles/content.css';

let genAI: any = null;
let isProcessing = false;
let autoHighlightEnabled = true;

const analysisCache = new Map<string, string>();
let processedPaths = new WeakMap<Node, boolean>();

const HIGHLIGHT_CLASS = 'highlightable-word';
const PROCESSED_CLASS = 'word-highlighter-processed';
const TOOLTIP_ID = 'word-highlighter-tooltip';
const BUTTON_ID = 'word-highlighter-toggle';
const TOOLTIP_DELAY = 300;
const SELECTION_DELAY = 500;
const MUTATION_DELAY = 500;
const RATE_LIMIT_REQUESTS = 30;
const RATE_LIMIT_RESET = 60000;
const CACHE_MAX_SIZE = 100;

interface ErrorInfo {
  message: string;
  status?: string;
  code?: number;
  isApiKeyInvalid: boolean;
}

const isCzechText = (text: string): boolean => /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/.test(text);

const getLocalizedMessage = (czMessage: string, enMessage: string, text?: string): string => {
  return (text && isCzechText(text)) || (document.documentElement.lang === 'cs') ? czMessage : enMessage;
};

const tooltip = createTooltip();

function createTooltip() {
  const existingTooltip = document.getElementById(TOOLTIP_ID);
  if (existingTooltip) {
    return existingTooltip;
  }
  
  const tooltip = document.createElement('div');
  tooltip.id = TOOLTIP_ID;
  document.body.appendChild(tooltip);
  return tooltip;
}

const commonWords = new Set([
  'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from', 'of', 'about',
  'and', 'or', 'but', 'nor', 'yet', 'so', 'because', 'although', 'unless',
  
  'a', 'aby', 'ale', 'ani', 'ano', 'asi', 'až', 'bez', 'bude', 'budem',
  'by', 'byl', 'byla', 'byli', 'bylo', 'být',
  'co', 'či', 'článek', 'další', 'dnes', 'do', 'ho',
  'i', 'já', 'jak', 'jako', 'je', 'jeho', 'jej', 'její', 'jejich',
  'jen', 'ještě', 'již', 'jsem', 'jsi', 'jsme', 'jsou', 'jí',
  'k', 'kam', 'kde', 'kdo', 'kdy', 'když',
  'ke', 'která', 'které', 'který', 'kteří',
  'má', 'máte', 'mezi', 'mi', 'mít', 'mě', 'může',
  'na', 'nad', 'nam', 'napište', 'náš', 'ne', 'nebo', 'není',
  'nové', 'nový', 'než',
  'o', 'od', 'pak', 'po', 'pod', 'podle', 'pokud', 'pouze',
  'pro', 'proto', 'před', 'přes', 'při',
  'rok', 'roce', 'roku',
  's', 'se', 'si', 'sice', 'své', 'svých', 'svým', 'svými',
  'ta', 'tak', 'také', 'takže', 'tato', 'tedy', 'ten', 'tento', 'této', 'tím', 'to', 'tohle', 'toho', 'též', 'tu', 'tuto', 'ty',
  'u', 'už', 'v', 've', 'více',
  'však', 'všech', 'všechny', 'všichni',
  'z', 'za', 'zde', 'ze', 'že'
]);

function extractApiErrorInfo(error: any): ErrorInfo {
  let message = '';
  let status = '';
  let code = 0;
  let isApiKeyInvalid = false;
  
  if (typeof error === 'string') {
    message = error;
  } 
  else if (error?.error) {
    if (typeof error.error === 'string') {
      message = error.error;
    } else {
      message = error.error.message || '';
      status = error.error.status || '';
      code = error.error.code || 0;
      
      if (error.error.details && Array.isArray(error.error.details)) {
        for (const detail of error.error.details) {
          if (detail.reason === 'API_KEY_INVALID') {
            isApiKeyInvalid = true;
          }
          if (detail['@type']?.includes('LocalizedMessage') && detail.message) {
            message = detail.message;
          }
        }
      }
    }
  } 
  else if (error?.message) {
    message = error.message;
  }
  else if (error?.name && error?.description) {
    message = `${error.name}: ${error.description}`;
  }
  else {
    message = String(error);
  }
  
  isApiKeyInvalid = isApiKeyInvalid || 
    message.includes('API key not valid') || 
    message.includes('API_KEY_INVALID') ||
    status === 'INVALID_ARGUMENT' ||
    code === 400;
  
  return { message, status, code, isApiKeyInvalid };
}

function handleApiError(error: any, text: string, displayInTooltip = false): string {
  console.error('API Error:', error);
  
  const isCzech = isCzechText(text);
  const { isApiKeyInvalid } = extractApiErrorInfo(error);
  
  let errorMessage: string;
  
  if (isApiKeyInvalid) {
    errorMessage = 'API key not valid. Please pass a valid API key.';
  } 
  else if ((error as Error)?.message?.includes('429') || 
           (error as Error)?.message?.includes('quota') || 
           (error as Error)?.message?.includes('Rate limit')) {
    errorMessage = isCzech 
      ? 'Příliš mnoho požadavků. Prosím počkejte minutu před dalším pokusem.'
      : 'Too many requests. Please wait a minute before trying again.';
  }
  else if ((error as Error)?.message?.includes('404')) {
    errorMessage = isCzech
      ? 'API model není dostupný. Zkuste to prosím později.'
      : 'API model not available. Please try again later.';
  }
  else {
    errorMessage = isCzech
      ? 'Chyba při analýze. Zkuste to prosím později.'
      : 'Error analyzing text. Please try again later.';
  }
  
  if (displayInTooltip) {
    showTooltip(errorMessage, true);
  }
  
  return errorMessage;
}

function shouldHighlightWord(word: string): boolean {
  const cleanWord = word.toLowerCase().replace(/[^a-záčďéěíňóřšťúůýž]/gi, '');
  
  if (cleanWord.length <= 3 || 
      commonWords.has(cleanWord) || 
      /\d/.test(word) ||
      /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/.test(word)) {
    return false;
  }

  const isCzech = isCzechText(word);

  if (isCzech) {
    return (
      /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][a-záčďéěíňóřšťúůýž]+$/.test(word) ||
      word.length > 10 ||
      /-/.test(word)
    );
  } else {
    return (
      /^[A-Z][a-z]+$/.test(word) ||
      /^[A-Z]{2,}$/.test(word) ||
      (word.length > 8 && /^[a-z]+$/.test(word))
    );
  }
}

function shouldProcessNode(node: Node): boolean {
  if (processedPaths.has(node)) return false;
  
  const parentElement = node.parentElement;
  if (!parentElement) return false;
  
  const tag = parentElement.tagName.toLowerCase();
  if (tag === 'script' || tag === 'style' || tag === 'noscript' || 
      tag === 'iframe' || tag === 'svg' || tag === 'code') return false;
  
  if (parentElement.id === BUTTON_ID || 
      parentElement.id === TOOLTIP_ID ||
      parentElement.classList.contains(PROCESSED_CLASS)) return false;
  
  if (!node.textContent?.trim()) return false;
  
  return true;
}

function highlightText(rootNode: Node = document.body) {
  if (isProcessing) {
    return;
  }
  
  isProcessing = true;
  let highlightCount = 0;
  
  try {
    const walker = document.createTreeWalker(
      rootNode,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const should = shouldProcessNode(node);
          return should ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const batch: { node: Text; span: HTMLSpanElement }[] = [];
    let node: Text | null;
    
    while (node = walker.nextNode() as Text) {
      const text = node.textContent || '';
      const words = text.split(/\s+/).filter(w => w.length > 0);
      
      if (words.length > 0) {
        const span = document.createElement('span');
        span.className = PROCESSED_CLASS;
        
        const highlightedText = words.map(word => {
          if (shouldHighlightWord(word)) {
            highlightCount++;
            return `<span class="${HIGHLIGHT_CLASS}">${word}</span>`;
          }
          return word;
        }).join(' ');
        
        if (highlightedText !== text) {
          span.innerHTML = highlightedText;
          batch.push({ node, span });
          processedPaths.set(node, true);
        }
      }
    }

    if (batch.length > 0) {
      requestAnimationFrame(() => {
        batch.forEach(({ node, span }) => {
          if (node.parentNode) {
            node.parentNode.replaceChild(span, node);
          }
        });

        const container = (rootNode.nodeType === Node.ELEMENT_NODE ? rootNode : rootNode.parentElement) as Element;
        if (container) {
          container.addEventListener('mouseover', handleWordHover);
          container.addEventListener('mouseout', handleWordOut);
          container.addEventListener('click', (e: Event) => {
            if (e instanceof MouseEvent) {
              handleWordClick(e);
            }
          });
        }
      });
    }

  } catch (error) {
    console.error('Error during highlighting:', error);
  } finally {
    isProcessing = false;
  }
}

let currentHoverTimeout: number | null = null;

function handleWordHover(e: Event) {
  const target = e.target as HTMLElement;
  if (!target.classList?.contains(HIGHLIGHT_CLASS)) return;

  if (currentHoverTimeout) {
    window.clearTimeout(currentHoverTimeout);
  }

  const mouseEvent = e as MouseEvent;
  tooltip.style.display = 'block';
  tooltip.style.left = `${mouseEvent.pageX + 10}px`;
  tooltip.style.top = `${mouseEvent.pageY + 10}px`;
  tooltip.textContent = 'Analyzing...';

  currentHoverTimeout = window.setTimeout(async () => {
    const text = target.textContent || '';
    const explanation = await analyzeText(text, target.parentElement);
    if (tooltip.style.display === 'block') {
      tooltip.textContent = explanation;
    }
  }, TOOLTIP_DELAY);
}

function handleWordOut() {
  if (currentHoverTimeout) {
    window.clearTimeout(currentHoverTimeout);
    currentHoverTimeout = null;
  }
  tooltip.style.display = 'none';
}

async function handleWordClick(event: MouseEvent) {
  const target = event.target as HTMLElement;
  if (!target.classList.contains(HIGHLIGHT_CLASS)) return;

  const word = target.textContent || '';
  const isCzech = isCzechText(word);
  
  if (!genAI) {
    showTooltip(
      getLocalizedMessage(
        'API klíč není nastaven. Prosím nastavte Gemini API klíč v nastavení rozšíření.',
        'API key not set. Please set your Gemini API key in the extension popup.',
        word
      ),
      true
    );
    return;
  }

  try {
    if (currentHoverTimeout) {
      window.clearTimeout(currentHoverTimeout);
      currentHoverTimeout = null;
    }

    showTooltip(isCzech ? 'Načítám detailní analýzu...' : 'Loading detailed analysis...');
    
    await rateLimiter.checkLimit();
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    const language = isCzech ? 'Czech' : 'English';
    
    const prompt = `
    Analyze the ${language} word or phrase: "${word}"
    
    Provide a detailed explanation including:
    1. Definition or meaning
    2. Usage examples
    3. Any relevant additional information (etymology, related terms, etc.)
    
    Response MUST be in ${language} language.
    Keep the total response under 4 sentences.
    `;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    showTooltip(response.text());
  } catch (error) {
    handleApiError(error, word, true);
  }
}

let selectionTimeout: number | null = null;

function handleSelectionChange() {
  if (selectionTimeout) {
    window.clearTimeout(selectionTimeout);
  }

  selectionTimeout = window.setTimeout(() => {
    chrome.storage.sync.get(['highlightingEnabled'], (result) => {
      if (!result.highlightingEnabled) {
        hideTooltip();
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        hideTooltip();
        return;
      }

      const text = selection.toString().trim();
      if (text.length > 3) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        const tooltip = document.getElementById(TOOLTIP_ID);
        if (tooltip) {
          tooltip.style.left = `${window.scrollX + rect.left}px`;
          tooltip.style.top = `${window.scrollY + rect.bottom + 5}px`;
        }

        analyzeSelectedText(text);
      }
    });
  }, SELECTION_DELAY);
}

const rateLimiter = {
  requests: 0,
  lastReset: Date.now(),
  waitUntil: null as number | null,
  
  async checkLimit() {
    const now = Date.now();
    
    if (this.waitUntil && now < this.waitUntil) {
      const remainingSeconds = Math.ceil((this.waitUntil - now) / 1000);
      throw new Error(`RATE_LIMIT:${remainingSeconds}`);
    }
    
    if (now - this.lastReset > RATE_LIMIT_RESET) {
      this.requests = 0;
      this.lastReset = now;
      this.waitUntil = null;
    }
    
    if (this.requests >= RATE_LIMIT_REQUESTS) {
      this.waitUntil = now + RATE_LIMIT_RESET;
      throw new Error(`RATE_LIMIT:${RATE_LIMIT_RESET / 1000}`);
    }
    
    this.requests++;
  }
};

function showTooltip(text: string, isError: boolean = false) {
  const tooltip = document.getElementById(TOOLTIP_ID);
  if (!tooltip) return;

  tooltip.textContent = text;
  tooltip.className = '';
  if (isError) {
    tooltip.classList.add('error');
  }
  tooltip.style.display = 'block';

  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    tooltip.style.left = `${window.scrollX + rect.left}px`;
    tooltip.style.top = `${window.scrollY + rect.bottom + 5}px`;
  }
}

function hideTooltip() {
  const tooltip = document.getElementById(TOOLTIP_ID);
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

function removeHighlights() {
  const highlights = document.querySelectorAll(`.${PROCESSED_CLASS}`);
  highlights.forEach(highlight => {
    const parent = highlight.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(highlight.textContent || ''), highlight);
    }
  });
  processedPaths = new WeakMap<Node, boolean>();
}

function createStopButton() {
  const existingButton = document.getElementById(BUTTON_ID);
  if (existingButton) return existingButton;

  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.textContent = 'Stop Highlighting';
  
  button.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'HIGHLIGHTING_STOPPED' });
    chrome.storage.sync.set({ highlightingEnabled: false });
    removeHighlights();
    button.remove();
  });

  document.body.appendChild(button);
  return button;
}

function initializeHighlighting() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      requestIdleCallback(() => highlightText());
    });
  } else {
    requestIdleCallback(() => highlightText());
  }

  let mutationTimeout: number | null = null;
  
  const observer = new MutationObserver((mutations) => {
    if (mutationTimeout) {
      window.clearTimeout(mutationTimeout);
    }
    
    mutationTimeout = window.setTimeout(() => {
      const relevantNodes = mutations
        .filter(mutation => {
          const target = mutation.target;
          if (target.nodeType === Node.ELEMENT_NODE) {
            const element = target as Element;
            return !element.classList.contains(PROCESSED_CLASS) &&
                   !element.id.startsWith('word-highlighter');
          }
          return true;
        })
        .flatMap(mutation => Array.from(mutation.addedNodes))
        .filter(node => 
          node.nodeType === Node.ELEMENT_NODE && 
          !(node as Element).classList.contains(PROCESSED_CLASS)
        );

      if (relevantNodes.length > 0) {
        requestIdleCallback(() => {
          relevantNodes.forEach(node => highlightText(node));
        });
      }
    }, MUTATION_DELAY);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function initializeTooltip() {
  const tooltip = document.createElement('div');
  tooltip.id = TOOLTIP_ID;
  document.body.appendChild(tooltip);

  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains(HIGHLIGHT_CLASS) && target.id !== TOOLTIP_ID) {
      hideTooltip();
    }
  });

  document.addEventListener('selectionchange', handleSelectionChange);
}

async function analyzeText(text: string, contextElement: HTMLElement | null): Promise<string> {
  const contextText = contextElement?.textContent || '';
  const cacheKey = `${text}-${contextText.slice(0, 100)}`;
  if (analysisCache.has(cacheKey)) {
    return analysisCache.get(cacheKey)!;
  }

  if (!genAI) {
    return getLocalizedMessage(
      'API klíč není nastaven. Prosím nastavte Gemini API klíč v nastavení rozšíření.',
      'API key not set. Please set your Gemini API key in the extension popup.',
      text
    );
  }

  const isCzech = isCzechText(text);
  const language = isCzech ? 'Czech' : 'English';

  try {
    await rateLimiter.checkLimit();
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    const context = contextText.slice(0, 500);
    
    const prompt = `
    Language: ${language}
    Word or phrase to analyze: "${text}"
    
    Context from the webpage:
    "${context}"
    
    Task: Analyze this word or phrase and explain its meaning or significance in ${language} language.
    Keep the explanation brief (1-2 sentences).
    If it's a proper noun, explain what/who it refers to.
    If it's a technical term, provide a simple definition.
    If it's a common word, explain its usage in this context.
    
    IMPORTANT: Your response MUST be in ${language} language only.
    For Czech words, use proper Czech grammar and diacritics.
    `;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    let explanation = '';
    if (response.text) {
      explanation = response.text();
    } else if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
      explanation = response.candidates[0].content.parts[0].text;
    } else {
      explanation = isCzech ? 'Nelze vygenerovat vysvětlení.' : 'Unable to generate explanation.';
    }
    
    analysisCache.set(cacheKey, explanation);
    
    if (analysisCache.size > CACHE_MAX_SIZE) {
      const firstKey = analysisCache.keys().next().value;
      if (firstKey) {
        analysisCache.delete(firstKey);
      }
    }
    
    return explanation;
  } catch (error: any) {
    return handleApiError(error, text);
  }
}

async function analyzeSelectedText(text: string) {
  const { highlightingEnabled } = await chrome.storage.sync.get(['highlightingEnabled']);
  if (!highlightingEnabled) {
    hideTooltip();
    return;
  }

  const isCzech = isCzechText(text);
  
  if (!genAI) {
    showTooltip(
      getLocalizedMessage(
        'API klíč není nastaven. Prosím nastavte Gemini API klíč v nastavení rozšíření.',
        'API key not set. Please set your Gemini API key in the extension popup.',
        text
      ),
      true
    );
    return;
  }

  try {
    showTooltip(isCzech ? 'Načítám analýzu...' : 'Loading analysis...');
    
    await rateLimiter.checkLimit();
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    const language = isCzech ? 'Czech' : 'English';
    const prompt = `
    Analyze this ${language} text: "${text}"
    
    Provide:
    1. Main topic or meaning
    2. Key points or insights
    3. Any relevant context or explanation
    
    Response MUST be in ${language} language.
    Keep the response concise (max 3-4 sentences).
    `;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    showTooltip(response.text());
  } catch (error) {
    handleApiError(error, text, true);
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'API_KEY_UPDATED') {
    if (message.apiKey) {
      genAI = new GoogleGenerativeAI(message.apiKey);
      
      autoHighlightEnabled = message.autoHighlight;
      removeHighlights();
      
      if (message.enableHighlighting) {
        createStopButton();
        initializeHighlighting();
      }
    } else {
      genAI = null;
      removeHighlights();
      const button = document.getElementById(BUTTON_ID);
      if (button) button.remove();
    }
    sendResponse({ success: true });
    return;
  }
  
  if (message.type === 'START_HIGHLIGHTING') {
    autoHighlightEnabled = message.autoHighlight;
    removeHighlights();
    createStopButton();
    initializeHighlighting();
    sendResponse({ success: true });
  }
  
  if (message.type === 'STOP_HIGHLIGHTING') {
    const button = document.getElementById(BUTTON_ID);
    if (button) button.remove();
    removeHighlights();
    sendResponse({ success: true });
  }

  if (message.type === 'UPDATE_AUTO_HIGHLIGHT') {
    autoHighlightEnabled = message.autoHighlight;
    removeHighlights();
    if (autoHighlightEnabled) {
      initializeHighlighting();
    }
    sendResponse({ success: true });
  }

  if (message.type === 'ANALYZE_SELECTED_TEXT' && message.text) {
    analyzeSelectedText(message.text);
    sendResponse({ success: true });
  }
});

chrome.storage.sync.get(['geminiApiKey', 'autoHighlight', 'highlightingEnabled'], (result) => {
  if (result.geminiApiKey) {
    genAI = new GoogleGenerativeAI(result.geminiApiKey);
  }
  autoHighlightEnabled = result.autoHighlight !== false;
  
  if (result.highlightingEnabled) {
    createStopButton();
    if (autoHighlightEnabled) {
      initializeHighlighting();
    }
  }
});

initializeTooltip();
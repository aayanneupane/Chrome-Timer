const EXTENSION_ID = chrome.runtime.id;
const EXTENSION_NAME = "Time Tracker";

let ACTIVE_CHECK_INTERVAL = 1000;
let activeTabId = null;
let activeDomain = null;
let lastActiveTime = Date.now();
let browserStartTime = Date.now();

// Initialize storage with default values
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.sync.set({
    blockedDomains: [],
    timeLimits: {}
  });
  browserStartTime = Date.now();
});

// Track active tab changes
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  updateActiveTab(tab);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.url) {
    updateActiveTab(tab);
  }
});

// Main tracking interval
setInterval(async () => {
  if (!activeDomain || activeDomain === EXTENSION_ID) return;
  
  const now = Date.now();
  const duration = Math.floor((now - lastActiveTime) / 1000);
  lastActiveTime = now;

  // Update daily usage
  const dateKey = new Date().toISOString().slice(0, 10);
  const usageKey = `usage_${dateKey}`;
  const globalKey = `global_${dateKey}`;

  const stored = await chrome.storage.local.get([usageKey, globalKey]);
  const siteData = stored[usageKey] || {};
  const globalTime = stored[globalKey] || 0;

  siteData[activeDomain] = (siteData[activeDomain] || 0) + duration;
  await chrome.storage.local.set({
    [usageKey]: siteData,
    [globalKey]: globalTime + duration
  });

  // Check if site should be blocked
  await checkTimeLimits(activeDomain);
}, ACTIVE_CHECK_INTERVAL);

// Check time limits and blocked status
async function checkTimeLimits(domain) {
  // Skip checking if it's our own extension
  if (domain === EXTENSION_ID) return;
  
  const { timeLimits = {}, blockedDomains = [] } = await chrome.storage.sync.get(["timeLimits", "blockedDomains"]);
  
  // Check if domain is blocked (excluding our extension)
  const isBlocked = blockedDomains.includes(domain) && domain !== EXTENSION_ID;
  if (isBlocked) {
    chrome.tabs.update(activeTabId, { url: chrome.runtime.getURL("blocked.html") });
    return;
  }

  // Check if time limit exceeded
  if (timeLimits[domain]) {
    const dateKey = new Date().toISOString().slice(0, 10);
    const usageKey = `usage_${dateKey}`;
    const { [usageKey]: usage = {} } = await chrome.storage.local.get(usageKey);
    
    if (usage[domain] >= timeLimits[domain] * 60) {
      chrome.tabs.update(activeTabId, { url: chrome.runtime.getURL("blocked.html") });
    }
  }
}

// Update active tab info
function updateActiveTab(tab) {
  try {
    if (!tab.url || tab.url.startsWith('chrome://')) {
      activeDomain = null;
      return;
    }
    
    const url = new URL(tab.url);
    activeDomain = url.hostname.replace("www.", "");
    activeTabId = tab.id;
    lastActiveTime = Date.now();
  } catch (_) {
    activeDomain = null;
  }
}

// Handle popup opening request
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "openPopup") {
    chrome.action.openPopup();
  }
  if (request.action === "getUptime") {
    sendResponse({ uptime: Math.floor((Date.now() - browserStartTime) / 1000) });
  }
  if (request.action === "getExtensionInfo") {
    sendResponse({ id: EXTENSION_ID, name: EXTENSION_NAME });
  }
});

// Reset daily tracking at midnight
function scheduleMidnightReset() {
  const now = new Date();
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  const timeUntilMidnight = midnight - now;

  setTimeout(() => {
    resetDailyTracking();
    scheduleMidnightReset();
  }, timeUntilMidnight);
}

function resetDailyTracking() {
  const dateKey = new Date().toISOString().slice(0, 10);
  chrome.storage.local.set({
    [`usage_${dateKey}`]: {},
    [`global_${dateKey}`]: 0
  });
}

// Start the midnight reset scheduler
scheduleMidnightReset();
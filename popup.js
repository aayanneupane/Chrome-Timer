document.addEventListener("DOMContentLoaded", async () => {
  // Constants for extension identification
  const EXTENSION_ID = chrome.runtime.id;
  const EXTENSION_NAME = "Time Tracker";

  // Tab switching
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      const tabId = button.getAttribute('data-tab');
      document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
      });
      document.getElementById(tabId).classList.add('active');
    });
  });

  function formatTime(seconds) {
    const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function cleanDomain(domain) {
    const cleaned = domain.replace(/^https?:\/\//, '')
                 .replace('www.', '')
                 .split('/')[0]
                 .trim();
    // Special handling for extension ID
    return cleaned === EXTENSION_ID ? EXTENSION_NAME : cleaned;
  }

  async function updateUptime() {
    const response = await chrome.runtime.sendMessage({ action: "getUptime" });
    document.getElementById('uptime').textContent = formatTime(response.uptime);
  }

  async function updateTotalTime() {
    const dateKey = new Date().toISOString().slice(0, 10);
    const { [`global_${dateKey}`]: total = 0 } = await chrome.storage.local.get(`global_${dateKey}`);
    document.getElementById('totalTime').textContent = formatTime(total);
  }

  async function refreshDashboard() {
    const dateKey = new Date().toISOString().slice(0, 10);
    const { [`usage_${dateKey}`]: usage = {} } = await chrome.storage.local.get(`usage_${dateKey}`);
    
    const usageList = document.getElementById('usageList');
    usageList.innerHTML = Object.entries(usage).length === 0
      ? '<div style="text-align: center; padding: 15px;">No activity yet today</div>'
      : Object.entries(usage)
          .sort((a, b) => b[1] - a[1])
          .map(([site, time]) => `
            <div class="site-item">
              <div class="domain-container">${site === EXTENSION_ID ? EXTENSION_NAME : site}</div>
              <div class="time-limit-value">${formatTime(time)}</div>
            </div>
          `).join('');
    
    await updateUptime();
    await updateTotalTime();
  }

  async function refreshBlocked() {
    const { blockedDomains = [] } = await chrome.storage.sync.get("blockedDomains");
    const blockedList = document.getElementById('blockedList');
    
    // Filter and rename extension ID if present
    const displayDomains = blockedDomains.map(domain => 
      domain === EXTENSION_ID ? EXTENSION_NAME : domain
    ).filter(domain => domain !== EXTENSION_ID); // Remove extension ID completely
    
    blockedList.innerHTML = displayDomains.length === 0
      ? '<div style="text-align: center; padding: 15px;">No blocked sites</div>'
      : displayDomains.map(domain => `
          <div class="site-item">
            <div class="domain-container" title="${domain}">${domain}</div>
            <div class="action-btn-container">
              <button class="action-btn remove-btn" data-domain="${domain === EXTENSION_NAME ? EXTENSION_ID : domain}">Remove</button>
            </div>
          </div>
        `).join('');
    
    document.querySelectorAll('#blockedList .remove-btn').forEach(button => {
      button.addEventListener('click', async () => {
        const domain = button.getAttribute('data-domain');
        const { blockedDomains = [] } = await chrome.storage.sync.get("blockedDomains");
        const updated = blockedDomains.filter(d => d !== domain && d !== EXTENSION_ID);
        await chrome.storage.sync.set({ blockedDomains: updated });
        await refreshBlocked();
      });
    });
  }

  async function refreshLimits() {
    const { timeLimits = {} } = await chrome.storage.sync.get("timeLimits");
    const limitsList = document.getElementById('limitsList');
    
    // Filter out extension ID from time limits
    const filteredLimits = Object.fromEntries(
      Object.entries(timeLimits).filter(([domain]) => domain !== EXTENSION_ID)
    );
    
    limitsList.innerHTML = Object.keys(filteredLimits).length === 0
      ? '<div style="text-align: center; padding: 15px;">No time limits set</div>'
      : Object.entries(filteredLimits).map(([domain, minutes]) => `
          <div class="site-item">
            <div class="domain-container" title="${domain}">${domain}</div>
            <div class="time-limit-value">${minutes} min</div>
            <div class="action-btn-container">
              <button class="action-btn remove-btn" data-domain="${domain}">Remove</button>
            </div>
          </div>
        `).join('');
    
    document.querySelectorAll('#limitsList .remove-btn').forEach(button => {
      button.addEventListener('click', async () => {
        const domain = button.getAttribute('data-domain');
        const { timeLimits = {} } = await chrome.storage.sync.get("timeLimits");
        delete timeLimits[domain];
        await chrome.storage.sync.set({ timeLimits });
        await refreshLimits();
      });
    });
  }

  document.getElementById('addBlockBtn').addEventListener('click', async () => {
    let domain = document.getElementById('blockInput').value.trim();
    if (!domain) return;
    
    // Clean and check for extension ID
    domain = domain.replace(/^https?:\/\//, '')
                  .replace('www.', '')
                  .split('/')[0]
                  .trim();
    
    if (domain === EXTENSION_ID) {
      alert('Cannot block the Time Tracker extension');
      document.getElementById('blockInput').value = '';
      return;
    }
    
    const { blockedDomains = [] } = await chrome.storage.sync.get("blockedDomains");
    if (blockedDomains.includes(domain)) {
      alert('This domain is already blocked');
      return;
    }
    
    blockedDomains.push(domain);
    await chrome.storage.sync.set({ blockedDomains });
    document.getElementById('blockInput').value = '';
    await refreshBlocked();
  });

  document.getElementById('setLimitBtn').addEventListener('click', async () => {
    let domain = document.getElementById('limitDomain').value.trim();
    const minutes = parseInt(document.getElementById('limitMinutes').value);
    
    if (!domain || isNaN(minutes) || minutes < 1) {
      alert('Please enter a valid domain and time (minimum 1 minute)');
      return;
    }
    
    domain = domain.replace(/^https?:\/\//, '')
                  .replace('www.', '')
                  .split('/')[0]
                  .trim();
    
    if (domain === EXTENSION_ID) {
      alert('Cannot set limits for the Time Tracker extension');
      document.getElementById('limitDomain').value = '';
      document.getElementById('limitMinutes').value = '';
      return;
    }
    
    const { timeLimits = {} } = await chrome.storage.sync.get("timeLimits");
    timeLimits[domain] = minutes;
    await chrome.storage.sync.set({ timeLimits });
    
    document.getElementById('limitDomain').value = '';
    document.getElementById('limitMinutes').value = '';
    await refreshLimits();
  });

  await refreshDashboard();
  await refreshBlocked();
  await refreshLimits();
});
// Create the global uptime tracker
const uptimeBox = document.createElement('div');
uptimeBox.id = 'time-tracker-uptime';
uptimeBox.style = `
  position: fixed;
  bottom: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 8px 12px;
  border-radius: 8px;
  font-family: monospace;
  font-size: 14px;
  z-index: 999999;
  cursor: pointer;
  transition: all 0.2s ease;
`;
document.body.appendChild(uptimeBox);

// Create the detailed view box
const detailBox = document.createElement('div');
detailBox.id = 'time-tracker-details';
detailBox.style = `
  position: fixed;
  bottom: 50px;
  right: 10px;
  background: white;
  color: black;
  padding: 15px;
  border-radius: 8px;
  width: 280px;
  max-height: 400px;
  overflow-y: auto;
  font-size: 14px;
  box-shadow: 0 0 15px rgba(0, 0, 0, 0.2);
  display: none;
  z-index: 999999;
`;
document.body.appendChild(detailBox);

// Format time display
function formatTime(seconds) {
  if (isNaN(seconds)) return '00:00:00';
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

// Update uptime display
async function updateUptimeBox() {
  const response = await chrome.runtime.sendMessage({ action: "getUptime" });
  uptimeBox.textContent = `Uptime: ${formatTime(response.uptime)}`;
}

// Update detailed view with today's usage
async function updateDetailBox() {
  const dateKey = new Date().toISOString().slice(0, 10);
  const usageKey = `usage_${dateKey}`;
  const { [usageKey]: usage = {} } = await chrome.storage.local.get(usageKey);
  
  let html = `
    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
      <strong>Today's Activity</strong>
      <button style="background: none; border: none; cursor: pointer;">✕</button>
    </div>
  `;
  
  if (Object.keys(usage).length === 0) {
    html += '<div style="text-align: center; padding: 10px;">No activity yet today</div>';
  } else {
    html += Object.entries(usage)
      .sort((a, b) => b[1] - a[1])
      .map(([site, seconds]) => `
        <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee;">
          <span>${site}</span>
          <span>${formatTime(seconds)}</span>
        </div>
      `).join('');
  }
  
  detailBox.innerHTML = html;
  detailBox.querySelector('button').onclick = closeDetailBox;
}

// Close detailed view
function closeDetailBox() {
  detailBox.style.display = 'none';
}

// Toggle detailed view on double-click
uptimeBox.ondblclick = () => {
  if (detailBox.style.display === 'block') {
    closeDetailBox();
  } else {
    updateDetailBox();
    detailBox.style.display = 'block';
  }
};

// Close detailed view when clicking outside
document.addEventListener('click', (e) => {
  if (detailBox.style.display === 'block' && 
      !detailBox.contains(e.target) && 
      !uptimeBox.contains(e.target)) {
    closeDetailBox();
  }
});

// Prevent closing when clicking the uptime box
uptimeBox.addEventListener('click', (e) => {
  e.stopPropagation();
});

// Initialize and update every second
updateUptimeBox();
setInterval(updateUptimeBox, 1000);

// Also update when tab becomes active
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "updateUptime") {
    updateUptimeBox();
  }
});
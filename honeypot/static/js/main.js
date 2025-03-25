// Helper function to format dates
function formatDateToLocalTime(isoString) {
    const date = new Date(isoString + 'Z');  // Ensure UTC interpretation
    return date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
}

// Initialize theme based on user preference, system preference, or default to light mode
if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
    localStorage.theme = 'dark';
    const lightIconMenu = document.getElementById('lightIconMenu');
    const darkIconMenu = document.getElementById('darkIconMenu');
    const themeText = document.getElementById('themeText');
    if (lightIconMenu && darkIconMenu) {
        lightIconMenu.classList.remove('hidden');
        darkIconMenu.classList.add('hidden');
    }
    if (themeText) {
        themeText.textContent = 'Light Mode';
    }
} else {
    // Default to light mode if no preference is set or system is light mode
    localStorage.theme = 'light';
    const themeText = document.getElementById('themeText');
    if (themeText) {
        themeText.textContent = 'Dark Mode';
    }
}

// Initialize map with light/dark theme support
const map = L.map('map').setView([20, 0], 2);
let currentTileLayer;
let heatLayer;

// Function to center map on most active region
function centerMapOnMostActiveRegion(attempts) {
    if (!attempts || attempts.length === 0) return;

    // Create a grid to count attacks in different regions
    const grid = {};
    const validAttempts = attempts.filter(a => a.latitude && a.longitude);
    
    if (validAttempts.length === 0) return;

    // Round coordinates to create grid cells (1 degree resolution)
    validAttempts.forEach(attempt => {
        const lat = Math.round(attempt.latitude);
        const lng = Math.round(attempt.longitude);
        const key = `${lat},${lng}`;
        grid[key] = (grid[key] || 0) + 1;
    });

    // Find the cell with most attacks
    let maxCount = 0;
    let hotspotCenter = null;
    
    for (const [coords, count] of Object.entries(grid)) {
        if (count > maxCount) {
            maxCount = count;
            const [lat, lng] = coords.split(',').map(Number);
            hotspotCenter = [lat, lng];
        }
    }

    // If we found a hotspot, center the map there with appropriate zoom
    if (hotspotCenter) {
        const zoom = window.innerWidth <= 768 ? 2 : 3;
        map.setView(hotspotCenter, zoom, { animate: true });
    }
}

const lightTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
});

const darkTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    className: 'dark-tiles'
});

// Function to set the appropriate tile layer
function setMapTheme(isDark) {
    if (currentTileLayer) {
        map.removeLayer(currentTileLayer);
    }
    currentTileLayer = isDark ? darkTileLayer : lightTileLayer;
    currentTileLayer.addTo(map);
}

// Initial theme setup
setMapTheme(document.documentElement.classList.contains('dark'));

function updateMap(attempt) {
    if (!attempt.latitude || !attempt.longitude) return;

    // Remove existing heat layer if it exists
    if (heatLayer) {
        map.removeLayer(heatLayer);
    }

    // Get all attempts with valid coordinates
    const validAttempts = attempts.filter(a => a.latitude && a.longitude);
    
    // Create heatmap data points with intensity based on frequency
    const locationFrequency = {};
    validAttempts.forEach(a => {
        const key = `${a.latitude},${a.longitude}`;
        locationFrequency[key] = (locationFrequency[key] || 0) + 1;
    });

    const heatData = validAttempts.map(a => {
        const key = `${a.latitude},${a.longitude}`;
        const intensity = Math.min(locationFrequency[key] / 5, 1); // Normalize intensity
        return [a.latitude, a.longitude, intensity];
    });

    // Create and add the heat layer
    heatLayer = L.heatLayer(heatData, {
        radius: 15,
        blur: 10,
        maxZoom: 10,
        max: 1.0,
        gradient: {
            0.4: 'blue',
            0.6: 'lime',
            0.8: 'yellow',
            1.0: 'red'
        }
    }).addTo(map);
}

const attemptsDiv = document.getElementById("attempts");
const searchInput = document.getElementById("searchInput");
const filterSelect = document.getElementById("filterSelect");
const protocolSelect = document.getElementById("protocolSelect");
const connectionStatus = document.getElementById("connectionStatus");
let attempts = [];
let socket = null;
let isLoadingData = false;
let totalAttemptsCount = 0;
let loadedAttemptsCount = 0;
let animatedCount = 0;
let animatedPercentage = 0;
let countAnimationFrame = null;
const CHUNK_SIZE = 1000; // Number of records per chunk
let lastDataTimestamp = null; // Track the timestamp of the most recent data

// Function to save data to local storage
function saveToLocalStorage() {
    try {
        const dataToSave = {
            attempts: attempts,
            timestamp: lastDataTimestamp,
            totalCount: totalAttemptsCount
        };
        localStorage.setItem('honeypotterData', JSON.stringify(dataToSave));
    } catch (error) {
        console.error('Error saving to local storage:', error);
    }
}

// Function to load data from local storage
function loadFromLocalStorage() {
    try {
        const savedData = localStorage.getItem('honeypotterData');
        if (savedData) {
            const parsed = JSON.parse(savedData);
            attempts = parsed.attempts || [];
            lastDataTimestamp = parsed.timestamp;
            totalAttemptsCount = parsed.totalCount || 0;
            loadedAttemptsCount = attempts.length;
            return true;
        }
    } catch (error) {
        console.error('Error loading from local storage:', error);
    }
    return false;
}

// Function to animate number with easing
function animateNumber(start, end, duration, onUpdate, onComplete) {
    const startTime = performance.now();
    const change = end - start;
    
    function easeOutQuad(t) {
        return t * (2 - t);
    }
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const currentValue = start + (change * easeOutQuad(progress));
        onUpdate(Math.round(currentValue));
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            onComplete && onComplete();
        }
    }
    
    requestAnimationFrame(update);
}

// Function to format numbers with commas
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Function to update counter with simple animation
function updateCounterWithAnimation(elementId, newValue) {
    const element = document.getElementById(elementId);
    const currentValue = parseInt(element.textContent) || 0;
    
    if (currentValue !== newValue) {
        element.textContent = newValue;
        element.classList.remove('metric-update');
        void element.offsetWidth; // Trigger reflow
        element.classList.add('metric-update');
    }
}

// Add function to count unique attackers
function updateUniqueAttackersCount() {
    const uniqueIPs = new Set(attempts.map(attempt => attempt.client_ip));
    const currentCount = parseInt(document.getElementById('uniqueAttackers').textContent);
    if (currentCount !== uniqueIPs.size) {
        updateCounterWithAnimation('uniqueAttackers', uniqueIPs.size);
    }
}

function updateConnectionStatus(status, isError = false) {
    const indicator = document.getElementById('connectionStatusIndicator');
    const svg = indicator.querySelector('svg');
    
    if (status.includes('Connected')) {
        indicator.className = 'connected';
        svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>';
        svg.classList.remove('animate-spin');
    } else if (status.includes('Connecting')) {
        indicator.className = 'reconnecting';
        svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>';
        svg.classList.add('animate-spin');
    } else {
        indicator.className = 'disconnected';
        svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>';
        svg.classList.remove('animate-spin');
    }
}

function toggleLoadingOverlay(show) {
    const overlay = document.getElementById('loadingOverlay');
    if (show) {
        overlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            overlay.style.visibility = 'visible';
        });
    } else {
        overlay.style.opacity = '0';
        overlay.style.visibility = 'hidden';
        document.body.style.overflow = '';
        
        setTimeout(() => {
            overlay.classList.add('hidden');
        }, 300);
    }
}

// Show loading overlay initially
toggleLoadingOverlay(true);

// Function to update loading progress with smooth animations
function updateLoadingProgress() {
    const loadingPercentage = document.querySelector('.loading-percentage');
    const loadingCount = document.querySelector('.loading-count');
    const progressCircle = document.querySelector('.progress-circle');
    
    if (loadingPercentage && loadingCount && progressCircle && totalAttemptsCount > 0) {
        const targetPercentage = Math.round((loadedAttemptsCount / totalAttemptsCount) * 100);
        const targetCount = loadedAttemptsCount;
        
        // Cancel any existing animation
        if (countAnimationFrame) {
            cancelAnimationFrame(countAnimationFrame);
        }
        
        // Animate percentage and update circle
        animateNumber(animatedPercentage, targetPercentage, 500, (value) => {
            animatedPercentage = value;
            loadingPercentage.textContent = `${value}%`;
            
            // Update progress circle
            const circumference = 2 * Math.PI * 16; // r = 16 from SVG
            const offset = circumference - (value / 100) * circumference;
            progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
            progressCircle.style.strokeDashoffset = offset;
        });
        
        // Animate count
        animateNumber(animatedCount, targetCount, 500, (value) => {
            animatedCount = value;
            loadingCount.textContent = `${formatNumber(value)} of ${formatNumber(totalAttemptsCount)} records`;
        });
        
        // If we have fewer records than chunk size, update UI immediately
        if (totalAttemptsCount < CHUNK_SIZE) {
            updateUI();
        }
    }
}

// Function to reset loading animation state
function resetLoadingAnimation() {
    const loadingPercentage = document.querySelector('.loading-percentage');
    const loadingCount = document.querySelector('.loading-count');
    const progressCircle = document.querySelector('.progress-circle');
    
    if (loadingPercentage && loadingCount && progressCircle) {
        loadingPercentage.textContent = '0%';
        loadingCount.textContent = '0 of 0 records';
        
        const circumference = 2 * Math.PI * 16;
        progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
        progressCircle.style.strokeDashoffset = circumference;
    }
    
    animatedCount = 0;
    animatedPercentage = 0;
}

// Function to load data in chunks with delay between chunks to prevent overwhelming
async function loadDataChunk(offset, since = null) {
    try {
        // Add a small delay between chunks to prevent overwhelming
        if (offset > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        let url = `/api/attempts?offset=${offset}&limit=${CHUNK_SIZE}`;
        if (since) {
            url += `&since=${since}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching data chunk:', error);
        return { attempts: [], total: 0 };
    }
}

// Function to validate entry count
async function validateEntryCount() {
    try {
        const response = await fetch('/api/attempts?count_only=true');
        const { total } = await response.json();
        
        // Check if the local count matches the server count
        if (attempts.length !== total) {
            console.warn(`Entry count mismatch: local ${attempts.length} vs server ${total}`);
            
            // Additional check for duplicates
            const uniqueAttempts = new Map();
            let duplicatesFound = false;
            
            attempts.forEach(attempt => {
                const key = `${attempt.timestamp}_${attempt.client_ip}_${attempt.protocol}`;
                if (uniqueAttempts.has(key)) {
                    duplicatesFound = true;
                    console.warn('Duplicate entry found:', key);
                }
                uniqueAttempts.set(key, attempt);
            });
            
            if (duplicatesFound) {
                console.warn('Removing duplicates and updating storage...');
                attempts = Array.from(uniqueAttempts.values());
                
                // If after removing duplicates we still have a mismatch, clear everything
                if (attempts.length !== total) {
                    localStorage.removeItem('honeypotterData');
                    window.location.reload();
                    return false;
                } else {
                    // Save the deduplicated data
                    saveToLocalStorage();
                    return true;
                }
            } else {
                // If no duplicates found but counts still don't match, clear everything
                localStorage.removeItem('honeypotterData');
                window.location.reload();
                return false;
            }
        }
        return true;
    } catch (error) {
        console.error('Error validating entry count:', error);
        return false;
    }
}

// Function to load all data in chunks
async function loadAllData(forceReload = false) {
    if (isLoadingData) return;
    isLoadingData = true;

    // Try to load from local storage if not forcing reload
    if (!forceReload && loadFromLocalStorage()) {
        console.log('Using cached data from local storage');
        
        // Validate the entry count
        const isValid = await validateEntryCount();
        if (!isValid) {
            isLoadingData = false;
            return;
        }
        
        updateUI();
        updateCounterWithAnimation('totalAttempts', attempts.length);
        updateUniqueAttackersCount();
        isLoadingData = false;
        toggleLoadingOverlay(false); // Hide loading overlay for cached data
        
        // Fetch only new data since last timestamp in the background
        if (lastDataTimestamp) {
            try {
                await loadIncrementalData(lastDataTimestamp);
            } catch (error) {
                console.error('Error loading incremental data:', error);
            }
        }
        return;
    }

    // Reset animation state before starting fresh load
    resetLoadingAnimation();
    toggleLoadingOverlay(true);
    
    attempts = [];
    loadedAttemptsCount = 0;
    
    try {
        // First, get the total count
        const initialResponse = await fetch('/api/attempts?count_only=true');
        const { total } = await initialResponse.json();
        totalAttemptsCount = total;
        
        // Update loading count text with total
        const loadingCount = document.querySelector('.loading-count');
        if (loadingCount) {
            loadingCount.textContent = `0 of ${formatNumber(total)} records`;
        }
        
        // If we have no data, update UI and return early
        if (total === 0) {
            updateUI();
            isLoadingData = false;
            setTimeout(() => toggleLoadingOverlay(false), 500);
            return;
        }
        
        // Load data in chunks
        for (let offset = 0; offset < total; offset += CHUNK_SIZE) {
            const response = await loadDataChunk(offset);
            const { attempts: chunkData } = response;
            
            if (!chunkData || chunkData.length === 0) {
                console.warn(`No data received for chunk at offset ${offset}`);
                continue;
            }
            
            attempts = [...attempts, ...chunkData];
            loadedAttemptsCount += chunkData.length;
            
            // Update last timestamp if needed
            if (chunkData.length > 0) {
                const lastAttempt = chunkData[chunkData.length - 1];
                lastDataTimestamp = lastAttempt.timestamp;
            }
            
            // Update loading progress after each chunk
            updateLoadingProgress();
            
            // Update counters and UI immediately with each chunk
            updateCounterWithAnimation('totalAttempts', attempts.length);
            updateUniqueAttackersCount();
            
            // Update UI with partial data
            updateUI();
            
            // Save to local storage periodically
            if (offset % (CHUNK_SIZE * 5) === 0) {
                saveToLocalStorage();
            }
            
            // Allow other tasks to process between chunks
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        // Final save to local storage
        saveToLocalStorage();
        
    } catch (error) {
        console.error('Error loading data:', error);
    } finally {
        isLoadingData = false;
        setTimeout(() => toggleLoadingOverlay(false), 500);
    }
}

// Function to load only new data since last timestamp
async function loadIncrementalData(since) {
    try {
        console.log('Loading incremental data since:', since);
        const response = await loadDataChunk(0, since);
        const { attempts: newData, total } = response;
        
        if (newData && newData.length > 0) {
            console.log('Received', newData.length, 'new records');
            
            // Create a Set of existing entry keys to prevent duplicates
            const existingEntries = new Set(
                attempts.map(a => `${a.timestamp}_${a.client_ip}_${a.protocol}`)
            );
            
            // Filter out any duplicates from new data
            const uniqueNewData = newData.filter(attempt => {
                const key = `${attempt.timestamp}_${attempt.client_ip}_${attempt.protocol}`;
                return !existingEntries.has(key);
            });
            
            if (uniqueNewData.length !== newData.length) {
                console.warn(`Filtered out ${newData.length - uniqueNewData.length} duplicate entries`);
            }
            
            attempts = [...uniqueNewData, ...attempts];
            totalAttemptsCount = total;
            loadedAttemptsCount = attempts.length;
            
            // Update last timestamp if we have new data
            if (uniqueNewData.length > 0) {
                lastDataTimestamp = uniqueNewData[0].timestamp;
            }
            
            // Update UI and save
            updateUI();
            updateCounterWithAnimation('totalAttempts', attempts.length);
            updateUniqueAttackersCount();
            saveToLocalStorage();
            
            // Validate the count after adding new data
            await validateEntryCount();
        } else {
            console.log('No new data to load');
        }
    } catch (error) {
        console.error('Error loading incremental data:', error);
    }
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    updateConnectionStatus('Connecting to WebSocket...');
    
    socket = new WebSocket(wsUrl);

    socket.onopen = function() {
        updateConnectionStatus('Connected to WebSocket');
        loadAllData(); // Will now use cached data if available
    };

    socket.onmessage = function(event) {
        try {
            const newAttempt = JSON.parse(event.data);
            console.log('Received new attempt:', newAttempt);
            
            // Check if this IP is new before adding the attempt
            const isNewAttacker = !attempts.some(attempt => attempt.client_ip === newAttempt.client_ip);
            
            attempts.unshift(newAttempt);
            lastDataTimestamp = newAttempt.timestamp;
            updateCounterWithAnimation('totalAttempts', attempts.length);
            
            // Only update unique attackers if this is a new IP
            if (isNewAttacker) {
                updateUniqueAttackersCount();
            }
            
            updateMap(newAttempt);
            saveToLocalStorage(); // Save after each new attempt
            
            currentPage = 1;
            updateUI();
            
            const indicator = document.getElementById('connectionStatusIndicator');
            indicator.style.transform = 'scale(1.2)';
            setTimeout(() => {
                indicator.style.transform = 'scale(1)';
            }, 200);
        } catch (error) {
            console.error('Error processing WebSocket message:', error);
        }
    };

    socket.onerror = function(error) {
        updateConnectionStatus('WebSocket error: ' + error.message, true);
        console.error('WebSocket error:', error);
        toggleLoadingOverlay(false);
    };

    socket.onclose = function() {
        updateConnectionStatus('WebSocket connection closed. Reconnecting...', true);
        toggleLoadingOverlay(false);
        setTimeout(connectWebSocket, 5000);
    };
}

function createAttemptElement(attempt) {
    const location = [
        attempt.city,
        attempt.region,
        attempt.country
    ].filter(Boolean).join(', ');

    const usernameDisplay = attempt.username ? attempt.username : '[User Null]';
    const passwordDisplay = attempt.protocol === 'rdp' ? '[Password Unavailable]' : 
                          (attempt.password ? attempt.password : '[Password Null]');

    return `
        <div class="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
            <div class="flex flex-col sm:flex-row justify-between gap-2">
                <span class="font-semibold break-all">
                    ${usernameDisplay}@${attempt.client_ip}
                    <span class="inline-block px-2 py-1 text-xs rounded-full ml-2">
                        ${attempt.protocol.toUpperCase()}
                    </span>
                </span>
                <span class="text-gray-500 text-sm">${formatDateToLocalTime(attempt.timestamp)}</span>
            </div>
            <div class="text-gray-600 mt-2">
                <div class="break-all">Password: ${passwordDisplay}</div>
                ${location ? `<div class="text-sm mt-1">Location: ${location}</div>` : ''}
            </div>
        </div>
    `;
}

function filterAttempts(attempts) {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const filterValue = filterSelect.value;
    const protocolValue = protocolSelect.value;
    const now = new Date();

    return attempts.filter(attempt => {
        const matchesSearch = searchTerm === '' || 
            attempt.username.toLowerCase().includes(searchTerm) ||
            attempt.client_ip.includes(searchTerm) ||
            attempt.password.toLowerCase().includes(searchTerm);

        const matchesProtocol = protocolValue === 'all' || attempt.protocol === protocolValue;

        const timestamp = new Date(attempt.timestamp + 'Z');
        let matchesFilter = true;

        switch (filterValue) {
            case 'lastHour':
                matchesFilter = (now - timestamp) <= (60 * 60 * 1000);
                break;
            case 'today':
                const attemptDate = new Date(timestamp.toLocaleDateString());
                const todayDate = new Date(now.toLocaleDateString());
                matchesFilter = attemptDate.getTime() === todayDate.getTime();
                break;
            case 'thisWeek':
                const weekAgo = new Date(now);
                weekAgo.setDate(now.getDate() - 7);
                matchesFilter = timestamp >= weekAgo;
                break;
            case 'all':
            default:
                matchesFilter = true;
                break;
        }

        return matchesSearch && matchesFilter && matchesProtocol;
    });
}

let currentPage = 1;
const itemsPerPage = 10;

function updateUI() {
    const filteredAttempts = filterAttempts(attempts);
    const totalItems = filteredAttempts.length;
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    
    document.getElementById('startRange').textContent = totalItems ? startIndex + 1 : 0;
    document.getElementById('endRange').textContent = endIndex;
    document.getElementById('totalItems').textContent = totalItems;
    
    document.getElementById('prevPage').disabled = currentPage === 1;
    document.getElementById('nextPage').disabled = endIndex >= totalItems;
    
    const paginatedAttempts = filteredAttempts.slice(startIndex, endIndex);
    attemptsDiv.innerHTML = paginatedAttempts
        .map(attempt => createAttemptElement(attempt))
        .join('');

    updateVisualizations(filteredAttempts);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Hamburger Menu
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    const exportIPsMenu = document.getElementById('exportIPsMenu');
    const darkModeToggleMenu = document.getElementById('darkModeToggleMenu');
    const faqButton = document.getElementById('faqButton');
    const faqModal = document.getElementById('faqModal');
    const closeFaqModal = document.getElementById('closeFaqModal');

    if (hamburgerBtn && mobileMenu) {
        hamburgerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            mobileMenu.classList.toggle('hidden');
            
            if (!mobileMenu.classList.contains('hidden')) {
                const overlay = document.createElement('div');
                overlay.className = 'menu-overlay';
                document.body.appendChild(overlay);
                
                // Force a reflow before adding the active class
                overlay.offsetHeight;
                overlay.classList.add('active');
            } else {
                const overlay = document.querySelector('.menu-overlay');
                if (overlay) {
                    overlay.classList.remove('active');
                    overlay.addEventListener('transitionend', () => {
                        overlay.remove();
                    }, { once: true });
                }
            }
        });
    }

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
        if (mobileMenu && !mobileMenu.contains(e.target) && !hamburgerBtn.contains(e.target)) {
            mobileMenu.classList.add('hidden');
            const overlay = document.querySelector('.menu-overlay');
            if (overlay) {
                overlay.classList.remove('active');
                overlay.addEventListener('transitionend', () => {
                    overlay.remove();
                }, { once: true });
            }
        }
    });

    // Menu item click handlers
    if (exportIPsMenu) {
        exportIPsMenu.addEventListener('click', () => {
            mobileMenu.classList.add('hidden');
            const overlay = document.querySelector('.menu-overlay');
            if (overlay) {
                overlay.classList.remove('active');
                overlay.addEventListener('transitionend', () => {
                    overlay.remove();
                }, { once: true });
            }
            window.open('/api/export/plaintext', '_blank');
        });
    }

    const exportJSONMenu = document.getElementById('exportJSONMenu');
    if (exportJSONMenu) {
        exportJSONMenu.addEventListener('click', () => {
            mobileMenu.classList.add('hidden');
            const overlay = document.querySelector('.menu-overlay');
            if (overlay) {
                overlay.classList.remove('active');
                overlay.addEventListener('transitionend', () => {
                    overlay.remove();
                }, { once: true });
            }
            window.open('/api/export/json', '_blank');
        });
    }

    const exportCSVMenu = document.getElementById('exportCSVMenu');
    if (exportCSVMenu) {
        exportCSVMenu.addEventListener('click', () => {
            mobileMenu.classList.add('hidden');
            const overlay = document.querySelector('.menu-overlay');
            if (overlay) {
                overlay.classList.remove('active');
                overlay.addEventListener('transitionend', () => {
                    overlay.remove();
                }, { once: true });
            }
            window.open('/api/export/csv', '_blank');
        });
    }

    if (darkModeToggleMenu) {
        darkModeToggleMenu.addEventListener('click', () => {
            const isDark = document.documentElement.classList.toggle('dark');
            const lightIconMenu = document.getElementById('lightIconMenu');
            const darkIconMenu = document.getElementById('darkIconMenu');
            const themeText = document.getElementById('themeText');
            
            if (lightIconMenu && darkIconMenu) {
                lightIconMenu.classList.toggle('hidden');
                darkIconMenu.classList.toggle('hidden');
            }
            
            if (themeText) {
                themeText.textContent = isDark ? 'Light Mode' : 'Dark Mode';
            }
            
            localStorage.theme = isDark ? 'dark' : 'light';
            mobileMenu.classList.add('hidden');
            
            const overlay = document.querySelector('.menu-overlay');
            if (overlay) {
                overlay.classList.remove('active');
                overlay.addEventListener('transitionend', () => {
                    overlay.remove();
                }, { once: true });
            }

            setMapTheme(isDark);

            // Update chart colors
            const chartTextColor = isDark ? '#f3f4f6' : '#1f2937';
            const gridColor = isDark ? '#374151' : '#e5e7eb';
            
            if (typeof attemptsChart !== 'undefined') {
                updateChartColors(attemptsChart, isDark, chartTextColor, gridColor);
            }
            if (typeof usernamesChart !== 'undefined') {
                updateChartColors(usernamesChart, isDark, chartTextColor, gridColor);
            }
            if (typeof ipsChart !== 'undefined') {
                updateChartColors(ipsChart, isDark, chartTextColor, gridColor);
            }
            if (typeof countriesChart !== 'undefined') {
                updateChartColors(countriesChart, isDark, chartTextColor, gridColor);
            }
        });
    }

    // FAQ Modal handlers
    if (faqButton && faqModal) {
        faqButton.addEventListener('click', () => {
            mobileMenu.classList.add('hidden');
            const overlay = document.querySelector('.menu-overlay');
            if (overlay) {
                overlay.classList.remove('active');
                overlay.addEventListener('transitionend', () => {
                    overlay.remove();
                }, { once: true });
            }
            faqModal.classList.remove('hidden');
            // Force a reflow before any animations
            faqModal.offsetHeight;
        });
    }

    if (closeFaqModal && faqModal) {
        closeFaqModal.addEventListener('click', () => {
            faqModal.classList.add('hidden');
        });

        faqModal.addEventListener('click', (e) => {
            if (e.target === faqModal) {
                faqModal.classList.add('hidden');
            }
        });
    }

    // Close modals on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
                mobileMenu.classList.add('hidden');
                const overlay = document.querySelector('.menu-overlay');
                if (overlay) {
                    overlay.classList.remove('active');
                    overlay.addEventListener('transitionend', () => {
                        overlay.remove();
                    }, { once: true });
                }
            }
            
            if (faqModal && !faqModal.classList.contains('hidden')) {
                faqModal.classList.add('hidden');
            }
        }
    });

    // Initialize WebSocket connection
    connectWebSocket();
});

// Add pagination event listeners
document.getElementById('prevPage').addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        updateUI();
    }
});

document.getElementById('nextPage').addEventListener('click', () => {
    const filteredAttempts = filterAttempts(attempts);
    const totalPages = Math.ceil(filteredAttempts.length / itemsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        updateUI();
    }
});

// Search and filter event listeners
searchInput.addEventListener('input', () => {
    currentPage = 1;
    updateUI();
});

filterSelect.addEventListener('change', () => {
    currentPage = 1;
    updateUI();
});

protocolSelect.addEventListener('change', () => {
    currentPage = 1;
    updateUI();
}); 
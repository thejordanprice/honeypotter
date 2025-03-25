// Modal handling
function openSystemStatusModal() {
    const modal = document.getElementById('systemStatusModal');
    modal.classList.remove('hidden');
    // Force a reflow before any animations
    modal.offsetHeight;
    
    // Close mobile menu if open
    const mobileMenu = document.getElementById('mobileMenu');
    if (mobileMenu) {
        mobileMenu.classList.add('hidden');
        const overlay = document.querySelector('.menu-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            overlay.addEventListener('transitionend', () => {
                overlay.remove();
            }, { once: true });
        }
    }
    
    // Debug the WebSocket state when opening modal
    console.log('WebSocket state when opening modal:', {
        exists: typeof window.socket !== 'undefined',
        value: window.socket,
        readyState: window.socket ? window.socket.readyState : 'N/A',
        readyStateText: window.socket ? 
            ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][window.socket.readyState] : 'N/A'
    });
    
    // Request system metrics update via WebSocket
    if (typeof window.socket !== 'undefined' && window.socket && window.socket.readyState === WebSocket.OPEN) {
        // Request system metrics
        window.socket.send(JSON.stringify({
            type: 'request_system_metrics'
        }));
        
        // Explicitly request external IP
        window.socket.send(JSON.stringify({
            type: 'request_external_ip'
        }));
    } else {
        console.log('WebSocket not available when opening status modal, using HTTP fallback');
        refreshExternalIP();  // Fall back to HTTP request for external IP
    }
}

function closeSystemStatusModal() {
    const modal = document.getElementById('systemStatusModal');
    const modalContent = modal.querySelector('div');
    
    // Start the slide out animation
    if (modalContent) {
        modalContent.style.transform = 'translateY(100%)';
        modalContent.style.opacity = '0';
    }
    
    // Wait for animation to complete before hiding
    setTimeout(() => {
        modal.classList.add('hidden');
        // Reset transform for next opening
        if (modalContent) {
            modalContent.style.transform = '';
            modalContent.style.opacity = '';
        }
    }, 400); // Match the CSS transition duration
}

// Format bytes to human readable format
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format uptime to human readable format
function formatUptime(seconds) {
    const days = Math.floor(seconds / (24 * 3600));
    const hours = Math.floor((seconds % (24 * 3600)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    
    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m ${remainingSeconds}s`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m ${remainingSeconds}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${remainingSeconds}s`;
    } else {
        return `${remainingSeconds}s`;
    }
}

// Function to update element with animation
function updateElementWithAnimation(elementId, newValue) {
    const element = document.getElementById(elementId);
    if (element && element.textContent !== newValue) {
        element.textContent = newValue;
        element.classList.remove('metric-update');
        void element.offsetWidth; // Trigger reflow
        element.classList.add('metric-update');
    }
}

// Process system metrics data received from WebSocket
function processSystemMetrics(data) {
    try {
        // Update CPU metrics
        if (data.cpu) {
            updateElementWithAnimation('cpuPercent', `${data.cpu.percent}%`);
            const cpuBar = document.getElementById('cpuBar');
            if (cpuBar) cpuBar.style.width = `${data.cpu.percent}%`;
        }
        
        // Update Memory metrics
        if (data.memory) {
            updateElementWithAnimation('memoryPercent', `${data.memory.percent}%`);
            const memoryBar = document.getElementById('memoryBar');
            if (memoryBar) memoryBar.style.width = `${data.memory.percent}%`;
        }
        
        // Update Disk metrics
        if (data.disk) {
            updateElementWithAnimation('diskPercent', `${data.disk.percent}%`);
            const diskBar = document.getElementById('diskBar');
            if (diskBar) diskBar.style.width = `${data.disk.percent}%`;
        }
        
        // Update Network metrics
        if (data.network) {
            updateElementWithAnimation('networkSent', formatBytes(data.network.bytes_sent));
            updateElementWithAnimation('networkReceived', formatBytes(data.network.bytes_recv));
            updateElementWithAnimation('networkConnections', data.network.connections.toString());
        }

        // Update Uptime
        if (data.uptime) {
            updateElementWithAnimation('systemUptime', formatUptime(data.uptime.seconds));
        }

        // Update System Load
        if (data.load) {
            updateElementWithAnimation('load1min', data.load['1min'].toFixed(2));
            updateElementWithAnimation('load5min', data.load['5min'].toFixed(2));
        }
    } catch (error) {
        console.error('Error processing system metrics:', error);
    }
}

// Process service status data received from WebSocket
function processServiceStatus(data) {
    try {
        const serviceStatus = document.getElementById('serviceStatus');
        if (!serviceStatus) return;

        // Service configurations
        const serviceConfigs = {
            ssh: { name: 'SSH', icon: '🔒' },
            telnet: { name: 'Telnet', icon: '🔌' },
            ftp: { name: 'FTP', icon: '📁' },
            smtp: { name: 'SMTP', icon: '📧' },
            rdp: { name: 'RDP', icon: '🖥️' },
            sip: { name: 'SIP', icon: '📞' },
            mysql: { name: 'MySQL', icon: '🗄️' }
        };

        // Create or update service elements
        Object.entries(serviceConfigs).forEach(([protocol, config]) => {
            const serviceData = data[protocol] || {};
            const isRunning = serviceData.running === true;
            
            // Look for existing service element
            let serviceElement = document.getElementById(`service-${protocol}`);
            
            if (!serviceElement) {
                // Create new service element if it doesn't exist
                serviceElement = document.createElement('div');
                serviceElement.id = `service-${protocol}`;
                serviceElement.className = 'bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700';
                serviceStatus.appendChild(serviceElement);
            }

            // Update the content with animation
            const oldStatus = serviceElement.getAttribute('data-status');
            const newStatus = isRunning ? 'running' : 'stopped';
            
            if (oldStatus !== newStatus) {
                serviceElement.classList.remove('metric-update');
                void serviceElement.offsetWidth; // Trigger reflow
                serviceElement.classList.add('metric-update');
            }

            serviceElement.setAttribute('data-status', newStatus);
            const statusColor = isRunning ? 'text-green-500 dark:text-green-500' : 'text-red-500 dark:text-red-500';
            const statusIcon = isRunning ? '●' : '○';

            serviceElement.innerHTML = `
                <div class="flex items-center justify-between mb-2.5">
                    <h4 class="font-medium text-gray-900 dark:text-white text-sm">${config.name}</h4>
                    <div class="flex items-center gap-1">
                        <span id="${protocol}Status" class="text-lg leading-none font-bold ${statusColor} metric-update">${statusIcon}</span>
                    </div>
                </div>
                <div class="space-y-2 text-[11px] font-medium">
                    <div class="flex items-center text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 rounded px-2 py-1">
                        <svg class="w-3 h-3 mr-1.5 flex-shrink-0 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span class="truncate">Port ${serviceData.port || 'N/A'}</span>
                    </div>
                </div>
            `;
        });
    } catch (error) {
        console.error('Error processing service status:', error);
    }
}

// Process external IP data received from WebSocket
function processExternalIP(data) {
    try {
        console.log('Received external IP data:', data);
        const ipElement = document.getElementById('externalIP');
        if (ipElement) {
            let ipValue;
            
            // Handle different possible data structures
            if (typeof data === 'string') {
                ipValue = data;
            } else if (data && typeof data === 'object') {
                // If it's an object with ip property
                ipValue = data.ip || 'Unknown';
            } else {
                ipValue = 'Unknown';
            }
            
            console.log('Using IP value:', ipValue);
            ipElement.textContent = ipValue;
            ipElement.classList.remove('metric-update');
            void ipElement.offsetWidth; // Trigger reflow
            ipElement.classList.add('metric-update');
        }
    } catch (error) {
        console.error('Error processing external IP:', error);
        // Set a fallback value in case of error
        const ipElement = document.getElementById('externalIP');
        if (ipElement) {
            ipElement.textContent = 'Error fetching IP';
        }
    }
}

// Request external IP update
function refreshExternalIP() {
    const ipElement = document.getElementById('externalIP');
    if (ipElement) {
        ipElement.textContent = 'Refreshing...';
    }
    
    // Debug the WebSocket state
    console.log('WebSocket state:', {
        exists: typeof window.socket !== 'undefined',
        value: window.socket,
        readyState: window.socket ? window.socket.readyState : 'N/A',
        readyStateText: window.socket ? 
            ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][window.socket.readyState] : 'N/A'
    });
    
    // First try WebSocket if it's available
    if (typeof window.socket !== 'undefined' && window.socket && window.socket.readyState === WebSocket.OPEN) {
        console.log('Requesting external IP refresh via WebSocket');
        window.socket.send(JSON.stringify({
            type: 'request_external_ip'
        }));
    } else {
        console.log('WebSocket not available, falling back to HTTP request');
        // Fall back to HTTP request
        fetch('/api/system/external-ip')
            .then(response => response.json())
            .then(data => {
                console.log('Fetched external IP via HTTP fallback:', data);
                if (ipElement && data && data.ip) {
                    ipElement.textContent = data.ip;
                    ipElement.classList.remove('metric-update');
                    void ipElement.offsetWidth; // Trigger reflow
                    ipElement.classList.add('metric-update');
                }
            })
            .catch(error => {
                console.error('Error fetching external IP via HTTP fallback:', error);
                if (ipElement) {
                    ipElement.textContent = 'Try again later';
                }
            });
    }
}

// Initialize system monitoring
document.addEventListener('DOMContentLoaded', function() {
    const systemStatusModal = document.getElementById('systemStatusModal');
    const systemStatusButton = document.getElementById('systemStatusButton');
    const closeSystemStatusModalBtn = document.getElementById('closeSystemStatusModal');
    const refreshIPBtn = document.getElementById('refreshIP');

    // Modal event listeners
    if (systemStatusButton) {
        systemStatusButton.addEventListener('click', openSystemStatusModal);
    }

    if (closeSystemStatusModalBtn) {
        closeSystemStatusModalBtn.addEventListener('click', closeSystemStatusModal);
    }

    if (systemStatusModal) {
        systemStatusModal.addEventListener('click', (e) => {
            if (e.target === systemStatusModal) {
                closeSystemStatusModal();
            }
        });
    }

    // Refresh IP button listener
    if (refreshIPBtn) {
        console.log('Attaching click handler to refresh IP button');
        refreshIPBtn.addEventListener('click', function() {
            console.log('Refresh IP button clicked');
            refreshExternalIP();
        });
    } else {
        console.warn('Refresh IP button not found in the DOM');
    }
}); 
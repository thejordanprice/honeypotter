// Modal handling
function openSystemStatusModal() {
    const modal = domUtils.getElement('systemStatusModal');
    if (!modal) return;
    
    domUtils.removeClass(modal, 'hidden');
    // Force a reflow before any animations
    domUtils.forceReflow(modal);
    
    // Close mobile menu if open
    const mobileMenu = domUtils.getElement('mobileMenu');
    if (mobileMenu) {
        domUtils.addClass(mobileMenu, 'hidden');
        const overlay = document.querySelector('.menu-overlay');
        if (overlay) {
            domUtils.removeClass(overlay, 'active');
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
    const modal = domUtils.getElement('systemStatusModal');
    if (!modal) return;
    
    const modalContent = modal.querySelector('div');
    
    // Start the slide out animation
    if (modalContent) {
        modalContent.style.transform = 'translateY(100%)';
        modalContent.style.opacity = '0';
    }
    
    // Wait for animation to complete before hiding
    setTimeout(() => {
        domUtils.addClass(modal, 'hidden');
        // Reset transform for next opening
        if (modalContent) {
            modalContent.style.transform = '';
            modalContent.style.opacity = '';
        }
    }, 400); // Match the CSS transition duration
}

// Process system metrics data received from WebSocket
function processSystemMetrics(data) {
    try {
        // Update CPU metrics
        if (data.cpu) {
            animationUtils.updateElementWithAnimation('cpuPercent', `${data.cpu.percent}%`);
            const cpuBar = domUtils.getElement('cpuBar');
            if (cpuBar) cpuBar.style.width = `${data.cpu.percent}%`;
        }
        
        // Update Memory metrics
        if (data.memory) {
            animationUtils.updateElementWithAnimation('memoryPercent', `${data.memory.percent}%`);
            const memoryBar = domUtils.getElement('memoryBar');
            if (memoryBar) memoryBar.style.width = `${data.memory.percent}%`;
        }
        
        // Update Disk metrics
        if (data.disk) {
            animationUtils.updateElementWithAnimation('diskPercent', `${data.disk.percent}%`);
            const diskBar = domUtils.getElement('diskBar');
            if (diskBar) diskBar.style.width = `${data.disk.percent}%`;
        }
        
        // Update Network metrics
        if (data.network) {
            animationUtils.updateElementWithAnimation('networkSent', formatUtils.formatBytes(data.network.bytes_sent));
            animationUtils.updateElementWithAnimation('networkReceived', formatUtils.formatBytes(data.network.bytes_recv));
            animationUtils.updateElementWithAnimation('networkConnections', data.network.connections.toString());
        }

        // Update Uptime
        if (data.uptime) {
            animationUtils.updateElementWithAnimation('systemUptime', formatUtils.formatUptime(data.uptime.seconds));
        }

        // Update System Load
        if (data.load) {
            animationUtils.updateElementWithAnimation('load1min', data.load['1min'].toFixed(2));
            animationUtils.updateElementWithAnimation('load5min', data.load['5min'].toFixed(2));
        }
    } catch (error) {
        console.error('Error processing system metrics:', error);
    }
}

// Process service status data received from WebSocket
function processServiceStatus(data) {
    try {
        const serviceStatus = domUtils.getElement('serviceStatus');
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
            let serviceElement = domUtils.getElement(`service-${protocol}`);
            
            if (!serviceElement) {
                // Create new service element if it doesn't exist
                serviceElement = document.createElement('div');
                serviceElement.id = `service-${protocol}`;
                serviceElement.className = 'bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 shadow-sm';
                serviceStatus.appendChild(serviceElement);
            }

            // Update the content with animation
            const oldStatus = serviceElement.getAttribute('data-status');
            const newStatus = isRunning ? 'running' : 'stopped';
            
            if (oldStatus !== newStatus) {
                domUtils.removeClass(serviceElement, 'metric-update');
                domUtils.forceReflow(serviceElement); // Trigger reflow
                domUtils.addClass(serviceElement, 'metric-update');
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
                <div class="text-center text-[11px] font-medium">
                    <div class="bg-white dark:bg-gray-700 rounded p-2 text-gray-600 dark:text-gray-300">
                        Port ${serviceData.port || 'N/A'}
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
        const ipElement = domUtils.getElement('externalIP');
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
            domUtils.removeClass(ipElement, 'metric-update');
            domUtils.forceReflow(ipElement); // Trigger reflow
            domUtils.addClass(ipElement, 'metric-update');
        }
    } catch (error) {
        console.error('Error processing external IP:', error);
        // Set a fallback value in case of error
        const ipElement = domUtils.getElement('externalIP');
        if (ipElement) {
            ipElement.textContent = 'Error fetching IP';
        }
    }
}

// Manual refresh of external IP via HTTP request
function refreshExternalIP() {
    fetch('/api/external_ip')
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            console.log('HTTP response for external IP:', data);
            processExternalIP(data);
        })
        .catch(error => {
            console.error('Error fetching external IP:', error);
            const ipElement = domUtils.getElement('externalIP');
            if (ipElement) {
                ipElement.textContent = 'Error fetching IP';
            }
        });
}

// Handle clicking the refresh button for external IP
document.addEventListener('DOMContentLoaded', function() {
    const refreshIPButton = document.getElementById('refreshIP');
    if (refreshIPButton) {
        refreshIPButton.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Visual feedback
            this.classList.add('animate-spin');
            
            // Try WebSocket first
            if (typeof window.socket !== 'undefined' && window.socket && window.socket.readyState === WebSocket.OPEN) {
                window.socket.send(JSON.stringify({
                    type: 'request_external_ip'
                }));
                
                // Stop spinning after a short delay
                setTimeout(() => {
                    this.classList.remove('animate-spin');
                }, 500);
            } else {
                // Fall back to HTTP request
                refreshExternalIP();
                
                // Stop spinning after HTTP request completes (or after 2s as a fallback)
                setTimeout(() => {
                    this.classList.remove('animate-spin');
                }, 2000);
            }
        });
    }
    
    // Add listener for the system status button
    const systemStatusButton = document.getElementById('systemStatusButton');
    if (systemStatusButton) {
        systemStatusButton.addEventListener('click', function() {
            openSystemStatusModal();
        });
    }
    
    // Add listener for closing the system status modal
    const closeSystemStatusButton = document.getElementById('closeSystemStatusModal');
    if (closeSystemStatusButton) {
        closeSystemStatusButton.addEventListener('click', function() {
            closeSystemStatusModal();
        });
    }
    
    // Add listener for closing the system status modal when clicking outside
    const systemStatusModal = document.getElementById('systemStatusModal');
    if (systemStatusModal) {
        systemStatusModal.addEventListener('click', function(e) {
            if (e.target === systemStatusModal) {
                closeSystemStatusModal();
            }
        });
    }
}); 
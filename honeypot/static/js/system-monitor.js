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
    // Force an immediate update when opening the modal
    updateSystemMetrics();
    updateServiceStatus();
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

// Function to update system metrics with animation
function updateMetricWithAnimation(elementId, newValue) {
    const element = document.getElementById(elementId);
    const currentValue = parseFloat(element.textContent) || 0;
    
    if (currentValue !== newValue) {
        element.textContent = `${newValue}%`;
        element.classList.remove('metric-update');
        void element.offsetWidth; // Trigger reflow
        element.classList.add('metric-update');
    }
}

// Update system metrics
function updateSystemMetrics() {
    fetch('/api/system/metrics')
        .then(response => response.json())
        .then(data => {
            // Update CPU usage with animation
            updateMetricWithAnimation('cpuPercent', data.cpu.percent.toFixed(1));
            document.getElementById('cpuBar').style.width = `${data.cpu.percent}%`;
            
            // Update memory usage with animation
            updateMetricWithAnimation('memoryPercent', data.memory.percent.toFixed(1));
            document.getElementById('memoryBar').style.width = `${data.memory.percent}%`;
            
            // Update disk usage with animation
            updateMetricWithAnimation('diskPercent', data.disk.percent.toFixed(1));
            document.getElementById('diskBar').style.width = `${data.disk.percent}%`;
            
            // Update network stats
            document.getElementById('networkSent').textContent = formatBytes(data.network.bytes_sent);
            document.getElementById('networkReceived').textContent = formatBytes(data.network.bytes_recv);
        })
        .catch(error => {
            console.error('Error fetching system metrics:', error);
        });
}

// Update service status
function updateServiceStatus() {
    fetch('/api/system/services')
        .then(response => response.json())
        .then(data => {
            const serviceStatus = document.getElementById('serviceStatus');
            serviceStatus.innerHTML = '';

            const serviceConfigs = {
                ssh: { name: 'SSH', icon: '🔒' },
                telnet: { name: 'Telnet', icon: '🔌' },
                ftp: { name: 'FTP', icon: '📁' },
                smtp: { name: 'SMTP', icon: '📧' },
                rdp: { name: 'RDP', icon: '🖥️' },
                sip: { name: 'SIP', icon: '📞' },
                mysql: { name: 'MySQL', icon: '🗄️' }
            };

            Object.entries(serviceConfigs).forEach(([protocol, config]) => {
                const serviceData = data[protocol] || {};
                const isRunning = serviceData.running === true;
                const statusColor = isRunning ? 'text-green-500 dark:text-green-500' : 'text-red-500 dark:text-red-500';
                const statusIcon = isRunning ? '●' : '○';
                
                const serviceElement = document.createElement('div');
                serviceElement.className = 'bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700';
                serviceElement.innerHTML = `
                    <div class="flex items-center justify-between mb-2.5">
                        <h4 class="font-medium text-gray-900 dark:text-white text-sm">${config.name}</h4>
                        <div class="flex items-center gap-1">
                            <span class="text-lg leading-none font-bold ${statusColor}">${statusIcon}</span>
                        </div>
                    </div>
                    <div class="space-y-2 text-[11px] font-medium">
                        <div class="flex items-center text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 rounded px-2 py-1">
                            <svg class="w-3 h-3 mr-1.5 flex-shrink-0 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span class="truncate">Port ${serviceData.port || 'N/A'}</span>
                        </div>
                        
                        <div class="flex items-center text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 rounded px-2 py-1">
                            <svg class="w-3 h-3 mr-1.5 flex-shrink-0 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                            <span class="truncate">PID ${serviceData.pid || 'N/A'}</span>
                        </div>
                    </div>
                `;
                serviceStatus.appendChild(serviceElement);
            });
        })
        .catch(error => console.error('Error fetching service status:', error));
}

// Initialize system monitoring
document.addEventListener('DOMContentLoaded', function() {
    const systemStatusModal = document.getElementById('systemStatusModal');
    const systemStatusButton = document.getElementById('systemStatusButton');
    const closeSystemStatusModalBtn = document.getElementById('closeSystemStatusModal');

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

    // Initial updates
    updateSystemMetrics();
    updateServiceStatus();
    
    // Set up periodic updates
    setInterval(updateSystemMetrics, 5000); // Every 5 seconds
    setInterval(updateServiceStatus, 10000); // Every 10 seconds
}); 
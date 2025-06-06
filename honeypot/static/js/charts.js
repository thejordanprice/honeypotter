// Initialize chart configurations
const attemptsChart = new Chart(
    document.getElementById('attemptsChart'),
    {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'SSH',
                    data: [],
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Telnet',
                    data: [],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'FTP',
                    data: [],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'SMTP',
                    data: [],
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'RDP',
                    data: [],
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'SIP',
                    data: [],
                    borderColor: '#ec4899',
                    backgroundColor: 'rgba(236, 72, 153, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'MySQL',
                    data: [],
                    borderColor: '#14b8a6',
                    backgroundColor: 'rgba(20, 184, 166, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        color: document.documentElement.classList.contains('dark') ? '#9ca3af' : '#1f2937'
                    },
                    grid: {
                        color: document.documentElement.classList.contains('dark') ? '#374151' : '#e5e7eb'
                    }
                },
                x: {
                    ticks: {
                        color: document.documentElement.classList.contains('dark') ? '#9ca3af' : '#1f2937'
                    },
                    grid: {
                        color: document.documentElement.classList.contains('dark') ? '#374151' : '#e5e7eb'
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        color: document.documentElement.classList.contains('dark') ? '#9ca3af' : '#1f2937',
                        boxWidth: 8,
                        boxHeight: 8,
                        padding: 8,
                        font: {
                            size: 11
                        }
                    }
                },
                title: {
                    display: false
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        }
    }
);

const usernamesChart = new Chart(
    document.getElementById('usernamesChart'),
    {
        type: 'bar',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'SSH',
                    data: [],
                    backgroundColor: '#ef4444'
                },
                {
                    label: 'Telnet',
                    data: [],
                    backgroundColor: '#3b82f6'
                },
                {
                    label: 'FTP',
                    data: [],
                    backgroundColor: '#10b981'
                },
                {
                    label: 'SMTP',
                    data: [],
                    backgroundColor: '#f59e0b'
                },
                {
                    label: 'RDP',
                    data: [],
                    backgroundColor: '#8b5cf6'
                },
                {
                    label: 'SIP',
                    data: [],
                    backgroundColor: '#ec4899'
                },
                {
                    label: 'MySQL',
                    data: [],
                    backgroundColor: '#14b8a6'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    stacked: true,
                    ticks: {
                        stepSize: 1,
                        color: document.documentElement.classList.contains('dark') ? '#9ca3af' : '#1f2937'
                    },
                    grid: {
                        color: document.documentElement.classList.contains('dark') ? '#374151' : '#e5e7eb'
                    }
                },
                x: {
                    stacked: true,
                    ticks: {
                        color: document.documentElement.classList.contains('dark') ? '#9ca3af' : '#1f2937'
                    },
                    grid: {
                        color: document.documentElement.classList.contains('dark') ? '#374151' : '#e5e7eb'
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: {
                        color: document.documentElement.classList.contains('dark') ? '#9ca3af' : '#1f2937',
                        boxWidth: 8,
                        boxHeight: 8,
                        padding: 8,
                        font: {
                            size: 11
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label}: ${context.raw}`;
                        }
                    }
                }
            }
        }
    }
);

const ipsChart = new Chart(
    document.getElementById('ipsChart'),
    {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: document.documentElement.classList.contains('dark')
                    ? 'rgba(167, 139, 250, 0.8)'
                    : 'rgba(109, 40, 217, 0.8)',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: document.documentElement.classList.contains('dark') ? '#9ca3af' : '#1f2937'
                    },
                    grid: {
                        color: document.documentElement.classList.contains('dark') ? '#374151' : '#e5e7eb'
                    }
                },
                x: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        color: document.documentElement.classList.contains('dark') ? '#9ca3af' : '#1f2937'
                    },
                    grid: {
                        color: document.documentElement.classList.contains('dark') ? '#374151' : '#e5e7eb'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Attempts: ${context.raw}`;
                        }
                    }
                }
            }
        }
    }
);

const countriesChart = new Chart(
    document.getElementById('countriesChart'),
    {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: document.documentElement.classList.contains('dark')
                    ? 'rgba(96, 165, 250, 0.8)'
                    : 'rgba(37, 99, 235, 0.8)',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: document.documentElement.classList.contains('dark') ? '#9ca3af' : '#1f2937'
                    },
                    grid: {
                        color: document.documentElement.classList.contains('dark') ? '#374151' : '#e5e7eb'
                    }
                },
                x: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        color: document.documentElement.classList.contains('dark') ? '#9ca3af' : '#1f2937'
                    },
                    grid: {
                        color: document.documentElement.classList.contains('dark') ? '#374151' : '#e5e7eb'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Attempts: ${context.raw}`;
                        }
                    }
                }
            }
        }
    }
);

// Function to update chart colors when theme changes
function updateChartColors(chart, isDark, textColor, gridColor) {
    // Update scales colors
    chart.options.scales.x.ticks.color = isDark ? '#9ca3af' : '#1f2937';  // Dimmer text in dark mode
    chart.options.scales.y.ticks.color = isDark ? '#9ca3af' : '#1f2937';  // Dimmer text in dark mode
    chart.options.scales.x.grid.color = isDark ? '#374151' : '#e5e7eb';   // Lighter grid lines in dark mode
    chart.options.scales.y.grid.color = isDark ? '#374151' : '#e5e7eb';   // Lighter grid lines in dark mode
    
    // Update legend colors if present
    if (chart.options.plugins.legend.display) {
        chart.options.plugins.legend.labels.color = isDark ? '#9ca3af' : '#1f2937';  // Dimmer text in dark mode
    }
    
    // Update dataset colors based on chart type
    if (chart === attemptsChart) {
        chart.data.datasets[0].borderColor = isDark ? '#ef4444' : '#ef4444';
        chart.data.datasets[1].borderColor = isDark ? '#3b82f6' : '#3b82f6';
        chart.data.datasets[2].borderColor = isDark ? '#10b981' : '#10b981';
        chart.data.datasets[3].borderColor = isDark ? '#f59e0b' : '#f59e0b';
        chart.data.datasets[4].borderColor = isDark ? '#8b5cf6' : '#8b5cf6';
        chart.data.datasets[5].borderColor = isDark ? '#ec4899' : '#ec4899';
        chart.data.datasets[6].borderColor = isDark ? '#14b8a6' : '#14b8a6';
    } else if (chart === usernamesChart) {
        chart.data.datasets[0].backgroundColor = isDark ? '#ef4444' : '#ef4444';
        chart.data.datasets[1].backgroundColor = isDark ? '#3b82f6' : '#3b82f6';
        chart.data.datasets[2].backgroundColor = isDark ? '#10b981' : '#10b981';
        chart.data.datasets[3].backgroundColor = isDark ? '#f59e0b' : '#f59e0b';
        chart.data.datasets[4].backgroundColor = isDark ? '#8b5cf6' : '#8b5cf6';
        chart.data.datasets[5].backgroundColor = isDark ? '#ec4899' : '#ec4899';
        chart.data.datasets[6].backgroundColor = isDark ? '#14b8a6' : '#14b8a6';
    } else if (chart === ipsChart) {
        chart.data.datasets[0].backgroundColor = isDark ? 'rgba(167, 139, 250, 0.8)' : 'rgba(109, 40, 217, 0.8)';
    } else if (chart === countriesChart) {
        chart.data.datasets[0].backgroundColor = isDark ? 'rgba(96, 165, 250, 0.8)' : 'rgba(37, 99, 235, 0.8)';
    }
    
    chart.update();
}

// Apply dark mode colors on page load if dark mode is enabled
document.addEventListener('DOMContentLoaded', () => {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
        updateChartColors(attemptsChart, true);
        updateChartColors(usernamesChart, true);
        updateChartColors(ipsChart, true);
        updateChartColors(countriesChart, true);
    }
});

function updateUsernameChart(filteredAttempts) {
    const usernameData = {};
    filteredAttempts.forEach(attempt => {
        if (!usernameData[attempt.username]) {
            usernameData[attempt.username] = { ssh: 0, telnet: 0, ftp: 0, smtp: 0, rdp: 0, sip: 0, mysql: 0 };
        }
        usernameData[attempt.username][attempt.protocol]++;
    });

    const topUsernames = Object.entries(usernameData)
        .sort((a, b) => (b[1].ssh + b[1].telnet + b[1].ftp + b[1].smtp + b[1].rdp + b[1].sip + b[1].mysql) - 
                        (a[1].ssh + a[1].telnet + a[1].ftp + a[1].smtp + a[1].rdp + a[1].sip + a[1].mysql))
        .slice(0, 5);

    usernamesChart.data.labels = topUsernames.map(([username]) => username);
    usernamesChart.data.datasets[0].data = topUsernames.map(([, counts]) => counts.ssh);
    usernamesChart.data.datasets[1].data = topUsernames.map(([, counts]) => counts.telnet);
    usernamesChart.data.datasets[2].data = topUsernames.map(([, counts]) => counts.ftp);
    usernamesChart.data.datasets[3].data = topUsernames.map(([, counts]) => counts.smtp);
    usernamesChart.data.datasets[4].data = topUsernames.map(([, counts]) => counts.rdp);
    usernamesChart.data.datasets[5].data = topUsernames.map(([, counts]) => counts.sip);
    usernamesChart.data.datasets[6].data = topUsernames.map(([, counts]) => counts.mysql);
    usernamesChart.update();
} 
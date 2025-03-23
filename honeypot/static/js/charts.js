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
                    borderColor: document.documentElement.classList.contains('dark') 
                        ? 'rgba(167, 139, 250, 0.8)'
                        : '#6d28d9',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    tension: 0.3
                },
                {
                    label: 'Telnet',
                    data: [],
                    borderColor: document.documentElement.classList.contains('dark')
                        ? 'rgba(96, 165, 250, 0.8)'
                        : '#2563eb',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    tension: 0.3
                },
                {
                    label: 'FTP',
                    data: [],
                    borderColor: document.documentElement.classList.contains('dark')
                        ? 'rgba(52, 211, 153, 0.8)'
                        : '#059669',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    tension: 0.3
                },
                {
                    label: 'SMTP',
                    data: [],
                    borderColor: document.documentElement.classList.contains('dark')
                        ? 'rgba(251, 191, 36, 0.8)'
                        : '#d97706',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    tension: 0.3
                },
                {
                    label: 'RDP',
                    data: [],
                    borderColor: document.documentElement.classList.contains('dark')
                        ? 'rgba(244, 114, 182, 0.8)'
                        : '#db2777',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    tension: 0.3
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
                        color: document.documentElement.classList.contains('dark') ? '#9ca3af' : '#1f2937'
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
                    backgroundColor: document.documentElement.classList.contains('dark')
                        ? 'rgba(167, 139, 250, 0.8)'
                        : 'rgba(109, 40, 217, 0.8)',
                    borderRadius: 4
                },
                {
                    label: 'Telnet',
                    data: [],
                    backgroundColor: document.documentElement.classList.contains('dark')
                        ? 'rgba(96, 165, 250, 0.8)'
                        : 'rgba(37, 99, 235, 0.8)',
                    borderRadius: 4
                },
                {
                    label: 'FTP',
                    data: [],
                    backgroundColor: document.documentElement.classList.contains('dark')
                        ? 'rgba(52, 211, 153, 0.8)'
                        : 'rgba(5, 150, 105, 0.8)',
                    borderRadius: 4
                },
                {
                    label: 'SMTP',
                    data: [],
                    backgroundColor: document.documentElement.classList.contains('dark')
                        ? 'rgba(251, 191, 36, 0.8)'
                        : 'rgba(217, 119, 6, 0.8)',
                    borderRadius: 4
                },
                {
                    label: 'RDP',
                    data: [],
                    backgroundColor: document.documentElement.classList.contains('dark')
                        ? 'rgba(244, 114, 182, 0.8)'
                        : 'rgba(219, 39, 119, 0.8)',
                    borderRadius: 4
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
                        color: document.documentElement.classList.contains('dark') ? '#9ca3af' : '#1f2937'
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
        chart.data.datasets[0].borderColor = isDark ? 'rgba(167, 139, 250, 0.8)' : '#6d28d9';  // Brighter purple
        chart.data.datasets[1].borderColor = isDark ? 'rgba(96, 165, 250, 0.8)' : '#2563eb';    // Brighter blue
        chart.data.datasets[2].borderColor = isDark ? 'rgba(52, 211, 153, 0.8)' : '#059669';    // Brighter green
        chart.data.datasets[3].borderColor = isDark ? 'rgba(251, 191, 36, 0.8)' : '#d97706';    // Brighter yellow
        chart.data.datasets[4].borderColor = isDark ? 'rgba(244, 114, 182, 0.8)' : '#db2777';   // Brighter pink
    } else if (chart === usernamesChart) {
        chart.data.datasets[0].backgroundColor = isDark ? 'rgba(167, 139, 250, 0.8)' : 'rgba(109, 40, 217, 0.8)';
        chart.data.datasets[1].backgroundColor = isDark ? 'rgba(96, 165, 250, 0.8)' : 'rgba(37, 99, 235, 0.8)';
        chart.data.datasets[2].backgroundColor = isDark ? 'rgba(52, 211, 153, 0.8)' : 'rgba(5, 150, 105, 0.8)';
        chart.data.datasets[3].backgroundColor = isDark ? 'rgba(251, 191, 36, 0.8)' : 'rgba(217, 119, 6, 0.8)';
        chart.data.datasets[4].backgroundColor = isDark ? 'rgba(244, 114, 182, 0.8)' : 'rgba(219, 39, 119, 0.8)';
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
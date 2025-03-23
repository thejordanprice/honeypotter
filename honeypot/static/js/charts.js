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
                        ? 'rgba(139, 92, 246, 0.7)'
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
                        ? 'rgba(59, 130, 246, 0.7)'
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
                        ? 'rgba(16, 185, 129, 0.7)'
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
                        ? 'rgba(245, 158, 11, 0.7)'
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
                        ? 'rgba(236, 72, 153, 0.7)'
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
                        color: document.documentElement.classList.contains('dark') ? '#f3f4f6' : '#1f2937'
                    },
                    grid: {
                        color: document.documentElement.classList.contains('dark') ? '#374151' : '#e5e7eb'
                    }
                },
                x: {
                    ticks: {
                        color: document.documentElement.classList.contains('dark') ? '#f3f4f6' : '#1f2937'
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
                        color: document.documentElement.classList.contains('dark') ? '#f3f4f6' : '#1f2937'
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
                        ? 'rgba(139, 92, 246, 0.8)'
                        : 'rgba(109, 40, 217, 0.8)',
                    borderRadius: 4
                },
                {
                    label: 'Telnet',
                    data: [],
                    backgroundColor: document.documentElement.classList.contains('dark')
                        ? 'rgba(59, 130, 246, 0.8)'
                        : 'rgba(37, 99, 235, 0.8)',
                    borderRadius: 4
                },
                {
                    label: 'FTP',
                    data: [],
                    backgroundColor: document.documentElement.classList.contains('dark')
                        ? 'rgba(16, 185, 129, 0.8)'
                        : 'rgba(5, 150, 105, 0.8)',
                    borderRadius: 4
                },
                {
                    label: 'SMTP',
                    data: [],
                    backgroundColor: document.documentElement.classList.contains('dark')
                        ? 'rgba(245, 158, 11, 0.8)'
                        : 'rgba(217, 119, 6, 0.8)',
                    borderRadius: 4
                },
                {
                    label: 'RDP',
                    data: [],
                    backgroundColor: document.documentElement.classList.contains('dark')
                        ? 'rgba(236, 72, 153, 0.8)'
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
                        color: document.documentElement.classList.contains('dark') ? '#f3f4f6' : '#1f2937'
                    },
                    grid: {
                        color: document.documentElement.classList.contains('dark') ? '#374151' : '#e5e7eb'
                    }
                },
                x: {
                    stacked: true,
                    ticks: {
                        color: document.documentElement.classList.contains('dark') ? '#f3f4f6' : '#1f2937'
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
                        color: document.documentElement.classList.contains('dark') ? '#f3f4f6' : '#1f2937'
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
                    ? 'rgba(139, 92, 246, 0.8)'
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
                        color: document.documentElement.classList.contains('dark') ? '#f3f4f6' : '#1f2937'
                    },
                    grid: {
                        color: document.documentElement.classList.contains('dark') ? '#374151' : '#e5e7eb'
                    }
                },
                x: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        color: document.documentElement.classList.contains('dark') ? '#f3f4f6' : '#1f2937'
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
                    ? 'rgba(59, 130, 246, 0.8)'
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
                        color: document.documentElement.classList.contains('dark') ? '#f3f4f6' : '#1f2937'
                    },
                    grid: {
                        color: document.documentElement.classList.contains('dark') ? '#374151' : '#e5e7eb'
                    }
                },
                x: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        color: document.documentElement.classList.contains('dark') ? '#f3f4f6' : '#1f2937'
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
    chart.options.scales.x.ticks.color = textColor;
    chart.options.scales.y.ticks.color = textColor;
    chart.options.scales.x.grid.color = gridColor;
    chart.options.scales.y.grid.color = gridColor;
    
    // Update legend colors if present
    if (chart.options.plugins.legend.display) {
        chart.options.plugins.legend.labels.color = textColor;
    }
    
    // Update dataset colors based on chart type
    if (chart === attemptsChart) {
        chart.data.datasets[0].borderColor = isDark ? 'rgba(139, 92, 246, 0.7)' : '#6d28d9';
        chart.data.datasets[1].borderColor = isDark ? 'rgba(59, 130, 246, 0.7)' : '#2563eb';
        chart.data.datasets[2].borderColor = isDark ? 'rgba(16, 185, 129, 0.7)' : '#059669';
        chart.data.datasets[3].borderColor = isDark ? 'rgba(245, 158, 11, 0.7)' : '#d97706';
        chart.data.datasets[4].borderColor = isDark ? 'rgba(236, 72, 153, 0.7)' : '#db2777';
    } else if (chart === usernamesChart) {
        chart.data.datasets[0].backgroundColor = isDark ? 'rgba(139, 92, 246, 0.6)' : 'rgba(109, 40, 217, 0.8)';
        chart.data.datasets[1].backgroundColor = isDark ? 'rgba(59, 130, 246, 0.6)' : 'rgba(37, 99, 235, 0.8)';
        chart.data.datasets[2].backgroundColor = isDark ? 'rgba(16, 185, 129, 0.6)' : 'rgba(5, 150, 105, 0.8)';
        chart.data.datasets[3].backgroundColor = isDark ? 'rgba(245, 158, 11, 0.6)' : 'rgba(217, 119, 6, 0.8)';
        chart.data.datasets[4].backgroundColor = isDark ? 'rgba(236, 72, 153, 0.6)' : 'rgba(219, 39, 119, 0.8)';
    } else if (chart === ipsChart) {
        chart.data.datasets[0].backgroundColor = isDark ? 'rgba(139, 92, 246, 0.6)' : 'rgba(109, 40, 217, 0.8)';
    } else if (chart === countriesChart) {
        chart.data.datasets[0].backgroundColor = isDark ? 'rgba(59, 130, 246, 0.6)' : 'rgba(37, 99, 235, 0.8)';
    }
    
    chart.update();
} 
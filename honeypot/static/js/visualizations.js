// Helper functions for date formatting
function formatDate(date) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatHour(hour) {
    const h = hour % 12 || 12;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${h}${ampm}`;
}

function formatTimeWithMinutes(hour, minutes) {
    const h = hour % 12 || 12;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    return `${h}:${minutes.toString().padStart(2, '0')}${ampm}`;
}

// Add flag to track initial load
let isInitialLoad = true;

function updateVisualizations(filteredAttempts) {
    // Clear existing heatmap layer
    if (heatLayer) {
        map.removeLayer(heatLayer);
    }

    // Update map with all filtered attempts
    if (filteredAttempts.length > 0) {
        // Get all attempts with valid coordinates
        const validAttempts = filteredAttempts.filter(a => a.latitude && a.longitude);
        
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
    
    // Only center map on initial load
    if (isInitialLoad) {
        centerMapOnMostActiveRegion(filteredAttempts);
        isInitialLoad = false;
    }

    // Get current time and filter value
    const now = new Date();
    const filterValue = filterSelect.value;
    
    // Initialize arrays for protocol data
    let timeLabels = [];
    let sshData = [];
    let telnetData = [];
    let ftpData = [];
    let smtpData = [];
    let rdpData = [];
    let sipData = [];
    let mysqlData = [];

    // Sort attempts by timestamp
    const sortedAttempts = [...filteredAttempts].sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
    );

    // Update time-based data based on filter
    if (filterValue === 'lastHour') {
        updateLastHourData(sortedAttempts, now, timeLabels, sshData, telnetData, ftpData, smtpData, rdpData, sipData, mysqlData);
    } else if (filterValue === 'today') {
        updateTodayData(sortedAttempts, now, timeLabels, sshData, telnetData, ftpData, smtpData, rdpData, sipData, mysqlData);
    } else if (filterValue === 'thisWeek') {
        updateThisWeekData(sortedAttempts, now, timeLabels, sshData, telnetData, ftpData, smtpData, rdpData, sipData, mysqlData);
    } else {
        updateAllTimeData(sortedAttempts, now, timeLabels, sshData, telnetData, ftpData, smtpData, rdpData, sipData, mysqlData);
    }

    // Update the attempts chart
    updateAttemptsChart(timeLabels, sshData, telnetData, ftpData, smtpData, rdpData, sipData, mysqlData);

    // Update username distribution chart
    updateUsernameChart(filteredAttempts);

    // Update IP addresses chart
    updateIPChart(filteredAttempts);

    // Update countries chart
    updateCountryChart(filteredAttempts);
}

function updateLastHourData(sortedAttempts, now, timeLabels, sshData, telnetData, ftpData, smtpData, rdpData, sipData, mysqlData) {
    const intervals = 12; // 5-minute intervals
    const currentMinute = now.getMinutes();
    const startMinute = currentMinute - (currentMinute % 5); // Round down to nearest 5
    
    for (let i = 0; i < intervals; i++) {
        const d = new Date(now);
        d.setMinutes(startMinute - ((intervals - 1 - i) * 5));
        timeLabels.push(formatTimeWithMinutes(d.getHours(), d.getMinutes()));
    }
    
    sshData.length = intervals;
    telnetData.length = intervals;
    ftpData.length = intervals;
    smtpData.length = intervals;
    rdpData.length = intervals;
    sipData.length = intervals;
    mysqlData.length = intervals;
    sshData.fill(0);
    telnetData.fill(0);
    ftpData.fill(0);
    smtpData.fill(0);
    rdpData.fill(0);
    sipData.fill(0);
    mysqlData.fill(0);

    sortedAttempts.forEach(attempt => {
        const date = new Date(attempt.timestamp + 'Z');
        const minutesAgo = Math.floor((now - date) / (1000 * 60));
        if (minutesAgo <= 60) {
            const intervalIndex = Math.floor((60 - minutesAgo) / 5);
            if (intervalIndex >= 0 && intervalIndex < intervals) {
                incrementProtocolData(attempt.protocol, intervalIndex, sshData, telnetData, ftpData, smtpData, rdpData, sipData, mysqlData);
            }
        }
    });
}

function updateTodayData(sortedAttempts, now, timeLabels, sshData, telnetData, ftpData, smtpData, rdpData, sipData, mysqlData) {
    const currentHour = now.getHours();
    for (let i = 0; i <= currentHour; i++) {
        timeLabels.push(formatHour(i));
    }
    
    sshData.length = currentHour + 1;
    telnetData.length = currentHour + 1;
    ftpData.length = currentHour + 1;
    smtpData.length = currentHour + 1;
    rdpData.length = currentHour + 1;
    sipData.length = currentHour + 1;
    mysqlData.length = currentHour + 1;
    sshData.fill(0);
    telnetData.fill(0);
    ftpData.fill(0);
    smtpData.fill(0);
    rdpData.fill(0);
    sipData.fill(0);
    mysqlData.fill(0);

    sortedAttempts.forEach(attempt => {
        const date = new Date(attempt.timestamp + 'Z');
        if (date.toLocaleDateString() === now.toLocaleDateString()) {
            const hour = date.getHours();
            incrementProtocolData(attempt.protocol, hour, sshData, telnetData, ftpData, smtpData, rdpData, sipData, mysqlData);
        }
    });
}

function updateThisWeekData(sortedAttempts, now, timeLabels, sshData, telnetData, ftpData, smtpData, rdpData, sipData, mysqlData) {
    for (let i = 0; i < 7; i++) {
        const d = new Date(now);
        d.setDate(d.getDate() - (6 - i));
        timeLabels.push(formatDate(d));
    }
    
    sshData.length = 7;
    telnetData.length = 7;
    ftpData.length = 7;
    smtpData.length = 7;
    rdpData.length = 7;
    sipData.length = 7;
    mysqlData.length = 7;
    sshData.fill(0);
    telnetData.fill(0);
    ftpData.fill(0);
    smtpData.fill(0);
    rdpData.fill(0);
    sipData.fill(0);
    mysqlData.fill(0);

    sortedAttempts.forEach(attempt => {
        const date = new Date(attempt.timestamp + 'Z');
        const daysAgo = Math.floor((now - date) / (1000 * 60 * 60 * 24));
        if (daysAgo < 7) {
            const dayIndex = 6 - daysAgo;
            incrementProtocolData(attempt.protocol, dayIndex, sshData, telnetData, ftpData, smtpData, rdpData, sipData, mysqlData);
        }
    });
}

function updateAllTimeData(sortedAttempts, now, timeLabels, sshData, telnetData, ftpData, smtpData, rdpData, sipData, mysqlData) {
    if (sortedAttempts.length === 0) return;

    const oldestDate = new Date(sortedAttempts[0].timestamp + 'Z');
    const newestDate = new Date(sortedAttempts[sortedAttempts.length - 1].timestamp + 'Z');
    const endDate = new Date(Math.max(newestDate.getTime(), now.getTime()));
    const startDate = new Date(oldestDate);
    
    const totalHoursDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60));
    const totalDaysDiff = Math.ceil(totalHoursDiff / 24);

    let intervalSize;
    if (totalHoursDiff <= 1) {
        intervalSize = 5/60; // 5-minute intervals
        startDate.setUTCMinutes(Math.floor(startDate.getUTCMinutes() / 5) * 5, 0, 0);
        endDate.setUTCMinutes(Math.ceil(endDate.getUTCMinutes() / 5) * 5, 0, 0);
    } else if (totalHoursDiff <= 3) {
        intervalSize = 15/60; // 15-minute intervals
        startDate.setUTCMinutes(Math.floor(startDate.getUTCMinutes() / 15) * 15, 0, 0);
        endDate.setUTCMinutes(Math.ceil(endDate.getUTCMinutes() / 15) * 15, 0, 0);
    } else if (totalHoursDiff <= 6) {
        intervalSize = 30/60; // 30-minute intervals
        startDate.setUTCMinutes(Math.floor(startDate.getUTCMinutes() / 30) * 30, 0, 0);
        endDate.setUTCMinutes(Math.ceil(endDate.getUTCMinutes() / 30) * 30, 0, 0);
    } else if (totalDaysDiff <= 2) {
        intervalSize = 1; // 1-hour intervals
        startDate.setUTCMinutes(0, 0, 0);
        endDate.setUTCHours(endDate.getUTCHours() + 1);
        endDate.setUTCMinutes(0, 0, 0);
    } else if (totalDaysDiff <= 7) {
        intervalSize = 2; // 2-hour intervals
        startDate.setUTCMinutes(0, 0, 0);
        startDate.setUTCHours(Math.floor(startDate.getUTCHours() / 2) * 2);
        endDate.setUTCHours(Math.ceil(endDate.getUTCHours() / 2) * 2);
        endDate.setUTCMinutes(0, 0, 0);
    } else if (totalDaysDiff <= 14) {
        intervalSize = 4; // 4-hour intervals
        startDate.setUTCMinutes(0, 0, 0);
        startDate.setUTCHours(Math.floor(startDate.getUTCHours() / 4) * 4);
        endDate.setUTCHours(Math.ceil(endDate.getUTCHours() / 4) * 4);
        endDate.setUTCMinutes(0, 0, 0);
    } else if (totalDaysDiff <= 30) {
        intervalSize = 6; // 6-hour intervals
        startDate.setUTCMinutes(0, 0, 0);
        startDate.setUTCHours(Math.floor(startDate.getUTCHours() / 6) * 6);
        endDate.setUTCHours(Math.ceil(endDate.getUTCHours() / 6) * 6);
        endDate.setUTCMinutes(0, 0, 0);
    } else {
        intervalSize = 12; // 12-hour intervals
        startDate.setUTCMinutes(0, 0, 0);
        startDate.setUTCHours(Math.floor(startDate.getUTCHours() / 12) * 12);
        endDate.setUTCHours(Math.ceil(endDate.getUTCHours() / 12) * 12);
        endDate.setUTCMinutes(0, 0, 0);
    }

    const intervals = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * intervalSize));

    timeLabels.length = intervals;
    sshData.length = intervals;
    telnetData.length = intervals;
    ftpData.length = intervals;
    smtpData.length = intervals;
    rdpData.length = intervals;
    sipData.length = intervals;
    mysqlData.length = intervals;

    sshData.fill(0);
    telnetData.fill(0);
    ftpData.fill(0);
    smtpData.fill(0);
    rdpData.fill(0);
    sipData.fill(0);
    mysqlData.fill(0);

    for (let i = 0; i < intervals; i++) {
        const date = new Date(startDate);
        if (intervalSize < 1) {
            const minutesToAdd = i * (intervalSize * 60);
            date.setUTCMinutes(date.getUTCMinutes() + minutesToAdd);
            timeLabels[i] = formatTimeWithMinutes(date.getHours(), date.getMinutes());
        } else {
            date.setUTCHours(date.getUTCHours() + (i * intervalSize));
            if (intervalSize === 24) {
                timeLabels[i] = formatDate(date);
            } else if (intervalSize === 12) {
                timeLabels[i] = `${formatDate(date)} ${date.toLocaleString(undefined, {
                    hour: 'numeric',
                    hour12: true
                })}`;
            } else {
                timeLabels[i] = `${formatDate(date)} ${date.toLocaleString(undefined, {
                    hour: 'numeric',
                    hour12: true
                })}`;
            }
        }
    }

    sortedAttempts.forEach(attempt => {
        const date = new Date(attempt.timestamp + 'Z');
        if (intervalSize < 1) {
            const minutesSinceStart = Math.floor((date - startDate) / (1000 * 60));
            const intervalIndex = Math.floor(minutesSinceStart / (intervalSize * 60));
            if (intervalIndex >= 0 && intervalIndex < intervals) {
                incrementProtocolData(attempt.protocol, intervalIndex, sshData, telnetData, ftpData, smtpData, rdpData, sipData, mysqlData);
            }
        } else {
            const intervalIndex = Math.floor((date - startDate) / (1000 * 60 * 60 * intervalSize));
            if (intervalIndex >= 0 && intervalIndex < intervals) {
                incrementProtocolData(attempt.protocol, intervalIndex, sshData, telnetData, ftpData, smtpData, rdpData, sipData, mysqlData);
            }
        }
    });
}

function incrementProtocolData(protocol, index, sshData, telnetData, ftpData, smtpData, rdpData, sipData, mysqlData) {
    switch (protocol) {
        case 'ssh':
            sshData[index]++;
            break;
        case 'telnet':
            telnetData[index]++;
            break;
        case 'ftp':
            ftpData[index]++;
            break;
        case 'smtp':
            smtpData[index]++;
            break;
        case 'rdp':
            rdpData[index]++;
            break;
        case 'sip':
            sipData[index]++;
            break;
        case 'mysql':
            mysqlData[index]++;
            break;
    }
}

function updateAttemptsChart(timeLabels, sshData, telnetData, ftpData, smtpData, rdpData, sipData, mysqlData) {
    attemptsChart.data.labels = timeLabels;
    attemptsChart.data.datasets[0].data = sshData;
    attemptsChart.data.datasets[1].data = telnetData;
    attemptsChart.data.datasets[2].data = ftpData;
    attemptsChart.data.datasets[3].data = smtpData;
    attemptsChart.data.datasets[4].data = rdpData;
    attemptsChart.data.datasets[5].data = sipData;
    attemptsChart.data.datasets[6].data = mysqlData;
    attemptsChart.update();
}

function updateUsernameChart(filteredAttempts) {
    const usernameData = {};
    filteredAttempts.forEach(attempt => {
        // Replace blank or null usernames with [User Null]
        const username = attempt.username.trim() || '[User Null]';
        if (!usernameData[username]) {
            usernameData[username] = { ssh: 0, telnet: 0, ftp: 0, smtp: 0, rdp: 0, sip: 0, mysql: 0 };
        }
        usernameData[username][attempt.protocol]++;
    });

    // Sort by total attempts across all protocols
    const topUsernames = Object.entries(usernameData)
        .sort((a, b) => {
            const totalA = a[1].ssh + a[1].telnet + a[1].ftp + a[1].smtp + a[1].rdp + a[1].sip + a[1].mysql;
            const totalB = b[1].ssh + b[1].telnet + b[1].ftp + b[1].smtp + b[1].rdp + b[1].sip + b[1].mysql;
            return totalB - totalA;
        })
        .slice(0, 5);

    // Update chart data
    usernamesChart.data.labels = topUsernames.map(([username]) => username);
    usernamesChart.data.datasets[0].data = topUsernames.map(([, counts]) => counts.ssh);
    usernamesChart.data.datasets[1].data = topUsernames.map(([, counts]) => counts.telnet);
    usernamesChart.data.datasets[2].data = topUsernames.map(([, counts]) => counts.ftp);
    usernamesChart.data.datasets[3].data = topUsernames.map(([, counts]) => counts.smtp);
    usernamesChart.data.datasets[4].data = topUsernames.map(([, counts]) => counts.rdp);
    usernamesChart.data.datasets[5].data = topUsernames.map(([, counts]) => counts.sip);
    usernamesChart.data.datasets[6].data = topUsernames.map(([, counts]) => counts.mysql);

    // Force chart update
    usernamesChart.update('none');
}

function updateIPChart(filteredAttempts) {
    const ipData = {};
    filteredAttempts.forEach(attempt => {
        ipData[attempt.client_ip] = (ipData[attempt.client_ip] || 0) + 1;
    });

    const topIPs = Object.entries(ipData)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    ipsChart.data.labels = topIPs.map(([ip]) => ip);
    ipsChart.data.datasets[0].data = topIPs.map(([, count]) => count);
    ipsChart.update();
}

function updateCountryChart(filteredAttempts) {
    const countryData = {};
    filteredAttempts.forEach(attempt => {
        if (attempt.country) {
            countryData[attempt.country] = (countryData[attempt.country] || 0) + 1;
        }
    });

    const topCountries = Object.entries(countryData)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    countriesChart.data.labels = topCountries.map(([country]) => country);
    countriesChart.data.datasets[0].data = topCountries.map(([, count]) => count);
    countriesChart.update();
} 
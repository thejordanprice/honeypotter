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

function updateVisualizations(filteredAttempts) {
    // Clear existing markers from the map
    markers.forEach(marker => {
        map.removeLayer(marker.leaflet);
    });
    markers.clear();

    // Update map with filtered attempts
    filteredAttempts.forEach(updateMap);
    centerMapOnMostActiveRegion(filteredAttempts);

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

    // Sort attempts by timestamp
    const sortedAttempts = [...filteredAttempts].sort((a, b) => 
        new Date(a.timestamp + 'Z') - new Date(b.timestamp + 'Z')
    );

    // Update time-based data based on filter
    if (filterValue === 'lastHour') {
        updateLastHourData(sortedAttempts, now, timeLabels, sshData, telnetData, ftpData, smtpData, rdpData);
    } else if (filterValue === 'today') {
        updateTodayData(sortedAttempts, now, timeLabels, sshData, telnetData, ftpData, smtpData, rdpData);
    } else if (filterValue === 'thisWeek') {
        updateThisWeekData(sortedAttempts, now, timeLabels, sshData, telnetData, ftpData, smtpData, rdpData);
    } else {
        updateAllTimeData(sortedAttempts, now, timeLabels, sshData, telnetData, ftpData, smtpData, rdpData);
    }

    // Update the attempts chart
    updateAttemptsChart(timeLabels, sshData, telnetData, ftpData, smtpData, rdpData);

    // Update username distribution chart
    updateUsernameChart(filteredAttempts);

    // Update IP addresses chart
    updateIPChart(filteredAttempts);

    // Update countries chart
    updateCountryChart(filteredAttempts);
}

function updateLastHourData(sortedAttempts, now, timeLabels, sshData, telnetData, ftpData, smtpData, rdpData) {
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
    sshData.fill(0);
    telnetData.fill(0);
    ftpData.fill(0);
    smtpData.fill(0);
    rdpData.fill(0);

    sortedAttempts.forEach(attempt => {
        const date = new Date(attempt.timestamp + 'Z');
        const minutesAgo = Math.floor((now - date) / (1000 * 60));
        if (minutesAgo <= 60) {
            const intervalIndex = Math.floor((60 - minutesAgo) / 5);
            if (intervalIndex >= 0 && intervalIndex < intervals) {
                incrementProtocolData(attempt.protocol, intervalIndex, sshData, telnetData, ftpData, smtpData, rdpData);
            }
        }
    });
}

function updateTodayData(sortedAttempts, now, timeLabels, sshData, telnetData, ftpData, smtpData, rdpData) {
    const currentHour = now.getHours();
    for (let i = 0; i <= currentHour; i++) {
        timeLabels.push(formatHour(i));
    }
    
    sshData.length = currentHour + 1;
    telnetData.length = currentHour + 1;
    ftpData.length = currentHour + 1;
    smtpData.length = currentHour + 1;
    rdpData.length = currentHour + 1;
    sshData.fill(0);
    telnetData.fill(0);
    ftpData.fill(0);
    smtpData.fill(0);
    rdpData.fill(0);

    sortedAttempts.forEach(attempt => {
        const date = new Date(attempt.timestamp + 'Z');
        if (date.toLocaleDateString() === now.toLocaleDateString()) {
            const hour = date.getHours();
            incrementProtocolData(attempt.protocol, hour, sshData, telnetData, ftpData, smtpData, rdpData);
        }
    });
}

function updateThisWeekData(sortedAttempts, now, timeLabels, sshData, telnetData, ftpData, smtpData, rdpData) {
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
    sshData.fill(0);
    telnetData.fill(0);
    ftpData.fill(0);
    smtpData.fill(0);
    rdpData.fill(0);

    sortedAttempts.forEach(attempt => {
        const date = new Date(attempt.timestamp + 'Z');
        const daysAgo = Math.floor((now - date) / (1000 * 60 * 60 * 24));
        if (daysAgo < 7) {
            const dayIndex = 6 - daysAgo;
            incrementProtocolData(attempt.protocol, dayIndex, sshData, telnetData, ftpData, smtpData, rdpData);
        }
    });
}

function updateAllTimeData(sortedAttempts, now, timeLabels, sshData, telnetData, ftpData, smtpData, rdpData) {
    if (sortedAttempts.length === 0) return;

    const oldestDate = new Date(sortedAttempts[0].timestamp + 'Z');
    const newestDate = new Date(sortedAttempts[sortedAttempts.length - 1].timestamp + 'Z');
    const endDate = new Date(Math.max(newestDate.getTime(), now.getTime()));
    const startDate = new Date(oldestDate);
    
    const totalHoursDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60));
    const totalDaysDiff = Math.ceil(totalHoursDiff / 24);

    let intervalSize;
    if (totalHoursDiff <= 1) {
        intervalSize = 5/60;
        startDate.setUTCMinutes(Math.floor(startDate.getUTCMinutes() / 5) * 5, 0, 0);
        endDate.setUTCMinutes(Math.floor(endDate.getUTCMinutes() / 5) * 5, 0, 0);
    } else if (totalHoursDiff <= 3) {
        intervalSize = 15/60;
        startDate.setUTCMinutes(Math.floor(startDate.getUTCMinutes() / 15) * 15, 0, 0);
        endDate.setUTCMinutes(Math.floor(endDate.getUTCMinutes() / 15) * 15, 0, 0);
    } else if (totalDaysDiff <= 2) {
        intervalSize = 1;
    } else if (totalDaysDiff <= 7) {
        intervalSize = 3;
    } else if (totalDaysDiff <= 14) {
        intervalSize = 6;
    } else if (totalDaysDiff <= 30) {
        intervalSize = 12;
    } else {
        intervalSize = 24;
    }

    if (intervalSize >= 1) {
        startDate.setUTCMinutes(0, 0, 0);
        startDate.setUTCHours(Math.floor(startDate.getUTCHours() / intervalSize) * intervalSize);
        
        endDate.setUTCMinutes(59, 59, 999);
        endDate.setUTCHours(Math.ceil(endDate.getUTCHours() / intervalSize) * intervalSize);
    }

    const intervals = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * intervalSize));

    // For 15-minute intervals, check if we're in an incomplete interval
    if (intervalSize < 1) {
        const currentMinute = now.getMinutes();
        const currentInterval = Math.floor(currentMinute / (intervalSize * 60));
        const minutesIntoInterval = currentMinute % (intervalSize * 60);
        
        // If we're in the middle of an interval, reduce the number of intervals by 1
        if (minutesIntoInterval > 0) {
            timeLabels.length = intervals - 1;
            sshData.length = intervals - 1;
            telnetData.length = intervals - 1;
            ftpData.length = intervals - 1;
            smtpData.length = intervals - 1;
            rdpData.length = intervals - 1;
        } else {
            timeLabels.length = intervals;
            sshData.length = intervals;
            telnetData.length = intervals;
            ftpData.length = intervals;
            smtpData.length = intervals;
            rdpData.length = intervals;
        }
    } else {
        timeLabels.length = intervals;
        sshData.length = intervals;
        telnetData.length = intervals;
        ftpData.length = intervals;
        smtpData.length = intervals;
        rdpData.length = intervals;
    }

    sshData.fill(0);
    telnetData.fill(0);
    ftpData.fill(0);
    smtpData.fill(0);
    rdpData.fill(0);

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
                timeLabels[i] = `${formatDate(date)} ${date.getHours() >= 12 ? 'PM' : 'AM'}`;
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
                incrementProtocolData(attempt.protocol, intervalIndex, sshData, telnetData, ftpData, smtpData, rdpData);
            }
        } else {
            const intervalIndex = Math.floor((date - startDate) / (1000 * 60 * 60 * intervalSize));
            if (intervalIndex >= 0 && intervalIndex < intervals) {
                incrementProtocolData(attempt.protocol, intervalIndex, sshData, telnetData, ftpData, smtpData, rdpData);
            }
        }
    });
}

function incrementProtocolData(protocol, index, sshData, telnetData, ftpData, smtpData, rdpData) {
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
    }
}

function updateAttemptsChart(timeLabels, sshData, telnetData, ftpData, smtpData, rdpData) {
    attemptsChart.data.labels = timeLabels;
    attemptsChart.data.datasets[0].data = sshData;
    attemptsChart.data.datasets[1].data = telnetData;
    attemptsChart.data.datasets[2].data = ftpData;
    attemptsChart.data.datasets[3].data = smtpData;
    attemptsChart.data.datasets[4].data = rdpData;
    attemptsChart.update();
}

function updateUsernameChart(filteredAttempts) {
    const usernameData = {};
    filteredAttempts.forEach(attempt => {
        if (!usernameData[attempt.username]) {
            usernameData[attempt.username] = { ssh: 0, telnet: 0, ftp: 0, smtp: 0, rdp: 0 };
        }
        usernameData[attempt.username][attempt.protocol]++;
    });

    const topUsernames = Object.entries(usernameData)
        .sort((a, b) => (b[1].ssh + b[1].telnet + b[1].ftp + b[1].smtp + b[1].rdp) - 
                        (a[1].ssh + a[1].telnet + a[1].ftp + a[1].smtp + a[1].rdp))
        .slice(0, 5);

    usernamesChart.data.labels = topUsernames.map(([username]) => username);
    usernamesChart.data.datasets[0].data = topUsernames.map(([, counts]) => counts.ssh);
    usernamesChart.data.datasets[1].data = topUsernames.map(([, counts]) => counts.telnet);
    usernamesChart.data.datasets[2].data = topUsernames.map(([, counts]) => counts.ftp);
    usernamesChart.data.datasets[3].data = topUsernames.map(([, counts]) => counts.smtp);
    usernamesChart.data.datasets[4].data = topUsernames.map(([, counts]) => counts.rdp);
    usernamesChart.update();
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
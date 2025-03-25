// Add flag to track initial load
let isInitialLoad = true;

function updateVisualizations(filteredAttempts) {
    // Map is now updated in the updateMap function in main.js
    
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
        timeLabels.push(formatUtils.formatTimeWithMinutes(d.getHours(), d.getMinutes()));
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
        timeLabels.push(formatUtils.formatHour(i));
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
        timeLabels.push(formatUtils.formatDate(d));
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
    } else if (totalDaysDiff <= 60) {
        intervalSize = 8; // 8-hour intervals
        startDate.setUTCMinutes(0, 0, 0);
        startDate.setUTCHours(Math.floor(startDate.getUTCHours() / 8) * 8);
        endDate.setUTCHours(Math.ceil(endDate.getUTCHours() / 8) * 8);
        endDate.setUTCMinutes(0, 0, 0);
    } else if (totalDaysDiff <= 90) {
        intervalSize = 12; // 12-hour intervals
        startDate.setUTCMinutes(0, 0, 0);
        startDate.setUTCHours(Math.floor(startDate.getUTCHours() / 12) * 12);
        endDate.setUTCHours(Math.ceil(endDate.getUTCHours() / 12) * 12);
        endDate.setUTCMinutes(0, 0, 0);
    } else {
        intervalSize = 24; // 1-day intervals
        startDate.setUTCHours(0, 0, 0, 0);
        endDate.setUTCDate(endDate.getUTCDate() + 1);
        endDate.setUTCHours(0, 0, 0, 0);
    }
    
    // Calculate total number of intervals
    const totalIntervals = Math.ceil((endDate - startDate) / (intervalSize * 60 * 60 * 1000));
    
    // Initialize data arrays
    sshData.length = totalIntervals;
    telnetData.length = totalIntervals;
    ftpData.length = totalIntervals;
    smtpData.length = totalIntervals;
    rdpData.length = totalIntervals;
    sipData.length = totalIntervals;
    mysqlData.length = totalIntervals;
    sshData.fill(0);
    telnetData.fill(0);
    ftpData.fill(0);
    smtpData.fill(0);
    rdpData.fill(0);
    sipData.fill(0);
    mysqlData.fill(0);
    
    // Generate time labels based on interval size
    for (let i = 0; i < totalIntervals; i++) {
        const time = new Date(startDate.getTime() + (i * intervalSize * 60 * 60 * 1000));
        if (intervalSize < 1) {
            // For sub-hour intervals, show time with minutes
            timeLabels.push(formatUtils.formatTimeWithMinutes(time.getHours(), time.getMinutes()));
        } else if (intervalSize < 24) {
            // For hour-based intervals, show date + hour
            const hourStr = formatUtils.formatHour(time.getHours());
            if (i === 0 || time.getHours() === 0) {
                // Add date for the first label and at midnight
                timeLabels.push(`${formatUtils.formatDate(time)} ${hourStr}`);
            } else {
                timeLabels.push(hourStr);
            }
        } else {
            // For day or longer intervals, just show the date
            timeLabels.push(formatUtils.formatDate(time));
        }
    }
    
    // Process the attempt data
    sortedAttempts.forEach(attempt => {
        const date = new Date(attempt.timestamp + 'Z');
        const intervalIndex = Math.floor((date - startDate) / (intervalSize * 60 * 60 * 1000));
        if (intervalIndex >= 0 && intervalIndex < totalIntervals) {
            incrementProtocolData(attempt.protocol, intervalIndex, sshData, telnetData, ftpData, smtpData, rdpData, sipData, mysqlData);
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
    const protocolData = {
        ssh: {},
        telnet: {},
        ftp: {},
        smtp: {},
        rdp: {},
        sip: {},
        mysql: {}
    };
    
    filteredAttempts.forEach(attempt => {
        const username = attempt.username || '[null]';
        if (!protocolData[attempt.protocol][username]) {
            protocolData[attempt.protocol][username] = 0;
        }
        protocolData[attempt.protocol][username]++;
    });
    
    // Get top 10 usernames overall
    const usernameCount = {};
    Object.values(protocolData).forEach(protocols => {
        Object.entries(protocols).forEach(([username, count]) => {
            usernameCount[username] = (usernameCount[username] || 0) + count;
        });
    });
    
    const topUsernames = Object.entries(usernameCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(entry => entry[0]);
    
    usernamesChart.data.labels = topUsernames;
    
    // Map protocols to dataset indices
    const protocolIndices = {
        ssh: 0,
        telnet: 1,
        ftp: 2,
        smtp: 3,
        rdp: 4,
        sip: 5,
        mysql: 6
    };
    
    // Reset all datasets
    usernamesChart.data.datasets.forEach(dataset => {
        dataset.data = topUsernames.map(() => 0);
    });
    
    // Fill in data
    topUsernames.forEach((username, index) => {
        Object.entries(protocolData).forEach(([protocol, usernames]) => {
            if (usernames[username]) {
                usernamesChart.data.datasets[protocolIndices[protocol]].data[index] = usernames[username];
            }
        });
    });
    
    usernamesChart.update();
}

function updateIPChart(filteredAttempts) {
    const ipCount = {};
    
    filteredAttempts.forEach(attempt => {
        ipCount[attempt.client_ip] = (ipCount[attempt.client_ip] || 0) + 1;
    });
    
    const topIPs = Object.entries(ipCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    ipsChart.data.labels = topIPs.map(ip => ip[0]);
    ipsChart.data.datasets[0].data = topIPs.map(ip => ip[1]);
    ipsChart.update();
}

function updateCountryChart(filteredAttempts) {
    const countryCount = {};
    
    filteredAttempts.forEach(attempt => {
        if (attempt.country) {
            countryCount[attempt.country] = (countryCount[attempt.country] || 0) + 1;
        }
    });
    
    const topCountries = Object.entries(countryCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    countriesChart.data.labels = topCountries.map(c => c[0]);
    countriesChart.data.datasets[0].data = topCountries.map(c => c[1]);
    countriesChart.update();
} 
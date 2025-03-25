#!/bin/bash

# Load environment variables from .env
if [ -f .env ]; then
    source .env
else
    echo "Error: .env file not found"
    exit 1
fi

# Set default ports if not defined in .env
: ${SSH_PORT:=22}
: ${TELNET_PORT:=23}
: ${FTP_PORT:=21}
: ${SMTP_PORT:=25}
: ${RDP_PORT:=3389}
: ${SIP_PORT:=5060}
: ${MYSQL_PORT:=3306}

echo "Starting honeypot tests..."
echo "-------------------------"

# Remove known_hosts file for SSH test
echo "Removing ~/.ssh/known_hosts file..."
rm -f ~/.ssh/known_hosts

# Function to test a port using netcat
test_port() {
    local port=$1
    local protocol=$2
    echo -e "\nTesting $protocol on 127.0.0.1:$port..."
    nc -zv 127.0.0.1 $port || true
}

# Test SSH
echo -e "\nTesting SSH on 127.0.0.1:$SSH_PORT..."
expect -c "
spawn ssh -p $SSH_PORT test@127.0.0.1
expect \"yes/no\"
send \"yes\n\"
expect \"password:\"
send \"test123\n\"
expect eof
" || true

# Test Telnet
echo -e "\nTesting Telnet on 127.0.0.1:$TELNET_PORT..."
{ echo "test"; sleep 1; echo "password"; sleep 1; } | telnet 127.0.0.1 $TELNET_PORT || true

# Test FTP
echo -e "\nTesting FTP on 127.0.0.1:$FTP_PORT..."
{ echo "USER test"; sleep 1; echo "PASS test123"; sleep 1; } | nc 127.0.0.1 $FTP_PORT || true

# Test SMTP
echo -e "\nTesting SMTP on 127.0.0.1:$SMTP_PORT..."
{
    echo "EHLO test.com"
    sleep 1
    echo "AUTH LOGIN"
    sleep 1
    echo "dGVzdA=="  # base64 encoded "test"
    sleep 1
    echo "dGVzdDEyMw=="  # base64 encoded "test123"
    sleep 1
    echo "QUIT"
    sleep 1
} | nc 127.0.0.1 $SMTP_PORT || true

# Test RDP
echo -e "\nTesting RDP on 127.0.0.1:$RDP_PORT..."
test_port $RDP_PORT "RDP"

# Test SIP TCP
echo -e "\nTesting SIP TCP on 127.0.0.1:$SIP_PORT..."
test_port $SIP_PORT "SIP TCP"

# Test SIP UDP
echo -e "\nTesting SIP UDP on 127.0.0.1:$SIP_PORT..."
echo "REGISTER sip:test@127.0.0.1 SIP/2.0" | nc -u -w1 127.0.0.1 $SIP_PORT || true

# Test MySQL
echo -e "\nTesting MySQL on 127.0.0.1:$MYSQL_PORT..."
mysql -h127.0.0.1 -P$MYSQL_PORT -utest -ptest --connect-timeout=5 || true

echo -e "\nAll tests completed!" 
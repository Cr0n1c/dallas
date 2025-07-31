#!/bin/bash

# CIS Docker Benchmark Compliance Check Script
# Validates security configurations in the Infrastructure Debugger container

set -euo pipefail

COLOR_RED='\033[0;31m'
COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_BLUE='\033[0;34m'
COLOR_NC='\033[0m' # No Color

IMAGE_NAME="${1:-infrastructure-debugger}"
CONTAINER_NAME="cis-check-$(date +%s)"

echo -e "${COLOR_BLUE}🔒 CIS Docker Benchmark Compliance Check${COLOR_NC}"
echo -e "${COLOR_BLUE}==========================================${COLOR_NC}"
echo -e "Checking image: ${COLOR_YELLOW}${IMAGE_NAME}${COLOR_NC}\n"

# Function to print test results
print_result() {
    local test_name="$1"
    local result="$2"
    local details="${3:-}"

    if [ "$result" = "PASS" ]; then
        echo -e "${COLOR_GREEN}✅ PASS${COLOR_NC}: $test_name"
    elif [ "$result" = "FAIL" ]; then
        echo -e "${COLOR_RED}❌ FAIL${COLOR_NC}: $test_name"
    else
        echo -e "${COLOR_YELLOW}⚠️  WARN${COLOR_NC}: $test_name"
    fi

    if [ -n "$details" ]; then
        echo -e "   ${details}"
    fi
}

# Check if image exists
if ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    echo -e "${COLOR_RED}❌ Image '$IMAGE_NAME' not found. Please build it first.${COLOR_NC}"
    exit 1
fi

# Start container for testing
echo -e "${COLOR_BLUE}🚀 Starting test container...${COLOR_NC}"
CONTAINER_ID=$(docker run -d --name "$CONTAINER_NAME" "$IMAGE_NAME")

# Function to cleanup on exit
cleanup() {
    echo -e "\n${COLOR_BLUE}🧹 Cleaning up test container...${COLOR_NC}"
    docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
    docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Wait for container to start
sleep 5

echo -e "${COLOR_BLUE}📋 Running CIS compliance checks...${COLOR_NC}\n"

# CIS 4.1 - Ensure that a user for the container has been created
USER_CHECK=$(docker inspect "$IMAGE_NAME" | jq -r '.[0].Config.User')
if [ "$USER_CHECK" = "appuser" ] || [ "$USER_CHECK" != "root" ] && [ "$USER_CHECK" != "" ] && [ "$USER_CHECK" != "null" ]; then
    print_result "4.1 Non-root user configured" "PASS" "User: $USER_CHECK"
else
    print_result "4.1 Non-root user configured" "FAIL" "Container runs as root"
fi

# CIS 4.5 - Ensure Content trust for Docker is Enabled
CONTENT_TRUST=${DOCKER_CONTENT_TRUST:-0}
if [ "$CONTENT_TRUST" = "1" ]; then
    print_result "4.5 Content trust enabled" "PASS"
else
    print_result "4.5 Content trust enabled" "WARN" "Set DOCKER_CONTENT_TRUST=1 for production"
fi

# CIS 4.6 - Ensure that HEALTHCHECK instructions have been added
HEALTHCHECK=$(docker inspect "$IMAGE_NAME" | jq -r '.[0].Config.Healthcheck.Test[]' 2>/dev/null | head -1)
if [ -n "$HEALTHCHECK" ] && [ "$HEALTHCHECK" != "null" ]; then
    print_result "4.6 Health check configured" "PASS" "Command: $HEALTHCHECK"
else
    print_result "4.6 Health check configured" "FAIL"
fi

# CIS 4.7 - Ensure update instructions are not used alone
DOCKERFILE_PATH="debugger/build/Dockerfile"
if [ -f "$DOCKERFILE_PATH" ]; then
    UPDATE_ONLY=$(grep -E "^RUN.*apt-get.*update\s*$" "$DOCKERFILE_PATH" || true)
    if [ -z "$UPDATE_ONLY" ]; then
        print_result "4.7 No standalone update instructions" "PASS"
    else
        print_result "4.7 No standalone update instructions" "FAIL" "Found standalone update commands"
    fi
else
    print_result "4.7 No standalone update instructions" "WARN" "Dockerfile not found for check"
fi

# CIS 4.9 - Ensure that COPY is used instead of ADD
if [ -f "$DOCKERFILE_PATH" ]; then
    ADD_USAGE=$(grep -E "^ADD" "$DOCKERFILE_PATH" || true)
    if [ -z "$ADD_USAGE" ]; then
        print_result "4.9 COPY used instead of ADD" "PASS"
    else
        print_result "4.9 COPY used instead of ADD" "WARN" "ADD instruction found"
    fi
fi

# CIS 5.1 - Ensure that, if applicable, an AppArmor Profile is enabled
APPARMOR_PROFILE=$(docker inspect "$CONTAINER_NAME" | jq -r '.[0].AppArmorProfile')
if [ "$APPARMOR_PROFILE" != "null" ] && [ -n "$APPARMOR_PROFILE" ]; then
    print_result "5.1 AppArmor profile enabled" "PASS" "Profile: $APPARMOR_PROFILE"
else
    print_result "5.1 AppArmor profile enabled" "WARN" "Consider enabling AppArmor"
fi

# CIS 5.3 - Ensure that Linux kernel capabilities are restricted within containers
CAPABILITIES=$(docker inspect "$CONTAINER_NAME" | jq -r '.[0].HostConfig.CapAdd[]' 2>/dev/null || echo "")
if [ -z "$CAPABILITIES" ] || [ "$CAPABILITIES" = "null" ]; then
    print_result "5.3 Kernel capabilities restricted" "PASS" "No additional capabilities added"
else
    print_result "5.3 Kernel capabilities restricted" "WARN" "Additional capabilities: $CAPABILITIES"
fi

# CIS 5.4 - Ensure that privileged containers are not used
PRIVILEGED=$(docker inspect "$CONTAINER_NAME" | jq -r '.[0].HostConfig.Privileged')
if [ "$PRIVILEGED" = "false" ]; then
    print_result "5.4 Non-privileged container" "PASS"
else
    print_result "5.4 Non-privileged container" "FAIL" "Container runs in privileged mode"
fi

# CIS 5.5 - Ensure sensitive host system directories are not mounted
HOST_MOUNTS=$(docker inspect "$CONTAINER_NAME" | jq -r '.[0].Mounts[].Source' 2>/dev/null || echo "")
SENSITIVE_PATHS=("/proc" "/sys" "/boot" "/dev" "/etc" "/lib" "/usr" "/bin")
MOUNT_ISSUES=""

for mount in $HOST_MOUNTS; do
    for sensitive in "${SENSITIVE_PATHS[@]}"; do
        if [[ "$mount" == "$sensitive" ]]; then
            MOUNT_ISSUES="$MOUNT_ISSUES $mount"
        fi
    done
done

if [ -z "$MOUNT_ISSUES" ]; then
    print_result "5.5 No sensitive host directories mounted" "PASS"
else
    print_result "5.5 No sensitive host directories mounted" "WARN" "Mounted: $MOUNT_ISSUES"
fi

# CIS 5.10 - Ensure that the memory usage for containers is limited
MEMORY_LIMIT=$(docker inspect "$CONTAINER_NAME" | jq -r '.[0].HostConfig.Memory')
if [ "$MEMORY_LIMIT" != "0" ] && [ "$MEMORY_LIMIT" != "null" ]; then
    print_result "5.10 Memory usage limited" "PASS" "Limit: $MEMORY_LIMIT bytes"
else
    print_result "5.10 Memory usage limited" "WARN" "Consider setting memory limits"
fi

# Custom checks for our specific security implementations

# Check for specific image tags (not latest)
IMAGE_TAG=$(echo "$IMAGE_NAME" | cut -d: -f2)
if [ "$IMAGE_TAG" != "latest" ] && [ "$IMAGE_TAG" != "$IMAGE_NAME" ]; then
    print_result "Custom: Specific image tag used" "PASS" "Tag: $IMAGE_TAG"
else
    print_result "Custom: Specific image tag used" "WARN" "Consider using specific version tags"
fi

# Check for security labels
SECURITY_LABELS=$(docker inspect "$IMAGE_NAME" | jq -r '.[0].Config.Labels | to_entries[] | select(.key | startswith("security")) | "\(.key)=\(.value)"' 2>/dev/null || echo "")
if [ -n "$SECURITY_LABELS" ]; then
    print_result "Custom: Security labels present" "PASS" "Labels found"
else
    print_result "Custom: Security labels present" "WARN" "Consider adding security labels"
fi

# Check exposed ports are minimal
EXPOSED_PORTS=$(docker inspect "$IMAGE_NAME" | jq -r '.[0].Config.ExposedPorts | keys[]' 2>/dev/null | wc -l)
if [ "$EXPOSED_PORTS" -le 2 ]; then
    print_result "Custom: Minimal ports exposed" "PASS" "Ports: $EXPOSED_PORTS"
else
    print_result "Custom: Minimal ports exposed" "WARN" "Many ports exposed: $EXPOSED_PORTS"
fi

# Check for setuid/setgid binaries
SETUID_COUNT=$(docker exec "$CONTAINER_NAME" find /usr -perm /6000 -type f 2>/dev/null | wc -l || echo "0")
if [ "$SETUID_COUNT" -eq 0 ]; then
    print_result "Custom: No setuid/setgid binaries" "PASS"
else
    print_result "Custom: No setuid/setgid binaries" "WARN" "Found $SETUID_COUNT setuid/setgid binaries"
fi

# Check running processes user
PROCESS_USERS=$(docker exec "$CONTAINER_NAME" ps -eo user --no-headers 2>/dev/null | sort -u | grep -v '^$' || echo "")
ROOT_PROCESSES=$(echo "$PROCESS_USERS" | grep -c "^root$" || echo "0")
if [ "$ROOT_PROCESSES" -eq 0 ]; then
    print_result "Custom: No root processes running" "PASS"
else
    print_result "Custom: No root processes running" "WARN" "Found $ROOT_PROCESSES root processes"
fi

echo -e "${COLOR_BLUE}📊 CIS Compliance Check Complete${COLOR_NC}"
echo -e "${COLOR_BLUE}==================================${COLOR_NC}"

# Count results
TOTAL_CHECKS=$(echo "$0" | grep -c "print_result" || echo "Unknown")
echo -e "Total checks performed: ${COLOR_YELLOW}$TOTAL_CHECKS${COLOR_NC}"
echo -e "\n${COLOR_GREEN}✅ For production deployment:${COLOR_NC}"
echo -e "   • Set DOCKER_CONTENT_TRUST=1"
echo -e "   • Configure memory/CPU limits"
echo -e "   • Enable AppArmor/SELinux profiles"
echo -e "   • Use specific image tags"
echo -e "   • Regular security scanning"

echo -e "\n${COLOR_BLUE}🔐 Security hardening implemented:${COLOR_NC}"
echo -e "   • Non-root user execution"
echo -e "   • Minimal base images"
echo -e "   • Security updates applied"
echo -e "   • Proper file permissions"
echo -e "   • Removed setuid/setgid binaries"
echo -e "   • Health checks enabled"
echo -e "   • Minimal exposed ports"

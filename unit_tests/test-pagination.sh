#!/bin/bash

# Test script for server-side pagination with multiselect filters
# This script tests the pagination functionality of the Kubernetes API

set -e

echo "=== Testing Server-Side Pagination with Multiselect Filters ==="
echo

# Function to test with timing
test_with_timing() {
    local description="$1"
    local url="$2"

    echo "$description:"
    echo "URL: $url"

    # Time the request
    start_time=$(date +%s.%N)
    response=$(curl -s -w "\nHTTP_STATUS:%{http_code}\nTIME:%{time_total}" "$url")
    end_time=$(date +%s.%N)

    # Extract HTTP status and timing
    http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d: -f2)
    curl_time=$(echo "$response" | grep "TIME:" | cut -d: -f2)
    json_response=$(echo "$response" | sed '/HTTP_STATUS:/d' | sed '/TIME:/d')

    # Calculate total time
    total_time=$(echo "$end_time - $start_time" | bc -l)

    echo "HTTP Status: $http_status"
    echo "Curl Time: ${curl_time}s"
    echo "Total Time: ${total_time}s"

    if [ "$http_status" = "200" ]; then
        echo "✅ Success"
        echo "$json_response" | jq '.pagination'
        echo "Pods returned: $(echo "$json_response" | jq '.pods | length')"
        echo "Max limit reached: $(echo "$json_response" | jq '.max_limit_reached // false')"
    else
        echo "❌ Failed with status $http_status"
        echo "$json_response"
    fi
    echo
}

# Test basic pagination
test_with_timing "1. Testing basic pagination (page 1, size 10)" \
    "http://localhost:3000/api/kubernetes/pods?page=1&pageSize=10"

test_with_timing "2. Testing page 2 (size 10)" \
    "http://localhost:3000/api/kubernetes/pods?page=2&pageSize=10"

test_with_timing "3. Testing different page sizes (25)" \
    "http://localhost:3000/api/kubernetes/pods?page=1&pageSize=25"

test_with_timing "4. Testing sorting by name (asc)" \
    "http://localhost:3000/api/kubernetes/pods?page=1&pageSize=10&sortBy=name&sortOrder=asc"

test_with_timing "5. Testing sorting by name (desc)" \
    "http://localhost:3000/api/kubernetes/pods?page=1&pageSize=10&sortBy=name&sortOrder=desc"

test_with_timing "6. Testing single namespace filter (kube-system)" \
    "http://localhost:3000/api/kubernetes/pods?page=1&pageSize=10&namespaceFilter=kube-system"

test_with_timing "7. Testing multiple namespace filter (kube-system,default)" \
    "http://localhost:3000/api/kubernetes/pods?page=1&pageSize=10&namespaceFilter=kube-system,default"

test_with_timing "8. Testing single status filter (Running)" \
    "http://localhost:3000/api/kubernetes/pods?page=1&pageSize=10&statusFilter=Running"

test_with_timing "9. Testing multiple status filter (Running,Pending)" \
    "http://localhost:3000/api/kubernetes/pods?page=1&pageSize=10&statusFilter=Running,Pending"

test_with_timing "10. Testing large page size (100)" \
    "http://localhost:3000/api/kubernetes/pods?page=1&pageSize=100"

test_with_timing "11. Testing maximum page size (3000)" \
    "http://localhost:3000/api/kubernetes/pods?page=1&pageSize=3000"

test_with_timing "12. Testing combination of multiselect filters" \
    "http://localhost:3000/api/kubernetes/pods?page=1&pageSize=20&namespaceFilter=kube-system,default&statusFilter=Running,Pending"

echo "=== Pagination Test Complete ==="
echo
echo "Summary:"
echo "- Server-side pagination should now handle large numbers of pods efficiently"
echo "- Multiselect filters should work for both namespaces and statuses"
echo "- Each request should complete in under 20 seconds"
echo "- The API should return only the requested page of pods"
echo "- Pagination metadata should be accurate"
echo "- Max limit of 3000 pods should be enforced"

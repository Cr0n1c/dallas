#!/bin/bash

# Health check script for debugging readiness probe issues
# Usage: ./health-check.sh [pod-name]

set -e

POD_NAME=${1:-"debugger"}
NAMESPACE=${NAMESPACE:-"default"}

echo "=== Health Check for $POD_NAME ==="
echo "Namespace: $NAMESPACE"
echo "Timestamp: $(date)"
echo

# Check if pod exists and get status
echo "1. Pod Status:"
kubectl get pod $POD_NAME -n $NAMESPACE -o wide
echo

# Get pod events
echo "2. Recent Pod Events:"
kubectl describe pod $POD_NAME -n $NAMESPACE | grep -A 20 "Events:"
echo

# Check container logs
echo "3. Container Logs (last 50 lines):"
kubectl logs $POD_NAME -n $NAMESPACE --tail=50
echo

# Check readiness probe status
echo "4. Readiness Probe Status:"
kubectl get pod $POD_NAME -n $NAMESPACE -o jsonpath='{.status.containerStatuses[0].ready}' 2>/dev/null || echo "Unable to get readiness status"
echo

# Test connectivity to the service
echo "5. Service Connectivity Test:"
SERVICE_IP=$(kubectl get service debugger -n $NAMESPACE -o jsonpath='{.spec.clusterIP}' 2>/dev/null || echo "Service not found")
if [ "$SERVICE_IP" != "Service not found" ]; then
    echo "Service IP: $SERVICE_IP"
    echo "Testing /api/ready endpoint..."
    kubectl run test-connection --image=curlimages/curl --rm -it --restart=Never -- curl -f -s -m 10 "http://$SERVICE_IP:3000/api/ready" || echo "Connection failed"
else
    echo "Service not found"
fi
echo

# Check resource usage
echo "6. Resource Usage:"
kubectl top pod $POD_NAME -n $NAMESPACE 2>/dev/null || echo "Metrics not available"
echo

echo "=== Health Check Complete ==="

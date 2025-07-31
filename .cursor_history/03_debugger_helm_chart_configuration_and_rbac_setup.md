# Debugger Helm Chart Configuration and RBAC Setup
_Compiled from multiple cursor history files containing debugger Helm chart and Kubernetes configuration_

This document compiles the various conversations and configurations related to setting up the Dallas Debugger Helm chart and Kubernetes RBAC permissions.

---

## Helm Chart Structure

The Dallas Debugger uses a comprehensive Helm chart located in `charts/debugger/` with the following structure:

### Chart Metadata
```yaml
# charts/debugger/Chart.yaml
apiVersion: v2
name: dallas-debugger
description: A Helm chart for dallas-debugger application
type: application
version: 0.0.1
appVersion: "1.0.0"
```

### Key Templates
- `templates/deployment.yaml` - Main application deployment
- `templates/service.yaml` - Service configuration
- `templates/serviceaccount.yaml` - Service account for RBAC
- `templates/clusterrole.yaml` - Cluster-wide permissions
- `templates/clusterrolebinding.yaml` - Binds permissions to service account
- `templates/_helpers.tpl` - Template helpers and labels

## Deployment Configuration

### Main Deployment
The deployment runs as a single container with both frontend and backend services:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: debugger
  labels:
    {{- include "dallas-debugger.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount | default 1 }}
  selector:
    matchLabels:
      {{- include "dallas-debugger.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "dallas-debugger.labels" . | nindent 8 }}
    spec:
      serviceAccountName: debugger-sa
      containers:
        - name: "debugger"
          image: "{{ .Values.image.ecrRegistry }}.dkr.ecr.us-east-1.amazonaws.com/debugger:{{ .Values.image.tag }}"
          imagePullPolicy: Always
          ports:
            - name: http-frontend
              containerPort: 3000
              protocol: TCP
          env:
            - name: LOG_LEVEL
              value: {{ .Values.logLevel | quote }}
```

### Key Features
- **Service Account**: Uses `debugger-sa` for Kubernetes API access
- **Security Context**: Runs with non-root user and security constraints
- **Health Probes**: Comprehensive liveness, readiness, and startup probes
- **Volume Mounts**: Multiple temporary volumes for logs and runtime data
- **Resource Management**: Configurable CPU and memory limits

## RBAC Configuration

### Service Account
```yaml
# templates/serviceaccount.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: debugger-sa
  labels:
    {{- include "dallas-debugger.labels" . | nindent 4 }}
```

### Cluster Role
```yaml
# templates/clusterrole.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: debugger-cluster-role
  labels:
    {{- include "dallas-debugger.labels" . | nindent 4 }}
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "delete"]
  - apiGroups: [""]
    resources: ["namespaces"]
    verbs: ["get", "list"]
```

### Cluster Role Binding
```yaml
# templates/clusterrolebinding.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: debugger-cluster-role-binding
  labels:
    {{- include "dallas-debugger.labels" . | nindent 4 }}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: debugger-cluster-role
subjects:
  - kind: ServiceAccount
    name: debugger-sa
    namespace: {{ .Release.Namespace }}
```

## Health Probe Configuration

### Values Configuration
The health probes are configured in `values.yaml` with appropriate timeouts for the application startup:

```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 60
  timeoutSeconds: 10
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /api/ready
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 60
  timeoutSeconds: 5
  failureThreshold: 3

startupProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 60
  timeoutSeconds: 5
  failureThreshold: 30
```

### Probe Optimization History
The probes were optimized through several iterations:
1. **Initial Configuration**: Shorter intervals (10-30 seconds)
2. **Performance Optimization**: Increased to 60-second intervals to reduce CPU overhead
3. **Startup Handling**: Extended startup probe failure threshold for container initialization

## Security Features

### Pod Security Context
```yaml
podSecurityContext:
  runAsNonRoot: true
  runAsUser: 1001
  runAsGroup: 1001
  fsGroup: 1001

securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: false
  capabilities:
    drop:
      - ALL
```

### Access Control
- **Private Label**: Pods are labeled with `access: "private"` for network policy enforcement
- **RBAC Restrictions**: Minimal necessary permissions for Kubernetes API access
- **Image Security**: Uses ECR registry with specific image tags

## Deployment Commands

### Installation
```bash
# Install the debugger
helm install debugger ./charts/debugger

# Install with custom values
helm install debugger ./charts/debugger \
  --set logLevel=DEBUG \
  --set replicaCount=2

# Install in specific namespace
helm install debugger ./charts/debugger \
  --namespace debugger-namespace \
  --create-namespace
```

### Upgrades
```bash
# Upgrade existing deployment
helm upgrade debugger ./charts/debugger

# Upgrade with new values
helm upgrade debugger ./charts/debugger \
  --set image.tag=v1.1.0
```

### Monitoring
```bash
# Check deployment status
kubectl get pods -l app=debugger

# View logs
kubectl logs -f deployment/debugger

# Check service account permissions
kubectl auth can-i list pods --as=system:serviceaccount:default:debugger-sa
kubectl auth can-i delete pods --as=system:serviceaccount:default:debugger-sa

# Verify RBAC
kubectl get clusterrole debugger-cluster-role
kubectl get clusterrolebinding debugger-cluster-role-binding
kubectl describe clusterrolebinding debugger-cluster-role-binding
```

## Chart Validation

### Pre-commit Hooks
The Helm chart includes comprehensive validation through pre-commit hooks:

```yaml
# Helm chart linting
- id: helm-lint
  name: Helm Chart Lint
  entry: bash -c 'helm lint charts/debugger/ --strict'
  language: system
  files: ^charts/debugger/.*\.(yaml|yml|tpl)$

# Template validation
- id: helm-template-validate
  name: Helm Template Validation
  entry: bash -c 'helm template test-release charts/debugger/ --dry-run --debug >/dev/null'
  language: system
  files: ^charts/debugger/.*\.(yaml|yml|tpl)$

# Values validation
- id: helm-values-validate
  name: Helm Values Validation
  entry: bash -c 'cd charts/debugger && helm template test-release . --values values.yaml --dry-run >/dev/null'
  language: system
  files: ^charts/debugger/values\.yaml$

# Installation test
- id: helm-install-test
  name: Helm Installation Test
  entry: bash -c 'cd charts/debugger && helm install test-release . --dry-run --debug --namespace test-namespace --create-namespace >/dev/null'
  language: system
  files: ^charts/debugger/.*\.(yaml|yml)$

# Kubernetes resource validation
- id: kube-linter
  name: Kubernetes Resource Linting
  entry: bash -c 'cd charts/debugger && helm template . | kube-linter lint --exclude latest-tag,use-namespace,minimum-three-replicas,no-rolling-update-strategy -'
  language: system
  files: ^charts/debugger/.*\.(yaml|yml|tpl)$

# Dependency updates
- id: helm-dependency-update
  name: Helm Dependency Update
  entry: bash -c 'cd charts/debugger && helm dependency update >/dev/null'
  language: system
  files: ^charts/debugger/Chart\.yaml$
```

## Label Management

### Template Helpers
The chart uses consistent labeling through template helpers:

```yaml
{{/*
Common labels
*/}}
{{- define "dallas-debugger.labels" -}}
helm.sh/chart: {{ include "dallas-debugger.chart" . }}
{{ include "dallas-debugger.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
access: "private"
{{- end }}

{{/*
Selector labels
*/}}
{{- define "dallas-debugger.selectorLabels" -}}
app.kubernetes.io/name: {{ include "dallas-debugger.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
```

### Pod Label Configuration
Pods inherit all labels from the `dallas-debugger.labels` template, including:
- `helm.sh/chart: dallas-debugger`
- `app.kubernetes.io/name: debugger`
- `app.kubernetes.io/instance: <release-name>`
- `app.kubernetes.io/version: <app-version>`
- `app.kubernetes.io/managed-by: Helm`
- `access: "private"`

## Historical Configuration Changes

### HPA Configuration (Later Removed)
The chart initially included Horizontal Pod Autoscaler configuration:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: debugger-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: debugger
  minReplicas: 1
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

This was later removed in favor of manual scaling for better control in debugging scenarios.

## Troubleshooting

### Common Issues
1. **RBAC Permissions**: Ensure service account has proper cluster role binding
2. **Image Pull**: Verify ECR registry access and image tag existence
3. **Health Probes**: Check that application starts within probe timeout windows
4. **Resource Constraints**: Monitor CPU and memory usage for proper limits

### Debugging Commands
```bash
# Check pod status and events
kubectl describe pod <pod-name>

# View detailed logs
kubectl logs <pod-name> -c debugger --follow

# Test service account permissions
kubectl auth can-i list pods --as=system:serviceaccount:<namespace>:debugger-sa

# Validate chart templates
helm template debugger ./charts/debugger --debug
```

This Helm chart configuration provides a robust foundation for deploying the Dallas Debugger in Kubernetes environments with proper security, monitoring, and operational capabilities.

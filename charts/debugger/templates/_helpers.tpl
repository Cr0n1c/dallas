{{/* vim: set filetype=mustache: */}}

{{/*
Common labels
*/}}
{{- define "dallas-debugger.labels" -}}
helm.sh/chart: dallas-debugger
{{ include "dallas-debugger.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
teleport-autodiscover: "true"
access: "private"
{{- end }}

{{/*
Selector labels
*/}}
{{- define "dallas-debugger.selectorLabels" -}}
app.kubernetes.io/name: debugger
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

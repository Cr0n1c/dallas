import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Extract query parameters for pagination and multiselect filters
    const {
      page = '1',
      pageSize = '50',
      sortBy = 'name',
      sortOrder = 'asc',
      namespaceFilter,
      statusFilter
    } = req.query

    // Build query string
    const params = new URLSearchParams({
      page: page.toString(),
      page_size: pageSize.toString(),
      sort_by: sortBy.toString(),
      sort_order: sortOrder.toString(),
    })

    // Handle multiselect filters - convert arrays to comma-separated strings
    if (namespaceFilter) {
      const namespaces = Array.isArray(namespaceFilter)
        ? namespaceFilter.join(',')
        : namespaceFilter.toString()
      if (namespaces) {
        params.append('namespace_filter', namespaces)
      }
    }

    if (statusFilter) {
      const statuses = Array.isArray(statusFilter)
        ? statusFilter.join(',')
        : statusFilter.toString()
      if (statuses) {
        params.append('status_filter', statuses)
      }
    }

    // Proxy the request to the backend service
    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000'
    const response = await fetch(`${backendUrl}/api/kubernetes/pods?${params.toString()}`)

    if (!response.ok) {
      throw new Error(`Backend responded with status: ${response.status}`)
    }

    const data = await response.json()
    res.status(200).json(data)
  } catch (error) {
    console.error('Kubernetes pods request failed:', error)
    res.status(500).json({
      pods: [],
      error: 'Failed to fetch Kubernetes pod information',
      timestamp: new Date().toISOString()
    })
  }
}

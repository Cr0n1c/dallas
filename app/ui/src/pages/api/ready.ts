import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // First, check if frontend is ready
    const frontendReady = {
      status: 'ready',
      message: 'Frontend service is ready',
      timestamp: new Date().toISOString()
    }

    // Try to check backend, but don't fail if it's not ready yet
    try {
      const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:8000'
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000) // 3 second timeout

      const response = await fetch(`${backendUrl}/api/ready`, {
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        const backendData = await response.json()
        return res.status(200).json({
          ...frontendReady,
          backend: backendData
        })
      }
    } catch (backendError) {
      // Backend not ready yet, but frontend is ready
      console.log('Backend not ready yet, but frontend is ready:', backendError)
    }

    // Return frontend ready status even if backend is not ready
    res.status(200).json(frontendReady)
  } catch (error) {
    console.error('Frontend readiness check failed:', error)
    res.status(500).json({
      status: 'unready',
      error: 'Frontend service not ready',
      timestamp: new Date().toISOString()
    })
  }
}

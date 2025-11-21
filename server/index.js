import express from 'express'
import cors from 'cors'

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// Health check
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'MichiGuard MDOT proxy' })
})

app.get('/api/mdot/events', async (_req, res) => {
  // Note: MDOT 511 API endpoint appears unavailable. Using demo data.
  // TODO: Find correct Michigan 511 API endpoint or implement alternative data source
  console.log('→ Serving Michigan demo road events')
  
  const demoEvents = [
    {
      id: 'mdot-1',
      eventType: 'accident',
      description: 'Multi-vehicle accident reported on I-94 eastbound',
      latitude: 42.3314,
      longitude: -83.0458,
      startDate: new Date().toISOString(),
      endDate: null,
      impact: 'Heavy delays expected'
    },
    {
      id: 'mdot-2',
      eventType: 'construction',
      description: 'Road construction on M-10 (Lodge Freeway) - lane closure',
      latitude: 42.3601,
      longitude: -83.0707,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      impact: 'Moderate delays'
    },
    {
      id: 'mdot-3',
      eventType: 'closure',
      description: 'Bridge closed for emergency repairs on I-75 northbound',
      latitude: 42.3428,
      longitude: -83.0443,
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      impact: 'Major detour required'
    },
    {
      id: 'mdot-4',
      eventType: 'weather',
      description: 'Icy conditions reported on M-14 westbound',
      latitude: 42.3203,
      longitude: -83.7312,
      startDate: new Date().toISOString(),
      endDate: null,
      impact: 'Drive with caution'
    },
    {
      id: 'mdot-5',
      eventType: 'congestion',
      description: 'Heavy traffic on I-96 eastbound near downtown',
      latitude: 42.3455,
      longitude: -83.0632,
      startDate: new Date().toISOString(),
      endDate: null,
      impact: 'Slow moving traffic'
    },
    {
      id: 'mdot-6',
      eventType: 'incident',
      description: 'Disabled vehicle blocking right lane on I-696 eastbound',
      latitude: 42.4675,
      longitude: -83.1830,
      startDate: new Date().toISOString(),
      endDate: null,
      impact: 'Minor delays'
    }
  ]
  
  console.log('✓ Serving', demoEvents.length, 'demo Michigan road events')
  res.json(demoEvents)
})

app.listen(PORT, () => {
  console.log(`MichiGuard MDOT proxy server running on http://localhost:${PORT}`)
})

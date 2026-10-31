import { useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet'
import L from 'leaflet'
import { RouteStop } from '../api/client'
import { SimulatedBadge } from './SimulatedBadge'

interface RouteMapProps {
  stops: RouteStop[]
  vehicleCoord?: [number, number]
  vehicleName?: string
  height?: string
}

function createCustomIcon(type: 'pickup' | 'delivery' | 'vehicle', label?: string | number) {
  let bgColor = 'bg-emerald-600'
  let borderColor = 'border-emerald-800'
  let symbol = 'P'

  if (type === 'delivery') {
    bgColor = 'bg-purple-600'
    borderColor = 'border-purple-800'
    symbol = 'D'
  } else if (type === 'vehicle') {
    bgColor = 'bg-blue-600'
    borderColor = 'border-blue-800'
    symbol = '🚚'
  }

  const html = `
    <div class="relative flex items-center justify-center">
      <div class="w-8 h-8 rounded-full ${bgColor} text-white font-bold text-xs flex items-center justify-center shadow-md border-2 ${borderColor}">
        ${label !== undefined ? label : symbol}
      </div>
      <div class="absolute -bottom-1 w-2 h-2 ${bgColor} rotate-45"></div>
    </div>
  `

  return L.divIcon({
    html,
    className: 'custom-leaflet-pin',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  })
}

export function RouteMap({
  stops = [],
  vehicleCoord = [23.0225, 72.5714],
  vehicleName = 'Tata Ace (Van #1)',
  height = '420px',
}: RouteMapProps) {
  // Center coordinates on Ahmedabad
  const center: [number, number] = vehicleCoord || [23.0225, 72.5714]

  // Extract path polyline coordinates starting from vehicle
  const polylineCoords: [number, number][] = useMemo(() => {
    const coords: [number, number][] = []
    if (vehicleCoord) coords.push(vehicleCoord)
    stops.forEach((s) => {
      if (s.coord && s.coord.length === 2) {
        coords.push(s.coord)
      }
    })
    return coords
  }, [stops, vehicleCoord])

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-white">
      {/* Map Control Header */}
      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center space-x-3">
          <span className="font-semibold text-slate-700">Planned Route Map</span>
          <SimulatedBadge />
        </div>
        <div className="flex items-center space-x-4 text-slate-600">
          <span className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
            <span>Vehicle</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
            <span>Pickup (Donor)</span>
          </span>
          <span className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block"></span>
            <span>Delivery (NGO)</span>
          </span>
        </div>
      </div>

      {/* Leaflet Map */}
      <div style={{ height }}>
        <MapContainer
          center={center}
          zoom={13}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Vehicle Marker */}
          {vehicleCoord && (
            <Marker position={vehicleCoord} icon={createCustomIcon('vehicle')}>
              <Popup>
                <div className="text-xs p-1">
                  <strong className="block text-blue-700 font-bold">{vehicleName}</strong>
                  <span className="text-slate-500">Starting Depot / Live Position</span>
                  <div className="mt-1">
                    <SimulatedBadge />
                  </div>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Route Stops */}
          {stops.map((stop, idx) => (
            <Marker
              key={stop.stop_id || idx}
              position={stop.coord}
              icon={createCustomIcon(stop.stop_type, idx + 1)}
            >
              <Popup>
                <div className="text-xs p-1">
                  <div className="font-bold text-slate-800">
                    Stop #{idx + 1}: {stop.name}
                  </div>
                  <div className="text-slate-600 mt-0.5">
                    Type: <span className="font-semibold capitalize">{stop.stop_type}</span>
                  </div>
                  <div className="text-slate-600">
                    Load change: {stop.lot_change > 0 ? `+${stop.lot_change}` : stop.lot_change} lots
                  </div>
                  {stop.safe_deadline && (
                    <div className="text-rose-600 font-medium mt-1">
                      Safety deadline: {new Date(stop.safe_deadline).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Route Polyline connecting stops */}
          {polylineCoords.length > 1 && (
            <Polyline
              positions={polylineCoords}
              color="#2563eb"
              weight={4}
              opacity={0.8}
              dashArray="6, 8"
            />
          )}
        </MapContainer>
      </div>
    </div>
  )
}

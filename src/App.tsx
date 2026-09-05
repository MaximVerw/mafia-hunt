import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
// You MUST import Leaflet's CSS, or the map will look broken!
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default Leaflet marker icons in Vite/React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;


export default function App() {
  // Store the user's latitude and longitude
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check if the browser supports GPS
    if (!navigator.geolocation) {
      setError("Your browser doesn't support geolocation.");
      return;
    }

    // Request the current location
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition([pos.coords.latitude, pos.coords.longitude]);
      },
      (err) => {
        console.error(err);
        setError("Please allow location permissions to play the game.");
      },
      { enableHighAccuracy: true } // Crucial for a GPS driving game!
    );
  }, []);

  // What to show while waiting for the user to click "Allow" on the GPS prompt
  if (error) return <div style={{ padding: '20px', color: 'red' }}>{error}</div>;
  if (!position) return <div style={{ padding: '20px' }}>Locating your getaway car...</div>;

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      {/*
        MapContainer needs a specific height/width to show up.
        zoom={15} is a good street-level view.
      */}
      <MapContainer
        center={position}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
      >
        {/* The actual map background images (OpenStreetMap) */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Drop a pin on the user's location */}
        <Marker position={position}>
          <Popup>
            You are here. <br /> The Boss is watching.
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
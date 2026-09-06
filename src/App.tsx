import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { supabase } from './supabase';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

type Mission = {
  id: string;
  title: string;
  status: string; // Will now be 'available', 'pending', or 'captured'
  lat: number;
  lng: number;
  image_url?: string;
  proof_url?: string;
};

const isAdmin = new URLSearchParams(window.location.search).get('admin') === 'true';

export default function App() {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);

  // Track which missions THIS specific phone submitted
  const [mySubmissions, setMySubmissions] = useState<string[]>(() => {
    const saved = localStorage.getItem('mySubmissions');
    return saved ? JSON.parse(saved) : [];
  });

  const [newHostageLoc, setNewHostageLoc] = useState<{lat: number, lng: number} | null>(null);
  const [hostageName, setHostageName] = useState('');
  const [hostageFile, setHostageFile] = useState<File | null>(null);
  const [isAdminUploading, setIsAdminUploading] = useState(false);

  const [captureMission, setCaptureMission] = useState<Mission | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [isPlayerUploading, setIsPlayerUploading] = useState(false);

  const fetchMissions = async () => {
    const { data } = await supabase.from('missions').select('*');
    if (data) setMissions(data);
  };

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setPosition([pos.coords.latitude, pos.coords.longitude]),
      (err) => console.error(err),
      { enableHighAccuracy: true }
    );

    fetchMissions();

    const channel = supabase.channel('missions-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, () => {
        fetchMissions();
      }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // --- ADMIN FUNCTIONS ---
  const handleApprove = async (id: string) => {
    await supabase.from('missions').update({ status: 'captured' }).eq('id', id);
  };

  const handleReject = async (id: string) => {
    if (!window.confirm("Reject this proof? The hostage will reappear on the map for all teams.")) return;
    // Set back to available and clear the bad photo
    await supabase.from('missions').update({ status: 'available', proof_url: null }).eq('id', id);
  };

  const markAsCaptured = async (id: string) => {
    await supabase.from('missions').update({ status: 'captured' }).eq('id', id);
    fetchMissions(); // <-- ADD THIS
  };

  const handleDeleteMission = async (id: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this?")) return;
    await supabase.from('missions').delete().eq('id', id);
    fetchMissions(); // <-- ADD THIS
  };

  function AdminMapEvents() {
    useMapEvents({
      click(e) {
        if (isAdmin) setNewHostageLoc({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    });
    return null;
  }

  const handleCreateHostage = async () => {
    if (!newHostageLoc || !hostageName) return;
    setIsAdminUploading(true);
    let imageUrl = null;
    if (hostageFile) {
      const fileName = `${Math.random()}.${hostageFile.name.split('.').pop()}`;
      const { error } = await supabase.storage.from('hostages').upload(fileName, hostageFile);
      if (!error) imageUrl = supabase.storage.from('hostages').getPublicUrl(fileName).data.publicUrl;
    }
    await supabase.from('missions').insert([{
      title: hostageName, lat: newHostageLoc.lat, lng: newHostageLoc.lng, status: 'available', image_url: imageUrl
    }]);
    setNewHostageLoc(null); setHostageName(''); setHostageFile(null); setIsAdminUploading(false);
  };
// NEW: Admin Approves the photo
  const handleApproveCapture = async (id: string) => {
    await supabase.from('missions').update({ status: 'captured' }).eq('id', id);
    fetchMissions();
  };

  // NEW: Admin Rejects the photo (resets it for other teams to try)
  const handleRejectCapture = async (id: string) => {
    if (!window.confirm("Reject this photo and reset the hostage?")) return;
    await supabase.from('missions').update({
      status: 'available',
      proof_url: null // Clear out the bad photo
    }).eq('id', id);
    fetchMissions();
  };
  // --- PLAYER FUNCTIONS ---
  const handlePlayerCapture = async () => {
    if (!captureMission || !proofFile) return;
    setIsPlayerUploading(true);

    const fileName = `proof_${Math.random()}.${proofFile.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('proofs').upload(fileName, proofFile);

    let proofUrl = null;
    if (!error) {
       proofUrl = supabase.storage.from('proofs').getPublicUrl(fileName).data.publicUrl;
    }

    // NEW: Update status to 'pending' instead of 'captured'
    await supabase.from('missions').update({
      status: 'pending',
      proof_url: proofUrl
    }).eq('id', captureMission.id);

    // Save this mission ID to the phone's local storage so it knows it owns this pending dot
    const updatedSubmissions = [...mySubmissions, captureMission.id];
    setMySubmissions(updatedSubmissions);
    localStorage.setItem('mySubmissions', JSON.stringify(updatedSubmissions));

    setCaptureMission(null);
    setProofFile(null);
    setIsPlayerUploading(false);

    fetchMissions(); // <-- ADD THIS
  };

  if (!position) return <div style={{ padding: '20px' }}>Locating your getaway car...</div>;

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative' }}>

      {/* Admin Form Overlay (Unchanged) */}
      {newHostageLoc && (
        <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', background: 'white', padding: '20px', borderRadius: '8px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3>Drop New Hostage</h3>
          <input type="text" placeholder="Name" value={hostageName} onChange={(e) => setHostageName(e.target.value)} />
          <input type="file" accept="image/*" onChange={(e) => setHostageFile(e.target.files ? e.target.files[0] : null)} />
          <button onClick={handleCreateHostage}>{isAdminUploading ? 'Saving...' : 'Save'}</button>
          <button onClick={() => setNewHostageLoc(null)}>Cancel</button>
        </div>
      )}

      {/* Player Capture Overlay (Unchanged) */}
      {captureMission && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <h2 style={{ color: 'white', textAlign: 'center' }}>Secure: {captureMission.title}</h2>
          <input type="file" accept="image/*" capture="environment" onChange={(e) => setProofFile(e.target.files ? e.target.files[0] : null)} style={{ margin: '20px 0', color: 'white' }} />
          <div style={{ display: 'flex', gap: '15px' }}>
            <button onClick={handlePlayerCapture} disabled={isPlayerUploading || !proofFile} style={{ padding: '12px 24px', background: '#28a745', color: 'white', border: 'none', borderRadius: '5px' }}>
              {isPlayerUploading ? 'Uploading...' : 'Confirm Capture'}
            </button>
            <button onClick={() => { setCaptureMission(null); setProofFile(null); }} style={{ padding: '12px 24px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '5px' }}>Cancel</button>
          </div>
        </div>
      )}

      <MapContainer center={position} zoom={14} style={{ height: '100%', width: '100%', zIndex: 1 }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <AdminMapEvents />
        <Marker position={position}><Popup>You are here.</Popup></Marker>

        {/* Render Markers vs Dots */}
                {/* Render Markers vs Dots */}
                        {missions.map((mission) => {
                          const reactKey = `${mission.id}-${mission.status}`;

                          if (mission.status === 'available') {
                            // --- 1. UNCAPTURED PIN (Blue) ---
                            return (
                              <Marker key={reactKey} position={[mission.lat, mission.lng]}>
                                <Popup>
                                  {mission.image_url && <img src={mission.image_url} alt="Hostage" style={{ width: '100%', borderRadius: '4px', marginBottom: '8px' }} />}
                                  <strong style={{ fontSize: '16px' }}>{mission.title}</strong><br/>
                                  {isAdmin ? (
                                    <>
                                      <button onClick={() => markAsCaptured(mission.id)} style={{ width: '100%', marginTop: '10px', background: 'orange', color: 'white', border: 'none', padding: '8px', cursor: 'pointer' }}>Admin: Quick Capture</button>
                                      <button onClick={() => handleDeleteMission(mission.id)} style={{ width: '100%', marginTop: '5px', background: 'red', color: 'white', border: 'none', padding: '8px', cursor: 'pointer' }}>Admin: Delete</button>
                                    </>
                                  ) : (
                                    <button onClick={() => setCaptureMission(mission)} style={{ width: '100%', marginTop: '10px', background: 'black', color: 'white', border: 'none', padding: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Secure Hostage</button>
                                  )}
                                </Popup>
                              </Marker>
                            );
                          } else if (mission.status === 'pending') {
                            // --- 2. PENDING REVIEW DOT (Orange) ---
                            return (
                              <CircleMarker key={reactKey} center={[mission.lat, mission.lng]} radius={12} color="#d39e00" fillColor="#ffc107" fillOpacity={0.8}>
                                <Popup>
                                  <div style={{ textAlign: 'center' }}>
                                    <strong style={{ color: '#d39e00' }}>Reviewing: {mission.title}</strong>
                                    {mission.proof_url && <img src={mission.proof_url} alt="Proof" style={{ width: '200px', borderRadius: '8px', marginTop: '10px', display: 'block' }} />}

                                    {isAdmin ? (
                                      <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
                                        <button onClick={() => handleApproveCapture(mission.id)} style={{ flex: 1, background: '#28a745', color: 'white', border: 'none', padding: '8px', cursor: 'pointer', borderRadius: '4px' }}>Approve</button>
                                        <button onClick={() => handleRejectCapture(mission.id)} style={{ flex: 1, background: '#dc3545', color: 'white', border: 'none', padding: '8px', cursor: 'pointer', borderRadius: '4px' }}>Reject</button>
                                      </div>
                                    ) : (
                                      <p style={{ marginTop: '10px', fontStyle: 'italic', color: 'gray' }}>Waiting for the Boss to verify...</p>
                                    )}
                                  </div>
                                </Popup>
                              </CircleMarker>
                            );
                          } else {
                            // --- 3. APPROVED CAPTURED DOT (Green) ---
                            return (
                              <CircleMarker key={reactKey} center={[mission.lat, mission.lng]} radius={12} color="#198754" fillColor="#28a745" fillOpacity={0.8}>
                                <Popup>
                                  <div style={{ textAlign: 'center' }}>
                                    <strong style={{ color: '#28a745' }}>Secured: {mission.title}</strong>
                                    {mission.proof_url ? (
                                      <img src={mission.proof_url} alt="Proof" style={{ width: '200px', borderRadius: '8px', marginTop: '10px', display: 'block' }} />
                                    ) : (
                                      <p style={{ marginTop: '10px' }}>No photo provided.</p>
                                    )}
                                    {isAdmin && (
                                      <button onClick={() => handleDeleteMission(mission.id)} style={{ width: '100%', marginTop: '10px', background: 'red', color: 'white', border: 'none', padding: '8px', cursor: 'pointer', borderRadius: '4px' }}>Delete Dot</button>
                                    )}
                                  </div>
                                </Popup>
                              </CircleMarker>
                            );
                          }
                        })}
      </MapContainer>
    </div>
  );
}
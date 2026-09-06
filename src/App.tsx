import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { supabase } from './supabase';

// Standard Blue Pin for uncaptured hostages
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
const DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

// Custom icon for the Teams/Cars
const CarIcon = L.divIcon({
  html: '<div style="font-size: 30px; line-height: 30px; margin-top: -15px; margin-left: -15px;">🚘</div>',
  className: '',
  iconSize: [30, 30],
});

const isAdmin = new URLSearchParams(window.location.search).get('admin') === 'true';

const getOrCreateDeviceId = () => {
  let id = localStorage.getItem('deviceId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('deviceId', id);
  }
  return id;
};
const myDeviceId = getOrCreateDeviceId();

export default function App() {
  // Database States
  const [missions, setMissions] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  // Auth States
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentTeam, setCurrentTeam] = useState<any>(null);

  // Player UI States
  const [showRoster, setShowRoster] = useState(false);
  const [captureMission, setCaptureMission] = useState<any>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [isPlayerUploading, setIsPlayerUploading] = useState(false);

  // Admin UI States
  const [showAdminRoster, setShowAdminRoster] = useState(false);
  const [newHostageLoc, setNewHostageLoc] = useState<{lat: number, lng: number} | null>(null);
  const [hostageName, setHostageName] = useState('');
  const [hostageFile, setHostageFile] = useState<File | null>(null);
  const [isAdminUploading, setIsAdminUploading] = useState(false);

  // --- 1. DATA FETCHING & REALTIME ---
  const fetchAllData = async () => {
    const [mRes, tRes, uRes] = await Promise.all([
      supabase.from('missions').select('*'),
      supabase.from('teams').select('*'),
      supabase.from('users').select('*')
    ]);
    if (mRes.data) setMissions(mRes.data);
    if (tRes.data) setTeams(tRes.data);
    if (uRes.data) setUsers(uRes.data);

    const savedUserId = localStorage.getItem('userId');
    if (savedUserId && uRes.data) {
      const user = uRes.data.find(u => u.id === savedUserId);
      if (user) {
        setCurrentUser(user);
        if (user.team_id) {
          const team = tRes.data?.find(t => t.id === user.team_id);
          setCurrentTeam(team || null);
        } else {
          setCurrentTeam(null);
        }
      }
    }
  };

  useEffect(() => {
    fetchAllData();
    const channel = supabase.channel('game-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'missions' }, fetchAllData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, fetchAllData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, fetchAllData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // --- 2. THE DRIVING ENGINE (Live GPS) ---
  useEffect(() => {
    if (isAdmin || !currentTeam) return;

    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        await supabase.from('teams').update({ lat: latitude, lng: longitude }).eq('id', currentTeam.id);
      },
      (err) => console.error(err),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [currentTeam]);

  // --- 3. PLAYER FUNCTIONS ---
  const handleJoinTeam = async (userId: string, teamId: string) => {
    await supabase.from('users').update({ team_id: teamId, device_id: myDeviceId, is_reported: false }).eq('id', userId);
    localStorage.setItem('userId', userId);
    fetchAllData();
  };

  const handleLogin = async (userId: string) => {
    await supabase.from('users').update({ device_id: myDeviceId }).eq('id', userId);
    localStorage.setItem('userId', userId);
    fetchAllData();
  };

  const handleReportLiar = async (userId: string) => {
    if (!window.confirm("Report this person for not being in the car?")) return;
    await supabase.from('users').update({ is_reported: true }).eq('id', userId);
    fetchAllData();
  };

  const handlePlayerCapture = async () => {
    if (!captureMission || !proofFile || !currentTeam) return;
    setIsPlayerUploading(true);

    const fileName = `proof_${Math.random()}.${proofFile.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('proofs').upload(fileName, proofFile);

    let proofUrl = null;
    if (!error) {
       proofUrl = supabase.storage.from('proofs').getPublicUrl(fileName).data.publicUrl;
    }

    await supabase.from('missions').update({
      status: 'pending',
      proof_url: proofUrl,
      team_id: currentTeam.id
    }).eq('id', captureMission.id);

    setCaptureMission(null);
    setProofFile(null);
    setIsPlayerUploading(false);
    fetchAllData();
  };

  // --- 4. ADMIN FUNCTIONS ---
  const adminAssignUser = async (userId: string, teamId: string | null) => {
    await supabase.from('users').update({ team_id: teamId, is_reported: false }).eq('id', userId);
    fetchAllData();
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

  const markAsCaptured = async (id: string) => {
    await supabase.from('missions').update({ status: 'captured' }).eq('id', id);
    fetchAllData();
  };

  const handleApproveCapture = async (id: string) => {
    await supabase.from('missions').update({ status: 'captured' }).eq('id', id);
    fetchAllData();
  };

  const handleRejectCapture = async (id: string) => {
    if (!window.confirm("Reject this photo and reset the hostage?")) return;
    await supabase.from('missions').update({ status: 'available', proof_url: null, team_id: null }).eq('id', id);
    fetchAllData();
  };

  const handleDeleteMission = async (id: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this?")) return;
    await supabase.from('missions').delete().eq('id', id);
    fetchAllData();
  };

  // --- 5. RENDER LOGIN SCREEN ---
  if (!isAdmin && (!currentUser || !currentTeam)) {
    return (
      <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
        <h2>Who are you?</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {users.map(u => {
            const assignedTeam = teams.find(t => t.id === u.team_id);
            const isClaimedBySomeoneElse = u.device_id && u.device_id !== myDeviceId;

            return (
              <div key={u.id} style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isClaimedBySomeoneElse ? '#e0e0e0' : '#f9f9f9', opacity: isClaimedBySomeoneElse ? 0.6 : 1 }}>
                <strong style={{ fontSize: '18px', textDecoration: isClaimedBySomeoneElse ? 'line-through' : 'none' }}>{u.name}</strong>
                {isClaimedBySomeoneElse ? (
                  <span style={{ fontStyle: 'italic', color: 'red' }}>Already in a car</span>
                ) : u.team_id && assignedTeam ? (
                  <button onClick={() => handleLogin(u.id)} style={{ padding: '10px 15px', background: 'black', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                    Enter Game (🚘 {assignedTeam.driver_name})
                  </button>
                ) : (
                  <select onChange={(e) => handleJoinTeam(u.id, e.target.value)} defaultValue="" style={{ padding: '10px', borderRadius: '4px', border: '1px solid #aaa' }}>
                    <option value="" disabled>Select Driver to Join...</option>
                    {teams.map(t => <option key={t.id} value={t.id}>{t.driver_name}</option>)}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // --- 6. RENDER THE MAP ---
  const mapCenter: [number, number] = currentTeam?.lat ? [currentTeam.lat, currentTeam.lng] : [51.0543, 3.7174];

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative' }}>

      {/* Player Top Bar (Roster) */}
      {!isAdmin && (
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}>
          <button onClick={() => setShowRoster(!showRoster)} style={{ padding: '10px', background: 'black', color: 'white', border: 'none', borderRadius: '4px' }}>
            🚘 Who is in my car?
          </button>
          {showRoster && (
            <div style={{ background: 'white', padding: '10px', marginTop: '5px', border: '2px solid black', borderRadius: '4px' }}>
              <h4>{currentTeam?.driver_name}'s Car</h4>
              {users.filter(u => u.team_id === currentTeam?.id).map(u => (
                <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', gap: '15px' }}>
                  <span style={{ color: u.is_reported ? 'red' : 'black' }}>
                    {u.name} {u.is_reported && '(REPORTED)'}
                  </span>
                  {u.id !== currentUser?.id && (
                    <button onClick={() => handleReportLiar(u.id)}>Not here!</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Admin Top Bar (Roster) */}
      {isAdmin && (
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <button onClick={() => setShowAdminRoster(!showAdminRoster)} style={{ padding: '10px', background: 'purple', color: 'white', marginBottom: '10px', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}>
            👑 Manage Teams
          </button>

          {users.some(u => u.is_reported) && (
            <div style={{ background: 'red', color: 'white', padding: '10px', marginBottom: '10px', border: '2px solid darkred' }}>
              <h4 style={{ margin: '0 0 10px 0' }}>🚨 Liars Detected!</h4>
              {users.filter(u => u.is_reported).map(u => (
                <div key={u.id} style={{ display: 'flex', gap: '10px', marginBottom: '5px', alignItems: 'center' }}>
                  {u.name}
                  <button onClick={() => adminAssignUser(u.id, null)} style={{ cursor: 'pointer' }}>Kick to Unassigned</button>
                </div>
              ))}
            </div>
          )}

          {showAdminRoster && (
            <div style={{ background: 'white', padding: '15px', border: '2px solid black', maxHeight: '70vh', overflowY: 'auto', boxShadow: '0px 4px 6px rgba(0,0,0,0.3)' }}>
              <h4 style={{ margin: '0 0 15px 0' }}>All Players</h4>
              {users.map(u => (
                <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', gap: '15px', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>
                  <span style={{ color: u.is_reported ? 'red' : 'black', fontWeight: u.is_reported ? 'bold' : 'normal' }}>{u.name}</span>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <select value={u.team_id || ''} onChange={(e) => adminAssignUser(u.id, e.target.value || null)} style={{ padding: '5px' }}>
                      <option value="">-- Unassigned --</option>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.driver_name}</option>)}
                    </select>
                    {u.device_id && (
                      <button onClick={async () => { await supabase.from('users').update({ device_id: null }).eq('id', u.id); fetchAllData(); }} style={{ padding: '5px', background: 'orange', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                        🔓 Unlock
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Admin Add Hostage Overlay */}
      {newHostageLoc && (
        <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', background: 'white', padding: '20px', borderRadius: '8px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3>Drop New Hostage</h3>
          <input type="text" placeholder="Name" value={hostageName} onChange={(e) => setHostageName(e.target.value)} />
          <input type="file" accept="image/*" onChange={(e) => setHostageFile(e.target.files ? e.target.files[0] : null)} />
          <button onClick={handleCreateHostage}>{isAdminUploading ? 'Saving...' : 'Save'}</button>
          <button onClick={() => setNewHostageLoc(null)}>Cancel</button>
        </div>
      )}

      {/* Player Capture Camera Overlay */}
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

      <MapContainer center={mapCenter} zoom={14} style={{ height: '100%', width: '100%', zIndex: 1 }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <AdminMapEvents />

        {/* Render the Cars */}
        {teams.filter(t => t.lat && t.lng).map(team => (
          <Marker key={team.id} position={[team.lat, team.lng]} icon={CarIcon}>
            <Popup>
              <strong>{team.driver_name}'s Car</strong><br/>
              Passengers: {users.filter(u => u.team_id === team.id).map(u => u.name).join(', ')}
            </Popup>
          </Marker>
        ))}

        {/* Render Missions (Pins & Dots) */}
        {missions.map((mission) => {
          const reactKey = `${mission.id}-${mission.status}`;
          if (mission.status === 'available') {
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
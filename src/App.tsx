import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { supabase } from './supabase';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
const DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

// Reusable Oval Avatar Component
// Interface for OvalAvatar props
interface OvalAvatarProps {
  src?: string | null;
  name?: string;
  width?: number;
  height?: number;
  border?: string;
}

// Reusable Oval Avatar Component
const OvalAvatar = ({ src, name, width = 40, height = 52, border = '2px solid #333' }: OvalAvatarProps) => (
  <div style={{
    width: `${width}px`,
    height: `${height}px`,
    borderRadius: '50%',
    overflow: 'hidden',
    border: border,
    background: '#e0e0e0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  }}>
    {src ? (
      <img src={src} alt={name || 'User'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    ) : (
      <span style={{ fontSize: `${width * 0.5}px`, userSelect: 'none' }}>👤</span>
    )}
  </div>
);

// Typed car icon generator
const createCarIcon = (color?: string) => L.divIcon({
  html: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36" style="filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.6)); display: block;">
      <path
        fill="${color || '#000000'}"
        stroke="#ffffff"
        stroke-width="1.2"
        stroke-linejoin="round"
        d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.85 7h10.29l1.04 3H5.81l1.04-3zM19 17c-.83 0-1.5-.67-1.5-1.5S18.17 14 19 14s1.5.67 1.5 1.5S19.83 17 19 17zm-14 0c-.83 0-1.5-.67-1.5-1.5S4.17 14 5 14s1.5.67 1.5 1.5S5.83 17 5 17z"
      />
    </svg>
  `,
  className: '',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
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
  const [missions, setMissions] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentTeam, setCurrentTeam] = useState<any>(null);

  const [showRoster, setShowRoster] = useState(false);
  const [captureMission, setCaptureMission] = useState<any>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [isPlayerUploading, setIsPlayerUploading] = useState(false);

  const [showAdminRoster, setShowAdminRoster] = useState(false);
  const [newTargetLoc, setNewTargetLoc] = useState<{lat: number, lng: number} | null>(null);
  const [selectedTargetUserId, setSelectedTargetUserId] = useState('');
  const [isAdminUploading, setIsAdminUploading] = useState(false);

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
        if (user.device_id !== myDeviceId) {
          alert(`Your session was unlocked by the Admin. You have been disconnected!`);
          localStorage.removeItem('userId');
          setCurrentUser(null);
          setCurrentTeam(null);
          return;
        }

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

  const handleAvatarUpload = async (userId: string, file: File) => {
    const fileName = `avatar_${userId}_${Math.random()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('hostages').upload(fileName, file);
    if (!error) {
      const publicUrl = supabase.storage.from('hostages').getPublicUrl(fileName).data.publicUrl;
      await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', userId);
      fetchAllData();
    }
  };

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

  const adminAssignUser = async (userId: string, teamId: string | null) => {
    await supabase.from('users').update({ team_id: teamId, is_reported: false }).eq('id', userId);
    fetchAllData();
  };

  const adminDismissReport = async (userId: string) => {
    await supabase.from('users').update({ is_reported: false }).eq('id', userId);
    fetchAllData();
  };

  function AdminMapEvents() {
    useMapEvents({
      click(e) {
        if (isAdmin) setNewTargetLoc({ lat: e.latlng.lat, lng: e.latlng.lng });
      }
    });
    return null;
  }

  const handleCreateTarget = async () => {
    if (!newTargetLoc || !selectedTargetUserId) return;
    setIsAdminUploading(true);

    const targetUser = users.find(u => u.id === selectedTargetUserId);

    await supabase.from('missions').insert([{
      title: targetUser?.name || 'Target',
      user_id: selectedTargetUserId,
      lat: newTargetLoc.lat,
      lng: newTargetLoc.lng,
      status: 'available',
      image_url: targetUser?.avatar_url || null
    }]);

    setNewTargetLoc(null); setSelectedTargetUserId(''); setIsAdminUploading(false);
  };

  const handleApproveCapture = async (missionId: string) => {
    const mission = missions.find(m => m.id === missionId);
    if (!mission) return;

    await supabase.from('missions').update({ status: 'captured' }).eq('id', missionId);

    // Auto-assign captured user to the capturing team
    if (mission.user_id && mission.team_id) {
      await supabase.from('users').update({ team_id: mission.team_id }).eq('id', mission.user_id);
    }

    fetchAllData();
  };

  const handleRejectCapture = async (id: string) => {
    if (!window.confirm("Reject this photo and reset the target location?")) return;
    await supabase.from('missions').update({ status: 'available', proof_url: null, team_id: null }).eq('id', id);
    fetchAllData();
  };

  const handleDeleteMission = async (id: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this pin?")) return;
    await supabase.from('missions').delete().eq('id', id);
    fetchAllData();
  };

  // LOGIN SCREEN
  if (!isAdmin && !currentUser) {
    return (
      <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
        <h2>Who are you?</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {users.map(u => {
            const assignedTeam = teams.find(t => t.id === u.team_id);
            const isClaimedBySomeoneElse = u.device_id && u.device_id !== myDeviceId;

            // Check if Admin has placed a active target marker on the map for this user
            const hasAdminCreatedTarget = missions.some(m => m.user_id === u.id);

            return (
              <div key={u.id} style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isClaimedBySomeoneElse ? '#ffe6e6' : '#f9f9f9', opacity: isClaimedBySomeoneElse ? 0.7 : 1, gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <OvalAvatar src={u.avatar_url} name={u.name} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <strong style={{ fontSize: '18px', textDecoration: isClaimedBySomeoneElse ? 'line-through' : 'none' }}>{u.name}</strong>
                    <span style={{ fontSize: '12px', color: '#666' }}>
                      {assignedTeam ? `Team: ${assignedTeam.driver_name}` : hasAdminCreatedTarget ? 'Target Marker Active' : 'Unassigned'}
                    </span>
                    {!isClaimedBySomeoneElse && (
                      <label style={{ fontSize: '11px', color: '#0066cc', cursor: 'pointer', marginTop: '2px' }}>
                        📷 Change Portrait
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && handleAvatarUpload(u.id, e.target.files[0])} />
                      </label>
                    )}
                  </div>
                </div>

                {isClaimedBySomeoneElse ? (
                  <span style={{ fontSize: '14px', color: '#cc0000', fontWeight: 'bold' }}>🔒 Locked (Ask Boss)</span>
                ) : u.team_id && assignedTeam ? (
                  <button
                    onClick={() => handleLogin(u.id)}
                    style={{ padding: '10px 15px', background: 'black', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    Enter Game (🚘 {assignedTeam.driver_name})
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {/* ONLY allow spectator access if Admin created a target pin for this user */}
                    {hasAdminCreatedTarget && (
                      <button
                        onClick={() => handleLogin(u.id)}
                        style={{ padding: '10px 12px', background: '#17a2b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                      >
                        👁️ Watch as Spectator
                      </button>
                    )}

                    <select
                      onChange={(e) => handleJoinTeam(u.id, e.target.value)}
                      defaultValue=""
                      style={{ padding: '10px', borderRadius: '4px', border: '1px solid #aaa' }}
                    >
                      <option value="" disabled>Join Car...</option>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.driver_name}</option>)}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const mapCenter: [number, number] = currentTeam?.lat ? [currentTeam.lat, currentTeam.lng] : [51.0543, 3.7174];

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative' }}>

      {/* Spectator Read-Only Bar */}
      {!isAdmin && !currentTeam && (
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 1000, background: 'rgba(0,0,0,0.85)', color: 'white', padding: '8px 14px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <OvalAvatar src={currentUser?.avatar_url} name={currentUser?.name} width={28} height={36} border="1px solid #fff" />
          <span>👁️ Logged in as <strong>{currentUser?.name}</strong> (Spectator Mode)</span>
        </div>
      )}

      {/* Player Car Roster */}
      {!isAdmin && currentTeam && (
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}>
          <button onClick={() => setShowRoster(!showRoster)} style={{ padding: '10px', background: 'black', color: 'white', border: 'none', borderRadius: '4px' }}>
            🚘 Who is in my car?
          </button>
          {showRoster && (
            <div style={{ background: 'white', padding: '12px', marginTop: '5px', border: '2px solid black', borderRadius: '4px', minWidth: '220px' }}>
              <h4 style={{ margin: '0 0 10px 0' }}>{currentTeam?.driver_name}'s Car</h4>
              {users.filter(u => u.team_id === currentTeam?.id).map(u => (
                <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <OvalAvatar src={u.avatar_url} name={u.name} width={30} height={40} />
                    <span style={{ color: u.is_reported ? 'red' : 'black', fontWeight: u.id === currentUser?.id ? 'bold' : 'normal' }}>
                      {u.name} {u.is_reported && '(REPORTED)'}
                    </span>
                  </div>
                  {u.id !== currentUser?.id && (
                    <button onClick={() => handleReportLiar(u.id)} style={{ fontSize: '11px' }}>Not here!</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Admin Panel */}
      {isAdmin && (
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <button onClick={() => setShowAdminRoster(!showAdminRoster)} style={{ padding: '10px', background: 'purple', color: 'white', marginBottom: '10px', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}>
            👑 Manage Teams
          </button>

          {users.some(u => u.is_reported) && (
            <div style={{ background: 'red', color: 'white', padding: '10px', marginBottom: '10px', border: '2px solid darkred' }}>
              <h4 style={{ margin: '0 0 10px 0' }}>🚨 Discrepancies Reported!</h4>
              {users.filter(u => u.is_reported).map(u => (
                <div key={u.id} style={{ display: 'flex', gap: '8px', marginBottom: '5px', alignItems: 'center' }}>
                  <span>{u.name}</span>
                  <button onClick={() => adminAssignUser(u.id, null)} style={{ cursor: 'pointer', padding: '4px 8px', background: 'black', color: 'white', border: 'none', borderRadius: '3px' }}>
                    Remove
                  </button>
                  <button onClick={() => adminDismissReport(u.id)} style={{ cursor: 'pointer', padding: '4px 8px', background: 'white', color: 'black', border: 'none', borderRadius: '3px', fontWeight: 'bold' }}>
                    Ignore
                  </button>
                </div>
              ))}
            </div>
          )}

          {showAdminRoster && (
            <div style={{ background: 'white', padding: '15px', border: '2px solid black', maxHeight: '70vh', overflowY: 'auto', boxShadow: '0px 4px 6px rgba(0,0,0,0.3)' }}>
              <h4 style={{ margin: '0 0 15px 0' }}>All Players</h4>
              {users.map(u => (
                <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', gap: '15px', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <OvalAvatar src={u.avatar_url} name={u.name} width={30} height={40} />
                    <span style={{ color: u.is_reported ? 'red' : 'black', fontWeight: u.is_reported ? 'bold' : 'normal' }}>{u.name}</span>
                  </div>
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

      {/* Admin Add Target Overlay */}
      {newTargetLoc && (
        <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', background: 'white', padding: '20px', borderRadius: '8px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '260px' }}>
          <h3>Place User Target</h3>
          <select value={selectedTargetUserId} onChange={(e) => setSelectedTargetUserId(e.target.value)} style={{ padding: '8px' }}>
            <option value="">Select User Account...</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name} {u.team_id ? '(Assigned)' : '(Unassigned)'}</option>
            ))}
          </select>

          {selectedTargetUserId && (() => {
            const selectedUser = users.find(u => u.id === selectedTargetUserId);
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', background: '#f5f5f5', borderRadius: '6px' }}>
                <OvalAvatar src={selectedUser?.avatar_url} name={selectedUser?.name} />
                <span style={{ fontSize: '13px' }}>{selectedUser?.avatar_url ? 'Portrait attached' : 'No portrait set'}</span>
              </div>
            );
          })()}

          <button onClick={handleCreateTarget} disabled={!selectedTargetUserId}>{isAdminUploading ? 'Saving...' : 'Drop Pin'}</button>
          <button onClick={() => setNewTargetLoc(null)}>Cancel</button>
        </div>
      )}

      {/* Player Capture Overlay */}
      {captureMission && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <h2 style={{ color: 'white', textAlign: 'center' }}>Capture: {captureMission.title}</h2>
          <input type="file" accept="image/*" capture="environment" onChange={(e) => setProofFile(e.target.files ? e.target.files[0] : null)} style={{ margin: '20px 0', color: 'white' }} />
          <div style={{ display: 'flex', gap: '15px' }}>
            <button onClick={handlePlayerCapture} disabled={isPlayerUploading || !proofFile} style={{ padding: '12px 24px', background: '#28a745', color: 'white', border: 'none', borderRadius: '5px' }}>
              {isPlayerUploading ? 'Uploading...' : 'Confirm Photo'}
            </button>
            <button onClick={() => { setCaptureMission(null); setProofFile(null); }} style={{ padding: '12px 24px', background: '#dc3545', color: 'white', border: 'none', borderRadius: '5px' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Map Container */}
      <MapContainer center={mapCenter} zoom={14} style={{ height: '100%', width: '100%', zIndex: 1 }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <AdminMapEvents />

        {/* Cars on Map (Tapping shows passenger portraits) */}
        {teams.filter(t => t.lat && t.lng).map(team => {
          const isMyTeam = currentTeam?.id === team.id;
          const passengers = users.filter(u => u.team_id === team.id);

          return (
            <Marker key={team.id} position={[team.lat, team.lng]} icon={createCarIcon(team.color)} zIndexOffset={isMyTeam ? 1000 : 0}>
              <Popup>
                <div style={{ textAlign: 'center', minWidth: '160px' }}>
                  <strong style={{ fontSize: '15px' }}>{team.driver_name}'s Car</strong>
                  {isMyTeam && <span style={{ color: '#008800', fontWeight: 'bold', display: 'block', fontSize: '11px' }}>(Your Car)</span>}

                  <div style={{ marginTop: '10px', fontSize: '12px', fontWeight: 'bold', color: '#555' }}>Passengers ({passengers.length})</div>

                  {/* Oval Portrait Row */}
                  <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '10px', marginTop: '8px' }}>
                    {passengers.length > 0 ? (
                      passengers.map(p => (
                        <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '50px' }}>
                          <OvalAvatar src={p.avatar_url} name={p.name} width={38} height={50} border={`2px solid ${team.color || '#333'}`} />
                          <span style={{ fontSize: '11px', marginTop: '3px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '100%' }}>{p.name}</span>
                        </div>
                      ))
                    ) : (
                      <span style={{ fontStyle: 'italic', fontSize: '12px', color: '#888' }}>Empty car</span>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Target Pins */}
        {missions.map((mission) => {
          const reactKey = `${mission.id}-${mission.status}`;
          const targetUser = users.find(u => u.id === mission.user_id);
          const portraitUrl = targetUser?.avatar_url || mission.image_url;

          if (mission.status === 'available') {
            return (
              <Marker key={reactKey} position={[mission.lat, mission.lng]}>
                <Popup>
                  <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <OvalAvatar src={portraitUrl} name={mission.title} width={60} height={80} border="3px solid #dc3545" />
                    <strong style={{ fontSize: '16px', marginTop: '6px' }}>{mission.title}</strong>

                    {isAdmin ? (
                      <>
                        <button onClick={() => handleApproveCapture(mission.id)} style={{ width: '100%', marginTop: '10px', background: 'orange', color: 'white', border: 'none', padding: '8px', cursor: 'pointer' }}>Admin: Quick Capture</button>
                        <button onClick={() => handleDeleteMission(mission.id)} style={{ width: '100%', marginTop: '5px', background: 'red', color: 'white', border: 'none', padding: '8px', cursor: 'pointer' }}>Admin: Delete Pin</button>
                      </>
                    ) : currentTeam ? (
                      <button onClick={() => setCaptureMission(mission)} style={{ width: '100%', marginTop: '10px', background: 'black', color: 'white', border: 'none', padding: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Capture Target</button>
                    ) : (
                      <span style={{ fontSize: '12px', color: '#666', fontStyle: 'italic', display: 'block', marginTop: '5px' }}>Unclaimed target</span>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          } else if (mission.status === 'pending') {
            return (
              <CircleMarker key={reactKey} center={[mission.lat, mission.lng]} radius={14} color="#d39e00" fillColor="#ffc107" fillOpacity={0.8}>
                <Popup>
                  <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <strong style={{ color: '#d39e00' }}>Reviewing: {mission.title}</strong>
                    <div style={{ margin: '8px 0' }}>
                      <OvalAvatar src={portraitUrl} name={mission.title} width={50} height={66} border="2px solid #d39e00" />
                    </div>
                    {mission.proof_url && <img src={mission.proof_url} alt="Proof" style={{ width: '200px', borderRadius: '8px', display: 'block' }} />}
                    {isAdmin ? (
                      <div style={{ display: 'flex', gap: '5px', marginTop: '10px', width: '100%' }}>
                        <button onClick={() => handleApproveCapture(mission.id)} style={{ flex: 1, background: '#28a745', color: 'white', border: 'none', padding: '8px', cursor: 'pointer', borderRadius: '4px' }}>Approve</button>
                        <button onClick={() => handleRejectCapture(mission.id)} style={{ flex: 1, background: '#dc3545', color: 'white', border: 'none', padding: '8px', cursor: 'pointer', borderRadius: '4px' }}>Reject</button>
                      </div>
                    ) : (
                      <p style={{ marginTop: '10px', fontStyle: 'italic', color: 'gray' }}>Waiting for verification...</p>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            );
          } else {
            const capturingTeam = teams.find(t => t.id === mission.team_id);
            const teamColor = capturingTeam?.color || '#28a745';

            return (
              <CircleMarker key={reactKey} center={[mission.lat, mission.lng]} radius={14} color={teamColor} fillColor={teamColor} fillOpacity={0.8}>
                <Popup>
                  <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <strong style={{ color: teamColor }}>Captured: {mission.title}</strong>
                    <div style={{ margin: '8px 0' }}>
                      <OvalAvatar src={portraitUrl} name={mission.title} width={50} height={66} border={`2px solid ${teamColor}`} />
                    </div>
                    {mission.proof_url ? (
                      <img src={mission.proof_url} alt="Proof" style={{ width: '200px', borderRadius: '8px', display: 'block' }} />
                    ) : (
                      <p style={{ marginTop: '10px' }}>No proof photo provided.</p>
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
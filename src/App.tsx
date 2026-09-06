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

// NEW: A custom icon for the Teams/Cars!
const CarIcon = L.divIcon({
  html: '<div style="font-size: 30px; line-height: 30px; margin-top: -15px; margin-left: -15px;">🚘</div>',
  className: '', // Removes default leaflet styling
  iconSize: [30, 30],
});

const isAdmin = new URLSearchParams(window.location.search).get('admin') === 'true';
// NEW: Generate a unique ID for this specific phone/browser
const getOrCreateDeviceId = () => {
  let id = localStorage.getItem('deviceId');
  if (!id) {
    id = crypto.randomUUID(); // Creates a random string
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

  // UI States
  const [showRoster, setShowRoster] = useState(false);
  const [captureMission, setCaptureMission] = useState<any>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);

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

      // Auto-login from memory
      const savedUserId = localStorage.getItem('userId');
      if (savedUserId && uRes.data) {
        const user = uRes.data.find(u => u.id === savedUserId);
        if (user) {
          setCurrentUser(user);

          // NEW: If they have a team, set it. If not, clear it out!
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

    // watchPosition continuously fires as the phone moves down the street!
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        // Update the car's location in the database
        await supabase.from('teams').update({ lat: latitude, lng: longitude }).eq('id', currentTeam.id);
      },
      (err) => console.error(err),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [currentTeam]);

 const handleJoinTeam = async (userId: string, teamId: string) => {
     // NEW: Save myDeviceId to claim this user
     await supabase.from('users').update({
       team_id: teamId,
       device_id: myDeviceId,
       is_reported: false
     }).eq('id', userId);

     localStorage.setItem('userId', userId);
     fetchAllData();
   };

   const handleLogin = async (userId: string) => {
     // NEW: Claim the user even if the admin pre-assigned the team
     await supabase.from('users').update({ device_id: myDeviceId }).eq('id', userId);

     localStorage.setItem('userId', userId);
     fetchAllData();
   };
// NEW: State to toggle the admin management menu
  const [showAdminRoster, setShowAdminRoster] = useState(false);

  // NEW: Admin force-assigns a user to a team (or unassigns them if teamId is null)
  const adminAssignUser = async (userId: string, teamId: string | null) => {
    await supabase.from('users').update({
      team_id: teamId,
      is_reported: false // Automatically clears any red flags!
    }).eq('id', userId);

    // The real-time websocket will instantly push this change to all phones
    fetchAllData();
  };
  const handleReportLiar = async (userId: string) => {
    if (!window.confirm("Report this person for not being in the car?")) return;
    await supabase.from('users').update({ is_reported: true }).eq('id', userId);
    fetchAllData();
  };

  const adminKickUser = async (userId: string) => {
    await supabase.from('users').update({ team_id: null, is_reported: false }).eq('id', userId);
    fetchAllData();
  };

    // --- 4. RENDER LOGIN SCREEN ---
    if (!isAdmin && (!currentUser || !currentTeam)) {
      return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
          <h2>Who are you?</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

            {users.map(u => {
                        const assignedTeam = teams.find(t => t.id === u.team_id);

                        // NEW: Check if someone else's phone already claimed this name!
                        const isClaimedBySomeoneElse = u.device_id && u.device_id !== myDeviceId;

                        return (
                          <div key={u.id} style={{ border: '1px solid #ccc', padding: '15px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: isClaimedBySomeoneElse ? '#e0e0e0' : '#f9f9f9', opacity: isClaimedBySomeoneElse ? 0.6 : 1 }}>

                            <strong style={{ fontSize: '18px', textDecoration: isClaimedBySomeoneElse ? 'line-through' : 'none' }}>
                              {u.name}
                            </strong>

                            {isClaimedBySomeoneElse ? (
                              <span style={{ fontStyle: 'italic', color: 'red' }}>Already in a car</span>
                            ) : u.team_id && assignedTeam ? (
                              <button onClick={() => handleLogin(u.id)} style={{ padding: '10px 15px', background: 'black', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                                Enter Game (🚘 {assignedTeam.driver_name})
                              </button>
                            ) : (
                              <select onChange={(e) => handleJoinTeam(u.id, e.target.value)} defaultValue="" style={{ padding: '10px', borderRadius: '4px', border: '1px solid #aaa' }}>
                                <option value="" disabled>Select Driver to Join...</option>
                                {teams.map(t => (
                                  <option key={t.id} value={t.id}>{t.driver_name}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        );
                      })}
          </div>
        </div>
      );
    }

  // --- 5. RENDER THE MAP ---
  // Default map center (Ghent) if no GPS yet
  const mapCenter: [number, number] = currentTeam?.lat ? [currentTeam.lat, currentTeam.lng] : [51.0543, 3.7174];

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative' }}>

      {/* Top Bar for Players */}
      {!isAdmin && (
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000 }}>
          <button onClick={() => setShowRoster(!showRoster)} style={{ padding: '10px', background: 'black', color: 'white' }}>
            🚘 Who is in my car?
          </button>

          {showRoster && (
            <div style={{ background: 'white', padding: '10px', marginTop: '5px', border: '2px solid black' }}>
              <h4>{currentTeam.driver_name}'s Car</h4>
              {users.filter(u => u.team_id === currentTeam.id).map(u => (
                <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span style={{ color: u.is_reported ? 'red' : 'black' }}>
                    {u.name} {u.is_reported && '(REPORTED)'}
                  </span>
                  {u.id !== currentUser.id && (
                    <button onClick={() => handleReportLiar(u.id)}>Not here!</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- NEW: Ultimate Admin Control Panel --- */}
            {isAdmin && (
              <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>

                <button
                  onClick={() => setShowAdminRoster(!showAdminRoster)}
                  style={{ padding: '10px', background: 'purple', color: 'white', marginBottom: '10px', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}
                >
                  👑 Manage Teams
                </button>

                {/* Priority Alert: Only shows if someone was actively reported by their car */}
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

                {/* Full Roster Control: Shows all users and lets Admin move them anywhere */}
                {showAdminRoster && (
                  <div style={{ background: 'white', padding: '15px', border: '2px solid black', maxHeight: '70vh', overflowY: 'auto', boxShadow: '0px 4px 6px rgba(0,0,0,0.3)' }}>
                    <h4 style={{ margin: '0 0 15px 0' }}>All Players</h4>
                    {users.map(u => (
                      <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', gap: '15px', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>

                        <span style={{ color: u.is_reported ? 'red' : 'black', fontWeight: u.is_reported ? 'bold' : 'normal' }}>
                          {u.name}
                        </span>

                        {/* The Admin Dropdown */}
                        <select
                          value={u.team_id || ''}
                          onChange={(e) => adminAssignUser(u.id, e.target.value || null)}
                          style={{ padding: '5px' }}
                        >
                          <option value="">-- Unassigned --</option>
                          {teams.map(t => (
                            <option key={t.id} value={t.id}>{t.driver_name}</option>
                          ))}
                        </select>{/* NEW: Unlock button in case a player grabs the wrong name or buys a new phone mid-game */}
                                                   {u.device_id && (
                                                     <button
                                                       onClick={async () => {
                                                         await supabase.from('users').update({ device_id: null }).eq('id', u.id);
                                                         fetchAllData();
                                                       }}
                                                       style={{ padding: '5px', background: 'orange', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                                     >
                                                       🔓 Unlock Device
                                                     </button>
                                                   )}

                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

      <MapContainer center={mapCenter} zoom={14} style={{ height: '100%', width: '100%', zIndex: 1 }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {/* Render the Teams (Cars) */}
        {teams.filter(t => t.lat && t.lng).map(team => (
          <Marker key={team.id} position={[team.lat, team.lng]} icon={CarIcon}>
            <Popup>
              <strong>{team.driver_name}'s Car</strong><br/>
              Passengers: {users.filter(u => u.team_id === team.id).map(u => u.name).join(', ')}
            </Popup>
          </Marker>
        ))}

        {/* ... (Render Missions Map Loop from before) ... */}
      </MapContainer>
    </div>
  );
}
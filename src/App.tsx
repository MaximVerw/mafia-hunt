import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { supabase } from './supabase';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
const DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

import imageCompression from 'browser-image-compression';

// Helper function to crush image sizes down to kilobytes
const compressImage = async (imageFile: File) => {
  const options = {
    maxSizeMB: 0.05, // Target max size: ~50 KB
    maxWidthOrHeight: 600, // Resize so the longest side is max 600px
    useWebWorker: true,
  };

  try {
    const compressedFile = await imageCompression(imageFile, options);
    return compressedFile;
  } catch (error) {
    console.error("Fout bij comprimeren:", error);
    return imageFile; // Fallback to the original file if compression fails
  }
};

// Interface voor OvalAvatar props
interface OvalAvatarProps {
  src?: string | null;
  name?: string;
  width?: number;
  height?: number;
  border?: string;
}

// Reusable Oval Avatar Component
const OvalAvatar = ({ src, name, width = 40, height = 52, border = '2px solid #d4af37' }: OvalAvatarProps) => (
  <div style={{
    width: `${width}px`,
    height: `${height}px`,
    borderRadius: '50%',
    overflow: 'hidden',
    border: border,
    background: '#1a1a1a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 2px 5px rgba(0,0,0,0.8)'
  }}>
    {src ? (
      <img src={src} alt={name || 'Mafioso'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    ) : (
      <span style={{ fontSize: `${width * 0.5}px`, userSelect: 'none' }}>🕶️</span>
    )}
  </div>
);

// Mafia Car icon generator with Emote support
const createCarIcon = (color?: string, emoteUrl?: string, emoteUpdatedAt?: string) => {
  let emoteHtml = '';

  if (emoteUrl && emoteUpdatedAt) {
    const ageMs = Date.now() - new Date(emoteUpdatedAt).getTime();

    // Show emote if uploaded within the last 15 seconds
    if (ageMs < 15000) {
      emoteHtml = `
        <div
          onclick="event.stopPropagation(); this.style.transform = this.style.transform === 'scale(2.5) translateY(-10px)' ? 'none' : 'scale(2.5) translateY(-10px)'; this.style.zIndex = this.style.zIndex === '3000' ? '2000' : '3000';"
          style="position: absolute; top: -65px; left: -10px; width: 60px; height: 60px; background: #111; border-radius: 8px; border: 2px solid #d4af37; padding: 2px; box-shadow: 0 4px 10px rgba(0,0,0,0.9); z-index: 2000; display: flex; align-items: center; justify-content: center; overflow: visible; animation: popIn 0.3s ease-out; cursor: pointer; transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), z-index 0.3s ease; transform-origin: bottom center;"
        >
          <img src="${emoteUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px;" />
          <div style="position: absolute; bottom: -8px; left: 24px; width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid #d4af37;"></div>
          <div style="position: absolute; bottom: -5px; left: 26px; width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-top: 6px solid #111;"></div>
        </div>
      `;
    }
  }

  return L.divIcon({
    html: `
      <div style="position: relative;">
        ${emoteHtml}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="38" height="38" style="filter: drop-shadow(0px 3px 6px rgba(0,0,0,0.9)); display: block;">
          <path fill="${color || '#b22222'}" stroke="#ffd700" stroke-width="1.2" stroke-linejoin="round" d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.85 7h10.29l1.04 3H5.81l1.04-3zM19 17c-.83 0-1.5-.67-1.5-1.5S18.17 14 19 14s1.5.67 1.5 1.5S19.83 17 19 17zm-14 0c-.83 0-1.5-.67-1.5-1.5S4.17 14 5 14s1.5.67 1.5 1.5S5.83 17 5 17z"/>
        </svg>
      </div>
    `,
    className: '',
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
};

// Portrait icon voor gijzelaars/gevangen mafiosi op de kaart
const createPortraitIcon = (avatarUrl?: string | null, borderColor: string = '#8b0000') => L.divIcon({
  html: `
    <div style="
      width: 44px;
      height: 58px;
      border-radius: 50%;
      border: 3px solid ${borderColor};
      background: #111;
      overflow: hidden;
      box-shadow: 0px 4px 10px rgba(0,0,0,0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
    ">
      ${avatarUrl && avatarUrl.trim() !== ''
        ? `<img
            src="${avatarUrl}"
            alt="Gijzelaar"
            referrerpolicy="no-referrer"
            style="width: 100% !important; height: 100% !important; max-width: 100% !important; max-height: 100% !important; object-fit: cover; display: block;"
            onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';"
          />
          <span style="display:none; font-size:24px; user-select:none;">🕶️</span>`
        : `<span style="font-size:24px; user-select:none;">🕶️</span>`
      }
    </div>
  `,
  className: '',
  iconSize: [44, 58],
  iconAnchor: [22, 29],
});

const createDestinationIcon = () => L.divIcon({
  html: `
    <div style="
      width: 44px; height: 44px;
      background: #111; border: 3px solid #00ffff; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0px 4px 10px rgba(0,0,0,0.9);
    ">
      <span style="font-size: 22px;">🏁</span>
    </div>
  `,
  className: '',
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

// Geredde gijzelaar icon: Gold/Team badge met vinkje rechtsonder
const createCapturedCheckIcon = (avatarUrl?: string | null, teamColor: string = '#28a745') => L.divIcon({
  html: `
    <div style="position: relative; width: 44px; height: 58px;">
      <div style="
        width: 44px;
        height: 58px;
        border-radius: 50%;
        border: 3px solid ${teamColor};
        background: #111;
        overflow: hidden;
        box-shadow: 0px 4px 10px rgba(0,0,0,0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
      ">
        ${avatarUrl && avatarUrl.trim() !== ''
          ? `<img
              src="${avatarUrl}"
              alt="Geredde Mafioso"
              referrerpolicy="no-referrer"
              style="width: 100% !important; height: 100% !important; max-width: 100% !important; max-height: 100% !important; object-fit: cover; display: block;"
              onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';"
            />
            <span style="display:none; font-size:24px; user-select:none;">🤝</span>`
          : `<span style="font-size:24px; user-select:none;">🤝</span>`
        }
      </div>

      <div style="
        position: absolute;
        bottom: -2px;
        right: -4px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: ${teamColor};
        border: 2px solid #ffd700;
        box-shadow: 0px 2px 5px rgba(0,0,0,0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        z-index: 10;
      ">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
    </div>
  `,
  className: '',
  iconSize: [44, 58],
  iconAnchor: [22, 29],
});

const isAdmin = new URLSearchParams(window.location.search).get('admin') === 'true';

// Returns a color gradient from NOW (0m ago -> Bright Red/Orange) to 30m ago (Dodger Blue)
const getSegmentColor = (timestamp?: string) => {
  if (!timestamp) return 'rgb(255, 69, 0)';
  const now = Date.now();
  const time = new Date(timestamp).getTime();
  const ageMs = Math.max(0, now - time);
  const maxAgeMs = 30 * 60 * 1000;

  const ratio = Math.min(1, ageMs / maxAgeMs);

  const r = Math.round(255 + (30 - 255) * ratio);
  const g = Math.round(69 + (144 - 69) * ratio);
  const b = Math.round(0 + (255 - 0) * ratio);

  return `rgb(${r}, ${g}, ${b})`;
};

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
  const [destination, setDestination] = useState<any>(null);

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

  const [locationLogs, setLocationLogs] = useState<any[]>([]);
  const [selectedUserForTrail, setSelectedUserForTrail] = useState<string>('');
  const [isUploadingEmote, setIsUploadingEmote] = useState(false);

  const selectedUserForTrailRef = useRef<string>('');
  selectedUserForTrailRef.current = selectedUserForTrail;

  const fetchAllData = async () => {
    const [mRes, tRes, uRes, dRes] = await Promise.all([
      supabase.from('missions').select('*'),
      supabase.from('teams').select('*'),
      supabase.from('users').select('*'),
      supabase.from('destinations').select('*').eq('id', 'active').maybeSingle()
    ]);

    if (mRes.data) setMissions(mRes.data);
    if (tRes.data) setTeams(tRes.data);
    if (uRes.data) setUsers(uRes.data);
    setDestination(dRes.data || null);

    const savedUserId = localStorage.getItem('userId');
    if (savedUserId && uRes.data) {
      const user = uRes.data.find(u => u.id === savedUserId);
      if (user) {
        if (user.device_id !== myDeviceId) {
          alert(`Je toegang is ingetrokken op bevel van de Don (*Silenzio*).`);
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
    const pollInterval = setInterval(() => {
      fetchAllData();
    }, 5000);

    return () => clearInterval(pollInterval);
  }, []);

  const currentUserRef = useRef<any>(currentUser);
  currentUserRef.current = currentUser;

  const currentTeamRef = useRef<any>(currentTeam);
  currentTeamRef.current = currentTeam;

  const lastInsertTimeRef = useRef<number>(0);

  // GPS position updates & history throttling
  useEffect(() => {
    if (isAdmin || !currentUser) return;

    const fetchFreshLocation = () => {
      const activeUser = currentUserRef.current;
      if (!activeUser) return;

      const optionsHigh = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
      const optionsLow = { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 };

      const handleSuccess = async (pos: GeolocationPosition) => {
        const { latitude, longitude } = pos.coords;
        const activeTeam = currentTeamRef.current;

        if (activeTeam) {
          await supabase.from('teams').update({ lat: latitude, lng: longitude }).eq('id', activeTeam.id);
          setTeams((prev: any[]) => prev.map((t: any) => t.id === activeTeam.id ? { ...t, lat: latitude, lng: longitude } : t));
          setCurrentTeam((prev: any) => prev ? { ...prev, lat: latitude, lng: longitude } : null);
        }

        const now = Date.now();
        if (now - lastInsertTimeRef.current >= 15000) {
          lastInsertTimeRef.current = now;

          await supabase.from('location_history').insert([{
            user_id: activeUser.id,
            team_id: activeTeam?.id || null,
            lat: latitude,
            lng: longitude
          }]);
        }
      };

      const handleError = (err: GeolocationPositionError) => {
        console.warn(`GPS Error (${err.code}): ${err.message}. Retrying with low accuracy...`);
        navigator.geolocation.getCurrentPosition(
          handleSuccess,
          (fallbackErr) => console.error(`GPS Fallback Error (${fallbackErr.code}): ${fallbackErr.message}`),
          optionsLow
        );
      };

      navigator.geolocation.getCurrentPosition(handleSuccess, handleError, optionsHigh);
    };

    fetchFreshLocation();
    const intervalId = setInterval(fetchFreshLocation, 15000);

    return () => clearInterval(intervalId);
  }, [isAdmin, currentUser?.id]);

  const handleEmoteUpload = async (file: File) => {
    if (!currentTeam) return;

    const teamEmoteAge = currentTeam.emote_updated_at ? Date.now() - new Date(currentTeam.emote_updated_at).getTime() : 999999;
    if (teamEmoteAge < 30000) {
      alert('De crew heeft zojuist al een emote gestuurd! Wacht 30 seconden.');
      return;
    }

    setIsUploadingEmote(true);
    const compressedFile = await compressImage(file);
    const fileName = `emote_${currentTeam.id}_${Math.random()}.${compressedFile.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('emotes').upload(fileName, compressedFile);

    if (!error) {
      const publicUrl = supabase.storage.from('emotes').getPublicUrl(fileName).data.publicUrl;
      await supabase.from('teams').update({
        emote_url: publicUrl,
        emote_updated_at: new Date().toISOString()
      }).eq('id', currentTeam.id);

      fetchAllData();
    } else {
      alert('Fout bij uploaden emote.');
    }
    setIsUploadingEmote(false);
  };

  const handleSetDestination = async () => {
    if (!newTargetLoc) return;
    setIsAdminUploading(true);

    await supabase.from('destinations').upsert({
      id: 'active',
      title: 'Checkpoint',
      lat: newTargetLoc.lat,
      lng: newTargetLoc.lng,
      created_at: new Date().toISOString()
    });

    setNewTargetLoc(null);
    setIsAdminUploading(false);
    fetchAllData();
  };

  const handleClearDestination = async () => {
    if (!window.confirm("Huidige bestemming verwijderen?")) return;
    await supabase.from('destinations').delete().eq('id', 'active');
    fetchAllData();
  };

  const fetchLocationLogs = async (userId: string) => {
    setSelectedUserForTrail(userId);
    if (!userId) {
      setLocationLogs([]);
      return;
    }

    const { data } = await supabase
      .from('location_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (data) setLocationLogs(data);
  };

  const handleAvatarUpload = async (userId: string, file: File) => {
    const compressedFile = await compressImage(file);
    const fileName = `avatar_${userId}_${Math.random()}.${compressedFile.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('hostages').upload(fileName, compressedFile);
    if (!error) {
      const publicUrl = supabase.storage.from('hostages').getPublicUrl(fileName).data.publicUrl;
      await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', userId);
      fetchAllData();
    }
  };

  const handleJoinTeam = async (userId: string, teamId: string) => {
    await supabase.from('users').update({ team_id: teamId, device_id: myDeviceId }).eq('id', userId);
    localStorage.setItem('userId', userId);
    fetchAllData();
  };

  const handleLogin = async (userId: string) => {
    await supabase.from('users').update({ device_id: myDeviceId }).eq('id', userId);
    localStorage.setItem('userId', userId);
    fetchAllData();
  };

  const handlePlayerCapture = async () => {
    if (!captureMission || !proofFile || !currentTeam) return;
    setIsPlayerUploading(true);

    const compressedFile = await compressImage(proofFile);
    const fileName = `proof_${Math.random()}.${compressedFile.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('proofs').upload(fileName, compressedFile);

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
    await supabase.from('users').update({ team_id: teamId }).eq('id', userId);
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
      title: targetUser?.name || 'Gevangen Mafioso',
      user_id: selectedTargetUserId,
      lat: newTargetLoc.lat,
      lng: newTargetLoc.lng,
      status: 'available',
      image_url: targetUser?.avatar_url || null
    }]);

    setNewTargetLoc(null);
    setSelectedTargetUserId('');
    setIsAdminUploading(false);
    fetchAllData();
  };

  const handleApproveCapture = async (missionId: string) => {
    const mission = missions.find(m => m.id === missionId);
    if (!mission) return;

    await supabase.from('missions').update({ status: 'captured' }).eq('id', missionId);

    if (mission.user_id && mission.team_id) {
      await supabase.from('users').update({ team_id: mission.team_id }).eq('id', mission.user_id);
    }

    fetchAllData();
  };

  const handleRejectCapture = async (id: string) => {
    if (!window.confirm("Reddingsbewijs afkeuren en mafioso als gijzelaar laten staan?")) return;
    await supabase.from('missions').update({ status: 'available', proof_url: null, team_id: null }).eq('id', id);
    fetchAllData();
  };

  const handleDeleteMission = async (id: string) => {
    if (!window.confirm("Dit gijzelaarsdossier permanent wissen (*Silenzio*)?")) return;
    await supabase.from('missions').delete().eq('id', id);
    fetchAllData();
  };

  // INLOGSCHERM
  if (!isAdmin && !currentUser) {
    return (
      <div style={{ padding: '30px 20px', backgroundColor: '#0e0e0e', color: '#e0e0e0', minHeight: '100vh', fontFamily: 'Georgia, serif' }}>
        <style>{`
          ::placeholder { color: #888; }
          select option { background: #1a1a1a; color: #d4af37; }
        `}</style>
        <div style={{ maxWidth: '550px', margin: '0 auto' }}>
          <h1 style={{ color: '#d4af37', textAlign: 'center', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '5px', fontSize: '26px' }}>
            🇮🇹 La Cosa Nostra
          </h1>
          <p style={{ textAlign: 'center', color: '#888', fontStyle: 'italic', marginTop: '0', marginBottom: '25px' }}>
            Meld je bij de Famiglia, Amico...
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {users.map(u => {
              const assignedTeam = teams.find(t => t.id === u.team_id);
              const isClaimedBySomeoneElse = u.device_id && u.device_id !== myDeviceId;
              const hasAdminCreatedTarget = missions.some(m => m.user_id === u.id);

              return (
                <div key={u.id} style={{
                  border: '1px solid #333',
                  padding: '14px 16px',
                  borderRadius: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: isClaimedBySomeoneElse ? '#1e0f0f' : '#161616',
                  opacity: isClaimedBySomeoneElse ? 0.6 : 1,
                  boxShadow: '0 4px 8px rgba(0,0,0,0.6)',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <OvalAvatar src={u.avatar_url} name={u.name} border="2px solid #d4af37" />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <strong style={{ fontSize: '18px', color: '#f0f0f0', textDecoration: isClaimedBySomeoneElse ? 'line-through' : 'none' }}>
                        {u.name}
                      </strong>
                      <span style={{ fontSize: '12px', color: '#aaa', fontStyle: 'italic' }}>
                        {assignedTeam ? `Capo: ${assignedTeam.driver_name}` : hasAdminCreatedTarget ? '⛓️ Gijzelaar / Gevangen Mafioso' : 'Niet toegewezen (Straniero)'}
                      </span>
                    </div>
                  </div>

                  {isClaimedBySomeoneElse ? (
                    <span style={{ fontSize: '12px', color: '#b22222', fontWeight: 'bold' }}>🔒 Vergrendeld door Don</span>
                  ) : u.team_id && assignedTeam ? (
                    <button
                      onClick={() => handleLogin(u.id)}
                      style={{ padding: '8px 14px', background: '#b22222', color: 'white', border: '1px solid #8b0000', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', textTransform: 'uppercase' }}
                    >
                      Meld bij Capo (🚘 {assignedTeam.driver_name})
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {hasAdminCreatedTarget && (
                        <button
                          onClick={() => handleLogin(u.id)}
                          style={{ padding: '8px 10px', background: '#2c3e50', color: '#ffd700', border: '1px solid #34495e', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                        >
                          👁️ Consigliere Weergave
                        </button>
                      )}

                      <select
                        onChange={(e) => handleJoinTeam(u.id, e.target.value)}
                        defaultValue=""
                        style={{ padding: '8px', borderRadius: '4px', border: '1px solid #444', background: '#222', color: '#d4af37', fontSize: '12px' }}
                      >
                        <option value="" disabled>Kies Crew...</option>
                        {teams.map(t => <option key={t.id} value={t.id}>Capo {t.driver_name}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const mapCenter: [number, number] = currentTeam?.lat ? [currentTeam.lat, currentTeam.lng] : [51.0543, 3.7174];
  const carPassengers = currentTeam ? users.filter(u => u.team_id === currentTeam.id) : [];

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative', background: '#0e0e0e' }}>

      <style>{`
        .leaflet-popup-content-wrapper, .leaflet-popup-tip {
          background: #181818 !important;
          color: #e0e0e0 !important;
          border: 1px solid #d4af37 !important;
          box-shadow: 0 5px 15px rgba(0,0,0,0.9) !important;
        }
        .leaflet-container { background: #0e0e0e !important; }
      `}</style>

      {/* Mafia Control Header */}
      {!isAdmin && currentUser && (
        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: 'calc(100vw - 24px)' }}>
          <div style={{ background: 'rgba(15, 15, 15, 0.92)', color: 'white', padding: '10px 14px', borderRadius: '8px', border: '1px solid #d4af37', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', boxShadow: '0 4px 12px rgba(0,0,0,0.8)' }}>
            <OvalAvatar src={currentUser.avatar_url} name={currentUser.name} width={34} height={44} border="1px solid #ffd700" />

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#ffd700', letterSpacing: '0.5px' }}>{currentUser.name}</span>
              <span style={{ fontSize: '11px', color: '#aaa', fontStyle: 'italic' }}>{currentTeam ? `Capo: ${currentTeam.driver_name}` : 'Consigliere Weergave'}</span>
            </div>

            <label style={{ fontSize: '11px', background: '#262626', color: '#e0e0e0', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', border: '1px solid #444', fontWeight: 'bold' }}>
              📸 Maak Mugshot
              <input
                type="file"
                accept="image/*"
                capture="user"
                style={{ display: 'none' }}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  if (e.target.files && e.target.files[0]) {
                    handleAvatarUpload(currentUser.id, e.target.files[0]);
                  }
                }}
              />
            </label>

            {currentTeam && (() => {
              const teamEmoteAge = currentTeam.emote_updated_at ? Date.now() - new Date(currentTeam.emote_updated_at).getTime() : 999999;
              const canUploadEmote = teamEmoteAge >= 30000;

              return (
                <label style={{
                  fontSize: '11px',
                  background: canUploadEmote ? '#1e90ff' : '#555',
                  color: 'white',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  cursor: canUploadEmote && !isUploadingEmote ? 'pointer' : 'not-allowed',
                  border: '1px solid #d4af37',
                  fontWeight: 'bold',
                  opacity: canUploadEmote ? 1 : 0.6
                }}>
                  {isUploadingEmote ? '⏳ Bezig...' : canUploadEmote ? '💭 Stuur Emote' : '⏳ Cooldown (30s)'}
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    style={{ display: 'none' }}
                    disabled={!canUploadEmote || isUploadingEmote}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      if (e.target.files && e.target.files[0]) handleEmoteUpload(e.target.files[0]);
                    }}
                  />
                </label>
              );
            })()}

            {currentTeam && (
              <button
                onClick={() => setShowRoster(!showRoster)}
                style={{ fontSize: '11px', padding: '6px 10px', background: showRoster ? '#8b0000' : '#1e1e1e', color: 'white', border: '1px solid #d4af37', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                🚘 Crew Lijst ({carPassengers.length})
              </button>
            )}
          </div>

          {!isAdmin && currentTeam && showRoster && (
            <div style={{ background: '#181818', color: '#e0e0e0', padding: '14px', border: '1px solid #d4af37', borderRadius: '8px', minWidth: '250px', boxShadow: '0px 6px 15px rgba(0,0,0,0.9)' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#d4af37', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '13px' }}>Capo {currentTeam?.driver_name}'s Crew</h4>
              {carPassengers.map(u => (
                <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '10px', borderBottom: '1px solid #282828', paddingBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <OvalAvatar src={u.avatar_url} name={u.name} width={30} height={40} />
                    <span style={{ color: '#f0f0f0', fontWeight: u.id === currentUser?.id ? 'bold' : 'normal', fontSize: '13px' }}>
                      {u.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Admin Panel */}
      {isAdmin && (
        <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>

          <button
            onClick={() => {
              const btn = document.getElementById('admin-refresh-btn');
              if (btn) btn.innerText = '⏳ Radar scannen...';
              fetchAllData().then(() => {
                if (btn) btn.innerText = '📡 Forceer Radar Update';
              });
            }}
            id="admin-refresh-btn"
            style={{
              padding: '10px 14px',
              background: '#2c3e50',
              color: '#00ffff',
              cursor: 'pointer',
              border: '1px solid #00ffff',
              fontWeight: 'bold',
              borderRadius: '4px',
              letterSpacing: '1px',
              boxShadow: '0 4px 10px rgba(0,0,0,0.8)'
            }}
          >
            📡 Forceer Radar Update
          </button>

          {destination && (
            <button
              onClick={handleClearDestination}
              style={{ padding: '8px 12px', background: '#8b0000', color: 'white', border: '1px solid #ff4d4d', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
            >
              🗑️ Wis Actieve Bestemming
            </button>
          )}

          {/* Route Inspector */}
          <div style={{ background: '#141414', border: '1px solid #d4af37', padding: '10px 14px', borderRadius: '6px', color: '#fff', boxShadow: '0 4px 10px rgba(0,0,0,0.8)' }}>
            <label style={{ fontSize: '11px', color: '#ffd700', fontWeight: 'bold', display: 'block', marginBottom: '4px', letterSpacing: '1px' }}>
              📍 GPS ROUTE ANALYSEREN
            </label>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <select
                value={selectedUserForTrail}
                onChange={(e) => fetchLocationLogs(e.target.value)}
                style={{ padding: '6px', background: '#222', color: '#d4af37', border: '1px solid #444', borderRadius: '4px', fontSize: '12px' }}
              >
                <option value="">-- Selecteer Mafioso Route --</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>

              {locationLogs.length > 0 && (
                <button
                  onClick={() => { setLocationLogs([]); setSelectedUserForTrail(''); }}
                  style={{ padding: '6px 10px', background: '#8b0000', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                >
                  Wis Spoor
                </button>
              )}
            </div>
          </div>

          <button onClick={() => setShowAdminRoster(!showAdminRoster)} style={{ padding: '10px 14px', background: '#8b0000', color: '#ffd700', cursor: 'pointer', border: '1px solid #ffd700', fontWeight: 'bold', borderRadius: '4px', letterSpacing: '1px', boxShadow: '0 4px 10px rgba(0,0,0,0.8)' }}>
            👑 Don's Hoofdkwartier (Famiglia Lijst)
          </button>

          {showAdminRoster && (
            <div style={{ background: '#141414', border: '1px solid #d4af37', color: '#eee', padding: '15px', borderRadius: '8px', maxHeight: '70vh', overflowY: 'auto', boxShadow: '0px 6px 15px rgba(0,0,0,0.9)' }}>
              <h4 style={{ margin: '0 0 15px 0', color: '#ffd700', textTransform: 'uppercase', letterSpacing: '1px' }}>Alle Mafiosi</h4>
              {users.map(u => (
                <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', gap: '15px', alignItems: 'center', borderBottom: '1px solid #282828', paddingBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <OvalAvatar src={u.avatar_url} name={u.name} width={30} height={40} />
                    <span style={{ color: '#f0f0f0', fontSize: '13px' }}>{u.name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <select value={u.team_id || ''} onChange={(e) => adminAssignUser(u.id, e.target.value || null)} style={{ padding: '4px', background: '#222', color: '#d4af37', border: '1px solid #444', fontSize: '12px' }}>
                      <option value="">-- Niet toegewezen --</option>
                      {teams.map(t => <option key={t.id} value={t.id}>Capo {t.driver_name}</option>)}
                    </select>
                    {u.device_id && (
                      <button onClick={async () => { await supabase.from('users').update({ device_id: null }).eq('id', u.id); fetchAllData(); }} style={{ padding: '4px 8px', background: '#d4af37', color: 'black', border: 'none', borderRadius: '3px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px' }}>
                        🔓 Ontgrendelen
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Admin Action Menu for Map Clicks */}
      {newTargetLoc && (
        <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', background: '#161616', color: '#e0e0e0', border: '2px solid #8b0000', padding: '20px', borderRadius: '8px', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '300px', boxShadow: '0 10px 25px rgba(0,0,0,0.9)' }}>
          <h3 style={{ margin: 0, color: '#d4af37', letterSpacing: '1px', textTransform: 'uppercase', fontSize: '16px', textAlign: 'center' }}>Locatie Actie Selecteren</h3>

          <div style={{ borderBottom: '1px solid #333', paddingBottom: '10px' }}>
            <label style={{ fontSize: '12px', color: '#ffd700', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>1. Checkpoint Instellen</label>
            <button
              onClick={handleSetDestination}
              disabled={isAdminUploading}
              style={{ width: '100%', padding: '10px', background: '#008b8b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              🏁 Stel In Als Checkpoint
            </button>
          </div>

          <div>
            <label style={{ fontSize: '12px', color: '#ffd700', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>2. Gijzelaar Plaatsen</label>
            <select value={selectedTargetUserId} onChange={(e) => setSelectedTargetUserId(e.target.value)} style={{ width: '100%', padding: '8px', background: '#222', color: '#e0e0e0', border: '1px solid #444', borderRadius: '4px', marginBottom: '8px' }}>
              <option value="">Selecteer Gijzelaar...</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name} {u.team_id ? '(Toegewezen)' : '(Niet toegewezen)'}</option>
              ))}
            </select>

            {selectedTargetUserId && (() => {
              const selectedUser = users.find(u => u.id === selectedTargetUserId);
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', background: '#222', borderRadius: '6px', border: '1px solid #333', marginBottom: '8px' }}>
                  <OvalAvatar src={selectedUser?.avatar_url} name={selectedUser?.name} />
                  <span style={{ fontSize: '12px', color: '#aaa' }}>{selectedUser?.avatar_url ? 'Mugshot aanwezig' : 'Geen mugshot in dossier'}</span>
                </div>
              );
            })()}

            <button onClick={handleCreateTarget} disabled={!selectedTargetUserId || isAdminUploading} style={{ width: '100%', padding: '10px', background: '#8b0000', color: 'white', border: 'none', borderRadius: '4px', cursor: selectedTargetUserId ? 'pointer' : 'not-allowed', fontWeight: 'bold', textTransform: 'uppercase', opacity: selectedTargetUserId ? 1 : 0.5 }}>
              {isAdminUploading ? 'Bezig...' : '⛓️ Start Reddingsmissie'}
            </button>
          </div>

          <button onClick={() => setNewTargetLoc(null)} style={{ padding: '8px', background: '#333', color: '#aaa', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '4px' }}>Annuleren</button>
        </div>
      )}

      {/* Speler Reddings-overlay */}
      {captureMission && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.92)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <h2 style={{ color: '#d4af37', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '5px' }}>
            Herover Mafioso: {captureMission.title}
          </h2>
          <p style={{ color: '#aaa', fontStyle: 'italic', marginBottom: '20px' }}>Lever fotobewijs van de redding voor de Don...</p>
          <input type="file" accept="image/*" capture="user" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProofFile(e.target.files ? e.target.files[0] : null)} style={{ margin: '15px 0', color: 'white' }} />
          <div style={{ display: 'flex', gap: '15px' }}>
            <button onClick={handlePlayerCapture} disabled={isPlayerUploading || !proofFile} style={{ padding: '12px 24px', background: '#28a745', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', textTransform: 'uppercase', cursor: 'pointer' }}>
              {isPlayerUploading ? 'Bewijs Versturen...' : 'Bevestig Reddingsbewijs'}
            </button>
            <button onClick={() => { setCaptureMission(null); setProofFile(null); }} style={{ padding: '12px 24px', background: '#8b0000', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Annuleren</button>
          </div>
        </div>
      )}

      {/* Map Container */}
      <MapContainer center={mapCenter} zoom={14} style={{ height: '100%', width: '100%', zIndex: 1 }}>
        <TileLayer
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
          attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ"
          maxZoom={16}
        />
        <AdminMapEvents />

        {destination && (
          <Marker
            position={[destination.lat, destination.lng]}
            icon={createDestinationIcon()}
            zIndexOffset={500}
          >
            <Popup>
              <div style={{ textAlign: 'center', minWidth: '150px' }}>
                <strong style={{ color: '#00ffff', fontSize: '15px' }}>🏁 CHECKPOINT</strong>
                <p style={{ fontSize: '11px', color: '#aaa', margin: '4px 0 8px' }}>Rijd naar deze locatie!</p>
                {isAdmin && (
                  <button
                    onClick={handleClearDestination}
                    style={{ width: '100%', padding: '6px', background: '#8b0000', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                  >
                    Wis Bestemming
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        )}

        {/* Admin Selected User Trail (Connecting Polyline & Waypoint Dots) */}
        {isAdmin && locationLogs.length > 0 && (() => {
          const validLogs = locationLogs.filter(log => {
            const lat = parseFloat(log.lat);
            const lng = parseFloat(log.lng);
            return !isNaN(lat) && !isNaN(lng);
          });

          return (
            <>
              {validLogs.map((log, index) => {
                if (index === validLogs.length - 1) return null;
                const nextLog = validLogs[index + 1];

                const p1: [number, number] = [parseFloat(log.lat), parseFloat(log.lng)];
                const p2: [number, number] = [parseFloat(nextLog.lat), parseFloat(nextLog.lng)];
                const segmentColor = getSegmentColor(nextLog.created_at);

                return (
                  <Polyline
                    key={`segment-${log.id || index}`}
                    positions={[p1, p2]}
                    pathOptions={{ color: segmentColor, weight: 5, opacity: 0.9 }}
                  />
                );
              })}

              {validLogs.map((log, index) => {
                const lat = parseFloat(log.lat);
                const lng = parseFloat(log.lng);
                const dotColor = getSegmentColor(log.created_at);
                const ageMinutes = Math.round((Date.now() - new Date(log.created_at).getTime()) / 60000);

                return (
                  <CircleMarker
                    key={log.id || index}
                    center={[lat, lng]}
                    radius={5}
                    pathOptions={{ fillColor: dotColor, color: '#111', weight: 1.5, fillOpacity: 1 }}
                  >
                    <Popup>
                      <div style={{ fontSize: '11px', textAlign: 'center' }}>
                        <strong>Punt #{index + 1}</strong><br />
                        {log.created_at ? new Date(log.created_at).toLocaleTimeString() : ''}<br />
                        <span style={{ color: '#aaa' }}>({ageMinutes}m geleden)</span>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </>
          );
        })()}

        {/* Auto's op de kaart */}
        {teams.filter(t => t.lat && t.lng).map(team => {
          const isMyTeam = currentTeam?.id === team.id;
          const passengers = users.filter(u => u.team_id === team.id);

          return (
            <Marker
              key={team.id}
              position={[team.lat, team.lng]}
              icon={createCarIcon(team.color, team.emote_url, team.emote_updated_at)}
              zIndexOffset={isMyTeam ? 1000 : 0}
            >
              <Popup>
                <div style={{ textAlign: 'center', minWidth: '170px' }}>
                  <strong style={{ fontSize: '15px', color: '#ffd700' }}>Capo {team.driver_name}'s Macchina</strong>
                  {isMyTeam && <span style={{ color: '#28a745', fontWeight: 'bold', display: 'block', fontSize: '11px', marginTop: '2px' }}>(Jouw Crew)</span>}

                  <div style={{ marginTop: '10px', fontSize: '11px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mafiosi Aan Boord ({passengers.length})</div>

                  <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '10px', marginTop: '8px' }}>
                    {passengers.length > 0 ? (
                      passengers.map(p => (
                        <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '50px' }}>
                          <OvalAvatar src={p.avatar_url} name={p.name} width={38} height={50} border={`2px solid ${team.color || '#d4af37'}`} />
                          <span style={{ fontSize: '11px', marginTop: '3px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '100%', color: '#ddd' }}>{p.name}</span>
                        </div>
                      ))
                    ) : (
                      <span style={{ fontStyle: 'italic', fontSize: '12px', color: '#666' }}>Geen mafiosi in de wagen</span>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Gijzelaars-markers op de kaart */}
        {missions.map((mission) => {
          const reactKey = `${mission.id}-${mission.status}`;
          const targetUser = users.find(u => u.id === mission.user_id);
          const portraitUrl = targetUser?.avatar_url || mission.image_url;

          if (mission.status === 'available') {
            return (
              <Marker
                key={reactKey}
                position={[mission.lat, mission.lng]}
                icon={createPortraitIcon(portraitUrl, '#8b0000')}
              >
                <Popup>
                  <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <OvalAvatar src={portraitUrl} name={mission.title} width={60} height={80} border="3px solid #8b0000" />
                    <strong style={{ fontSize: '16px', marginTop: '6px', color: '#ff4d4d' }}>{mission.title}</strong>
                    <span style={{ fontSize: '11px', color: '#aaa', fontStyle: 'italic' }}>Gijzelaar / Gevangen Mafioso</span>

                    {isAdmin ? (
                      <>
                        <button onClick={() => handleApproveCapture(mission.id)} style={{ width: '100%', marginTop: '10px', background: '#d4af37', color: 'black', fontWeight: 'bold', border: 'none', padding: '8px', cursor: 'pointer', borderRadius: '4px' }}>Admin: Directe Redding</button>
                        <button onClick={() => handleDeleteMission(mission.id)} style={{ width: '100%', marginTop: '5px', background: '#8b0000', color: 'white', border: 'none', padding: '8px', cursor: 'pointer', borderRadius: '4px' }}>Admin: Wis Dossier</button>
                      </>
                    ) : currentTeam ? (
                      <button onClick={() => setCaptureMission(mission)} style={{ width: '100%', marginTop: '10px', background: '#8b0000', color: 'white', border: '1px solid #ff4d4d', padding: '8px', cursor: 'pointer', fontWeight: 'bold', borderRadius: '4px', textTransform: 'uppercase' }}>Herover Mafioso</button>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#888', fontStyle: 'italic', display: 'block', marginTop: '5px' }}>Sluit je aan bij een crew om mafioso te redden</span>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          } else if (mission.status === 'pending') {
            return (
              <Marker
                key={reactKey}
                position={[mission.lat, mission.lng]}
                icon={createPortraitIcon(portraitUrl, '#ffd700')}
              >
                <Popup>
                  <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <strong style={{ color: '#ffd700' }}>Redding Verifiëren: {mission.title}</strong>
                    <div style={{ margin: '8px 0' }}>
                      <OvalAvatar src={portraitUrl} name={mission.title} width={50} height={66} border="2px solid #ffd700" />
                    </div>
                    {mission.proof_url && <img src={mission.proof_url} alt="Bewijs" style={{ width: '200px', borderRadius: '8px', display: 'block', border: '1px solid #ffd700' }} />}
                    {isAdmin ? (
                      <div style={{ display: 'flex', gap: '5px', marginTop: '10px', width: '100%' }}>
                        <button onClick={() => handleApproveCapture(mission.id)} style={{ flex: 1, background: '#28a745', color: 'white', border: 'none', padding: '8px', cursor: 'pointer', borderRadius: '4px', fontWeight: 'bold' }}>Goedkeuren</button>
                        <button onClick={() => handleRejectCapture(mission.id)} style={{ flex: 1, background: '#8b0000', color: 'white', border: 'none', padding: '8px', cursor: 'pointer', borderRadius: '4px' }}>Afkeuren</button>
                      </div>
                    ) : (
                      <p style={{ marginTop: '10px', fontStyle: 'italic', color: '#aaa', fontSize: '12px' }}>Wachten op Don's bevestiging van de redding...</p>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          } else {
            const capturingTeam = teams.find(t => t.id === mission.team_id);
            const teamColor = capturingTeam?.color || '#28a745';

            return (
              <Marker
                key={reactKey}
                position={[mission.lat, mission.lng]}
                icon={createCapturedCheckIcon(portraitUrl, teamColor)}
              >
                <Popup>
                  <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <strong style={{ color: '#28a745' }}>Mafioso Gered: {mission.title}</strong>
                    <span style={{ fontSize: '11px', color: '#aaa', marginBottom: '8px' }}>Heroverd door Capo {capturingTeam ? `${capturingTeam.driver_name}'s Crew` : 'Famiglia'}</span>

                    <div style={{ margin: '4px 0 8px 0' }}>
                      <OvalAvatar src={portraitUrl} name={mission.title} width={45} height={60} border={`2px solid ${teamColor}`} />
                    </div>

                    {mission.proof_url ? (
                      <div style={{ marginTop: '6px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '4px', color: '#ffd700' }}>Fotobewijs van Redding:</div>
                        <img src={mission.proof_url} alt="Bewijs" style={{ width: '200px', borderRadius: '8px', display: 'block', border: '1px solid #444' }} />
                      </div>
                    ) : (
                      <p style={{ marginTop: '10px', fontStyle: 'italic', fontSize: '12px', color: '#666' }}>Geen fotobewijs geleverd.</p>
                    )}

                    {isAdmin && (
                      <button onClick={() => handleDeleteMission(mission.id)} style={{ width: '100%', marginTop: '10px', background: '#8b0000', color: 'white', border: 'none', padding: '8px', cursor: 'pointer', borderRadius: '4px' }}>Wis Dossier</button>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          }
        })}
      </MapContainer>
    </div>
  );
}
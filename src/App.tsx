import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMapEvents, Circle, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { supabase } from './supabase';

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

import imageCompression from 'browser-image-compression';

const _getMissionDigits = (missionId: string) => {
  let hash = 0;
  for (let i = 0; i < missionId.length; i++) {
    hash = (hash << 5) - hash + missionId.charCodeAt(i);
    hash |= 0;
  }
  const absVal = Math.abs(hash);
  const d1 = (absVal % 9) + 1;
  const d2 = (Math.floor(absVal / 10) % 9) + 1;
  return `${d1}${d2}`;
};
const calculateDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};
const compressImage = async (imageFile: File, customOptions?: { maxSizeMB: number; maxWidthOrHeight: number }) => {
  const options = {
    maxSizeMB: customOptions?.maxSizeMB ?? 0.03,
    maxWidthOrHeight: customOptions?.maxWidthOrHeight ?? 600,
    useWebWorker: true,
  };

  try {
    const compressedFile = await imageCompression(imageFile, options);
    return compressedFile;
  } catch (error) {
    console.error("Fout bij comprimeren:", error);
    return imageFile;
  }
};

interface OvalAvatarProps {
  src?: string | null;
  name?: string;
  width?: number;
  height?: number;
  border?: string;
}

const MISSION_REVEAL_THRESHOLD_METERS = 100;
const MISSION_MAX_RADIUS_METERS = 5000;
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

const createCarIcon = (color?: string, emoteUrl?: string, emoteUpdatedAt?: string) => {
  let emoteHtml = '';

  if (emoteUrl && emoteUpdatedAt) {
    const ageMs = Date.now() - new Date(emoteUpdatedAt).getTime();
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
const createDestinationIcon = (imageUrl?: string | null) => L.divIcon({
  html: `
    <div style="
      width: 50px;
      height: 50px;
      border-radius: 50%;
      border: 3px solid #28a745;
      background: #111;
      overflow: hidden;
      box-shadow: 0px 4px 12px rgba(0,0,0,0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
    ">
      <img
        src="${imageUrl || '/destination.png'}"
        alt="Bestemming"
        style="width: 100%; height: 100%; object-fit: cover; display: block;"
      />
    </div>
  `,
  className: '',
  iconSize: [50, 50],
  iconAnchor: [25, 25],
});
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

function DestinationEdgePointer({ destination, draftDestination, isAdmin, hasUnlockedDestination }: { destination: any, draftDestination: any, isAdmin: boolean, hasUnlockedDestination: boolean }) {
  const map = useMap();
  const containerRef = useRef<HTMLDivElement>(null);
  const [arrowData, setArrowData] = useState<{ x: number, y: number, angle: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    L.DomEvent.disableClickPropagation(containerRef.current);
    L.DomEvent.disableScrollPropagation(containerRef.current);
  }, []);

  // Determine target coordinates based on admin mode or unlocked destination status
  let targetLat: number | null = null;
  let targetLng: number | null = null;
  let radiusMeters = 500;

  if (isAdmin) {
    if (draftDestination) {
      targetLat = draftDestination.real_lat;
      targetLng = draftDestination.real_lng;
      radiusMeters = draftDestination.radius_meters || 500;
    } else if (destination) {
      targetLat = destination.real_lat ?? destination.lat;
      targetLng = destination.real_lng ?? destination.lng;
      radiusMeters = destination.radius_meters || 500;
    }
  } else if (hasUnlockedDestination && destination) {
    targetLat = destination.real_lat ?? destination.lat;
    targetLng = destination.real_lng ?? destination.lng;
    radiusMeters = destination.radius_meters || 500;
  }

  useEffect(() => {
    if (targetLat === null || targetLng === null || isNaN(targetLat) || isNaN(targetLng)) {
      setArrowData(null);
      return;
    }

    const updateArrow = () => {
      const targetPoint = map.latLngToContainerPoint([targetLat!, targetLng!]);
      const size = map.getSize();
      const width = size.x;
      const height = size.y;

      const padding = 50;
      const isInside =
          targetPoint.x >= padding &&
          targetPoint.x <= width - padding &&
          targetPoint.y >= padding &&
          targetPoint.y <= height - padding;

      if (isInside) {
        setArrowData(null);
        return;
      }

      const centerX = width / 2;
      const centerY = height / 2;
      const dx = targetPoint.x - centerX;
      const dy = targetPoint.y - centerY;
      const angle = Math.atan2(dy, dx);

      const boundX = width / 2 - padding;
      const boundY = height / 2 - padding;

      let x = centerX;
      let y = centerY;
      const slope = dx !== 0 ? dy / dx : 0;

      if (Math.abs(dx) * boundY > Math.abs(dy) * boundX) {
        x = dx > 0 ? width - padding : padding;
        y = centerY + (x - centerX) * slope;
      } else {
        y = dy > 0 ? height - padding : padding;
        x = centerX + (slope !== 0 ? (y - centerY) / slope : 0);
      }

      const angleDeg = (angle * 180) / Math.PI;
      setArrowData({ x, y, angle: angleDeg });
    };

    updateArrow();

    map.on('move', updateArrow);
    map.on('zoom', updateArrow);
    map.on('resize', updateArrow);

    return () => {
      map.off('move', updateArrow);
      map.off('zoom', updateArrow);
      map.off('resize', updateArrow);
    };
  }, [targetLat, targetLng, map]);

  // Conditional early returns safely placed AFTER all hooks
  if (!isAdmin && !hasUnlockedDestination) return null;
  if (!arrowData || targetLat === null || targetLng === null) return null;

  const handleZoomToZone = () => {
    const bounds = L.latLng(targetLat!, targetLng!).toBounds(radiusMeters);
    map.fitBounds(bounds, { animate: true, padding: [50, 50] });
  };

  return (
      <div
          ref={containerRef}
          onClick={handleZoomToZone}
          style={{
            position: 'absolute',
            left: `${arrowData.x}px`,
            top: `${arrowData.y}px`,
            transform: 'translate(-50%, -50%)',
            zIndex: 1500,
            cursor: 'pointer',
            background: '#161616',
            border: '2px solid #28a745',
            borderRadius: '50%',
            width: '42px',
            height: '42px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 15px rgba(0,0,0,0.9)'
          }}
          title="Klik om naar de zone te zoomen"
      >
        <div style={{
          transform: `rotate(${arrowData.angle}deg)`,
          fontSize: '18px',
          color: '#28a745',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none'
        }}>
          ➡️
        </div>
      </div>
  );
}


function SmoothTeamMarker({ team, currentTeamId, users }: { team: any, currentTeamId?: string, users: any[] }) {
  const markerRef = useRef<L.Marker | null>(null);
  const [initialPos] = useState<[number, number]>([team.lat, team.lng]);

  const posRef = useRef<[number, number]>([team.lat, team.lng]);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const startLat = posRef.current[0];
    const startLng = posRef.current[1];
    const targetLat = team.lat;
    const targetLng = team.lng;

    if (startLat === targetLat && startLng === targetLng) return;

    let startTime: number | null = null;
    const duration = 1000;

    const animate = (time: number) => {
      if (startTime === null) startTime = time;
      const elapsed = time - startTime;
      const progress = Math.min(1, elapsed / duration);
      const ease = 1 - Math.pow(1 - progress, 3);

      const currentLat = startLat + (targetLat - startLat) * ease;
      const currentLng = startLng + (targetLng - startLng) * ease;

      posRef.current = [currentLat, currentLng];

      if (markerRef.current) {
        markerRef.current.setLatLng([currentLat, currentLng]);
      }

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      }
    };

    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [team.lat, team.lng]);

  const isMyTeam = currentTeamId === team.id;
  const passengers = users.filter(u => u.team_id === team.id);

  return (
      <Marker
          ref={markerRef}
          position={initialPos}
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
}

function SmoothCircle({ center, radius, pathOptions, children }: { center: [number, number], radius: number, pathOptions?: any, children?: React.ReactNode }) {
  const circleRef = useRef<L.Circle | null>(null);

  const [initialCenter] = useState<[number, number]>(center);
  const [initialRadius] = useState<number>(radius);

  const posRef = useRef<[number, number]>(center);
  const radiusRef = useRef<number>(radius);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const startLat = posRef.current[0];
    const startLng = posRef.current[1];
    const startRadius = radiusRef.current;

    const targetLat = center[0];
    const targetLng = center[1];
    const targetRadius = radius;

    if (startLat === targetLat && startLng === targetLng && startRadius === targetRadius) return;

    const duration = isAdmin ? 50 : 5000;
    let startTime: number | null = null;

    const animate = (time: number) => {
      if (startTime === null) startTime = time;

      const elapsed = time - startTime;
      const progress = Math.min(1, elapsed / duration);
      const ease = 1 - Math.pow(1 - progress, 2);

      const currentLat = startLat + (targetLat - startLat) * ease;
      const currentLng = startLng + (targetLng - startLng) * ease;
      const currentR = startRadius + (targetRadius - startRadius) * ease;

      posRef.current = [currentLat, currentLng];
      radiusRef.current = currentR;

      if (circleRef.current) {
        circleRef.current.setLatLng([currentLat, currentLng]);
        circleRef.current.setRadius(currentR);
      }

      if (progress < 1) {
        animRef.current = requestAnimationFrame(animate);
      }
    };

    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [center[0], center[1], radius]);

  return (
      <Circle
          ref={circleRef}
          center={initialCenter}
          radius={initialRadius}
          pathOptions={pathOptions}
      >
        {children}
      </Circle>
  );
}

export default function App() {
  const [missions, setMissions] = useState<any[]>([]);
  const [editingMissionImageFile, setEditingMissionImageFile] = useState<File | null>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [destination, setDestination] = useState<any>(null);
  const [draftDestination, setDraftDestination] = useState<{real_lat: number, real_lng: number, display_lat: number, display_lng: number, radius_meters: number, image_url?: string | null} | null>(null);

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentTeam, setCurrentTeam] = useState<any>(null);

  const [showRoster, setShowRoster] = useState(false);
  const [captureMission, setCaptureMission] = useState<any>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [isPlayerUploading, setIsPlayerUploading] = useState(false);

  const [editingMission, setEditingMission] = useState<any | null>(null);
  const [adminActionMode, setAdminActionMode] = useState<'mission' | 'destination'>('mission');

  const [showAdminRoster, setShowAdminRoster] = useState(false);
  const [newTargetLoc, setNewTargetLoc] = useState<{lat: number, lng: number} | null>(null);
  const [draftMission, setDraftMission] = useState<{ real_lat: number; real_lng: number; display_lat: number; display_lng: number } | null>(null);
  const [targetImageFile, setTargetImageFile] = useState<File | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [isAdminUploading, setIsAdminUploading] = useState(false);

  const [locationLogs, setLocationLogs] = useState<any[]>([]);
  const [selectedUserForTrail, setSelectedUserForTrail] = useState<string>('');
  const [isUploadingEmote, setIsUploadingEmote] = useState(false);

  const selectedUserForTrailRef = useRef<string>('');
  selectedUserForTrailRef.current = selectedUserForTrail;

  const userLatestLog = locationLogs.length > 0 ? locationLogs[locationLogs.length - 1] : null;
  const playerLat = userLatestLog ? parseFloat(userLatestLog.lat) : (currentTeam?.lat || null);
  const playerLng = userLatestLog ? parseFloat(userLatestLog.lng) : (currentTeam?.lng || null);

  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockedModalDigits, setUnlockedModalDigits] = useState('');
  const [showCodeGuessModal, setShowCodeGuessModal] = useState(false);

  const sourceDigits = ['1', '3', '9', '9'];
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [guessError, setGuessError] = useState(false);

  const teamCapturedMissions = currentTeam
      ? missions.filter(m => m.team_id === currentTeam.id && m.status === 'captured')
      : [];

  const getTeamDigitsArray = (capturedMissions: any[]) => {
    const digits: string[] = [];
    if (capturedMissions.length > 0) digits.push('13');
    if (capturedMissions.length > 1) digits.push('99');
    return digits;
  };

  const teamDigitsArr = getTeamDigitsArray(teamCapturedMissions);
  const activeTeamDigits = teamDigitsArr.join('   ');

  const hasUnlockedDestination = currentTeam?.code_solved === true;

  const currentMilestone = teamCapturedMissions.length >= 2 ? 2 : teamCapturedMissions.length >= 1 ? 1 : 0;

  useEffect(() => {
    if (!currentTeam || currentMilestone === 0) return;

    const storageKey = `ack_milestone_v2_${currentTeam.id}`;
    const lastAckMilestone = parseInt(localStorage.getItem(storageKey) || '0', 10);

    if (currentMilestone > lastAckMilestone) {
      setUnlockedModalDigits(activeTeamDigits);
      setShowUnlockModal(true);
    }
  }, [currentMilestone, currentTeam?.id, activeTeamDigits]);

  const handleDismissUnlockModal = () => {
    if (!currentTeam) return;
    const storageKey = `ack_milestone_v2_${currentTeam.id}`;
    localStorage.setItem(storageKey, currentMilestone.toString());
    setShowUnlockModal(false);
  };

  const fetchAllData = async () => {
    const [mRes, tRes, uRes, dRes] = await Promise.all([
      supabase.from('missions').select('*'),
      supabase.from('teams').select('*'),
      supabase.from('users').select('*'),
      supabase.from('destinations').select('*').eq('id', 'active').maybeSingle()
    ]);

    if (mRes.data) {
      setMissions((prev: any) => {
        if (JSON.stringify(prev) !== JSON.stringify(mRes.data)) return mRes.data;
        return prev;
      });
    }
    if (tRes.data) {
      setTeams((prev: any) => {
        if (JSON.stringify(prev) !== JSON.stringify(tRes.data)) return tRes.data;
        return prev;
      });
    }
    if (uRes.data) {
      setUsers((prev: any) => {
        if (JSON.stringify(prev) !== JSON.stringify(uRes.data)) return uRes.data;
        return prev;
      });
    }

    const newDest = dRes.data || null;
    setDestination((prev: any) => {
      if (JSON.stringify(prev) !== JSON.stringify(newDest)) return newDest;
      return prev;
    });

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

        setCurrentUser((prev: any) => (prev?.id === user.id && prev?.team_id === user.team_id ? prev : user));
        if (user.team_id) {
          const team = tRes.data?.find(t => t.id === user.team_id);
          setCurrentTeam((prev: any) => (prev?.id === team?.id ? prev : (team || null)));
        } else {
          setCurrentTeam(null);
        }
      }
    }
  };

  const handleSelectDigit = (index: number) => {
    if (selectedIndices.includes(index)) return;
    if (selectedIndices.length < 4) {
      setSelectedIndices([...selectedIndices, index]);
    }
  };

  const handleRemoveDigit = (slotIndex: number) => {
    const newIndices = [...selectedIndices];
    newIndices.splice(slotIndex, 1);
    setSelectedIndices(newIndices);
  };

  const handleVerifyCode = async () => {
    const enteredCode = selectedIndices.map(i => sourceDigits[i]).join('');
    if (enteredCode === '1993') {
      await supabase.from('teams').update({ code_solved: true }).eq('id', currentTeam.id);
      setCurrentTeam((prev: any) => ({ ...prev, code_solved: true }));
      setShowCodeGuessModal(false);
      setSelectedIndices([]);
      fetchAllData();
    } else {
      setGuessError(true);
      setSelectedIndices();
      setTimeout(() => setGuessError(false), 400);
    }
  };

  const getShrinkingCircleParams = (
      realLat: number,
      realLng: number,
      fakeLat: number,
      fakeLng: number,
      maxRadius: number,
      playerLat: number | null,
      playerLng: number | null
  ) => {
    const distanceToReal = (playerLat !== null && playerLng !== null)
        ? calculateDistanceMeters(playerLat, playerLng, realLat, realLng)
        : 9999;

    const clampedDist = Math.max(MISSION_REVEAL_THRESHOLD_METERS, Math.min(maxRadius, distanceToReal));
    const t = Math.max(0, Math.min(1, (maxRadius - clampedDist) / (maxRadius - MISSION_REVEAL_THRESHOLD_METERS)));

    const lerpedLat = fakeLat + (realLat - fakeLat) * t;
    const lerpedLng = fakeLng + (realLng - fakeLng) * t;

    const centerToRealDist = calculateDistanceMeters(lerpedLat, lerpedLng, realLat, realLng);
    const circleRadius = Math.max(clampedDist, centerToRealDist);

    return {
      center: [lerpedLat, lerpedLng] as [number, number],
      radius: circleRadius,
      distanceToReal
    };
  };

  const fetchDynamicData = async () => {
    const { data } = await supabase
        .from('teams')
        .select('id, lat, lng, emote_url, emote_updated_at, is_tracking_active');

    if (data) {
      setTeams((prevTeams) =>
          prevTeams.map((t) => {
            const updatedData = data.find((d) => d.id === t.id);
            return updatedData ? { ...t, ...updatedData } : t;
          })
      );

      setCurrentTeam((prevTeam: any) => {
        if (!prevTeam) return prevTeam;
        const updatedData = data.find((d) => d.id === prevTeam.id);
        return updatedData ? { ...prevTeam, ...updatedData } : prevTeam;
      });
    }
  };

  useEffect(() => {
    fetchAllData();

    const staticInterval = setInterval(() => {
      fetchAllData();
    }, 60000);

    const dynamicInterval = setInterval(() => {
      fetchDynamicData();
    }, 5000);

    return () => {
      clearInterval(staticInterval);
      clearInterval(dynamicInterval);
    };
  }, []);

  const currentUserRef = useRef<any>(currentUser);
  currentUserRef.current = currentUser;

  const currentTeamRef = useRef<any>(currentTeam);
  currentTeamRef.current = currentTeam;

  const lastInsertTimeRef = useRef<number>(0);

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
          if (activeTeam?.is_tracking_active) {
            await supabase.from('location_history').insert([{
              user_id: activeUser.id,
              team_id: activeTeam.id,
              lat: latitude,
              lng: longitude
            }]);
          }
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

  const _handleSetDestination = () => {
    if (!newTargetLoc) return;
    setDraftDestination({
      real_lat: newTargetLoc.lat,
      real_lng: newTargetLoc.lng,
      display_lat: newTargetLoc.lat + 0.002,
      display_lng: newTargetLoc.lng + 0.002,
      radius_meters: 500
    });
    setNewTargetLoc(null);
  };

  const calculateEdgePosition = (lat: number, lng: number, radiusMeters: number): [number, number] => {
    const dLng = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));
    return [lat, lng + dLng];
  };

  const [destinationImageFile, setDestinationImageFile] = useState<File | null>(null);
  const handlePublishMission = async () => {
    if (!draftMission || !targetImageFile) return;
    setIsAdminUploading(true);

    const compressedFile = await compressImage(targetImageFile, { maxSizeMB: 0.2, maxWidthOrHeight: 1200 });
    const fileName = `target_${Math.random()}.${compressedFile.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('proofs').upload(fileName, compressedFile);

    let publicUrl = null;
    if (!error) {
      publicUrl = supabase.storage.from('proofs').getPublicUrl(fileName).data.publicUrl;
    }

    await supabase.from('missions').insert([{
      title: 'Geheime Locatie',
      lat: draftMission.real_lat,
      lng: draftMission.real_lng,
      display_lat: draftMission.display_lat,
      display_lng: draftMission.display_lng,
      status: 'available',
      image_url: publicUrl,
      user_id: null
    }]);

    setDraftMission(null);
    setTargetImageFile(null);
    setIsAdminUploading(false);
    fetchAllData();
  };

  const handlePublishDestination = async () => {
    if (!draftDestination) return;
    setIsAdminUploading(true);

    let publicUrl = draftDestination.image_url || null;
    if (destinationImageFile) {
      const compressedFile = await compressImage(destinationImageFile, { maxSizeMB: 0.2, maxWidthOrHeight: 1200 });
      const fileName = `dest_${Math.random()}.${compressedFile.name.split('.').pop()}`;
      const { error } = await supabase.storage.from('proofs').upload(fileName, compressedFile);
      if (!error) {
        publicUrl = supabase.storage.from('proofs').getPublicUrl(fileName).data.publicUrl;
      }
    }

    await supabase.from('destinations').upsert({
      id: 'active',
      title: 'Checkpoint',
      real_lat: draftDestination.real_lat,
      real_lng: draftDestination.real_lng,
      display_lat: draftDestination.display_lat,
      display_lng: draftDestination.display_lng,
      radius_meters: draftDestination.radius_meters,
      image_url: publicUrl,
      is_revealed: false,
      created_at: new Date().toISOString()
    });

    setDraftDestination(null);
    setDestinationImageFile(null);
    setIsAdminUploading(false);
    fetchAllData();
  };

  const handleEditDestination = () => {
    if (!destination) return;
    setDraftDestination({
      real_lat: destination.real_lat,
      real_lng: destination.real_lng,
      display_lat: destination.display_lat,
      display_lng: destination.display_lng,
      radius_meters: destination.radius_meters,
      image_url: destination.image_url
    });
  };

  const handleClearDestination = async () => {
    if (!window.confirm("Huidige bestemming verwijderen?")) return;
    await supabase.from('destinations').delete().eq('id', 'active');
    fetchAllData();
  };

  const fetchLocationLogs = async (teamId: string) => {
    setSelectedUserForTrail(teamId);
    if (!teamId) {
      setLocationLogs([]);
      return;
    }

    const { data } = await supabase
        .from('location_history')
        .select('*')
        .eq('team_id', teamId)
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

    await supabase.from('missions').insert([{
      title: captureMission.title,
      lat: captureMission.lat,
      lng: captureMission.lng,
      status: 'pending',
      image_url: captureMission.image_url,
      user_id: null,
      team_id: currentTeam.id,
      proof_url: proofUrl
    }]);

    setCaptureMission(null);
    setProofFile(null);
    setIsPlayerUploading(false);
    fetchAllData();
  };

  const handleDeleteMission = async (_baseMissionId: string, lat: number, lng: number) => {
    if (!window.confirm("Deze locatiemissie permanent wissen (*Silenzio*)?")) return;
    await supabase.from('missions').delete().eq('lat', lat).eq('lng', lng);
    fetchAllData();
  };

  const handleApproveCapture = async (completionId: string) => {
    await supabase.from('missions').update({ status: 'captured' }).eq('id', completionId);
    fetchAllData();
  };

  const handleRejectCapture = async (completionId: string) => {
    if (!window.confirm("Bewijs afkeuren en team opnieuw laten proberen?")) return;
    await supabase.from('missions').delete().eq('id', completionId);
    fetchAllData();
  };

  const adminAssignUser = async (userId: string, teamId: string | null) => {
    await supabase.from('users').update({ team_id: teamId }).eq('id', userId);
    fetchAllData();
  };

  const handleToggleTracking = async (teamId: string, currentState: boolean) => {
    await supabase
        .from('teams')
        .update({ is_tracking_active: !currentState })
        .eq('id', teamId);
    fetchAllData();
  };

  function AdminMapEvents() {
    useMapEvents({
      click(e) {
        if (!isAdmin) return;

        if (adminActionMode === 'mission') {
          setDraftMission({
            real_lat: e.latlng.lat,
            real_lng: e.latlng.lng,
            display_lat: e.latlng.lat + 0.002,
            display_lng: e.latlng.lng + 0.002,
          });
        } else {
          setDraftDestination({
            real_lat: e.latlng.lat,
            real_lng: e.latlng.lng,
            display_lat: e.latlng.lat + 0.002,
            display_lng: e.latlng.lng + 0.002,
            radius_meters: 500
          });
        }
      }
    });
    return null;
  }

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

              {currentTeam && teamCapturedMissions.length > 0 && (
                  <div
                      onClick={() => {
                        if (teamCapturedMissions.length >= 2 && !currentTeam.code_solved) {
                          setShowCodeGuessModal(true);
                        }
                      }}
                      style={{
                        background: currentTeam.code_solved
                            ? 'linear-gradient(135deg, #002211 0%, #0a0a0a 100%)'
                            : 'linear-gradient(135deg, #1a0000 0%, #0a0a0a 100%)',
                        border: `2px solid ${currentTeam.code_solved ? '#28a745' : '#8b0000'}`,
                        borderRadius: '8px',
                        padding: '8px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        boxShadow: currentTeam.code_solved ? '0 4px 15px rgba(40,167,69,0.4)' : '0 4px 15px rgba(139,0,0,0.4)',
                        cursor: teamCapturedMissions.length >= 2 && !currentTeam.code_solved ? 'pointer' : 'default',
                        animation: teamCapturedMissions.length >= 2 && !currentTeam.code_solved ? 'pulseGlow 2s infinite ease-in-out' : 'none'
                      }}
                  >
                    <style>{`
                    @keyframes pulseGlow {
                      0% { transform: scale(1); box-shadow: 0 0 5px rgba(139,0,0,0.5); }
                      50% { transform: scale(1.02); box-shadow: 0 0 15px rgba(255,0,0,0.8); }
                      100% { transform: scale(1); box-shadow: 0 0 5px rgba(139,0,0,0.5); }
                    }
                  `}</style>
                    <span style={{ fontSize: '10px', color: currentTeam.code_solved ? '#28a745' : '#ff4d4d', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '2px' }}>
                    {currentTeam.code_solved ? '🔓 Gijzelaars Gelocaliseerd!' : teamCapturedMissions.length >= 2 ? 'Tik om code te raden!' : `🩸 Cijfers (${teamCapturedMissions.length}/2 Missies)`}
                  </span>
                    <div style={{
                      fontSize: '22px',
                      fontWeight: '900',
                      color: currentTeam.code_solved ? '#28a745' : '#ff1a1a',
                      letterSpacing: '6px',
                      fontFamily: 'Courier New, monospace',
                      textShadow: currentTeam.code_solved ? '0 0 8px rgba(40, 167, 69, 0.8)' : '0 0 8px rgba(255, 0, 0, 0.8)'
                    }}>
                      {currentTeam.code_solved ? '1993' : teamCapturedMissions.length === 1 ? '13   _ _' : '13   99'}
                    </div>
                  </div>
              )}

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
                    color: '#28a745',
                    cursor: 'pointer',
                    border: '1px solid #28a745',
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
              <div style={{ background: '#141414', border: '1px solid #d4af37', padding: '10px 14px', borderRadius: '6px', color: '#fff', boxShadow: '0 4px 10px rgba(0,0,0,0.8)' }}>
                <label style={{ fontSize: '11px', color: '#ffd700', fontWeight: 'bold', display: 'block', marginBottom: '6px', letterSpacing: '1px' }}>
                  🎯 KAART KLIK MODUS
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                      onClick={() => setAdminActionMode('mission')}
                      style={{
                        flex: 1,
                        padding: '6px',
                        background: adminActionMode === 'mission' ? '#8b0000' : '#222',
                        color: adminActionMode === 'mission' ? 'white' : '#aaa',
                        border: '1px solid #444',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 'bold'
                      }}
                  >
                    📍 Missie Plaatsen
                  </button>
                  <button
                      onClick={() => setAdminActionMode('destination')}
                      style={{
                        flex: 1,
                        padding: '6px',
                        background: adminActionMode === 'destination' ? '#28a745' : '#222',
                        color: adminActionMode === 'destination' ? 'black' : '#aaa',
                        border: '1px solid #444',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 'bold'
                      }}
                  >
                    🏁 Bestemming Plaatsen
                  </button>
                </div>
              </div>

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
                    <option value="">-- Selecteer Macchina Route --</option>
                    {teams.map(t => (
                        <option key={t.id} value={t.id}>Capo {t.driver_name}'s Crew</option>
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

        {draftMission && (
            <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', background: '#161616', color: '#e0e0e0', border: '2px solid #8b0000', padding: '20px', borderRadius: '8px', zIndex: 2000, display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '320px', boxShadow: '0 10px 25px rgba(0,0,0,0.9)' }}>
              <h3 style={{ margin: 0, color: '#d4af37', letterSpacing: '1px', textTransform: 'uppercase', fontSize: '15px', textAlign: 'center' }}>Locatie Missie Instellen</h3>
              <p style={{ fontSize: '11px', color: '#aaa', margin: 0, textAlign: 'center' }}>Sleep de <b>oranje cirkel-marker</b> op de kaart om het nep-zoekgebied te verplaatsen.</p>

              <div>
                <label style={{ fontSize: '12px', color: '#ffd700', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>Doel Foto (Locatie)</label>
                <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setTargetImageFile(e.target.files ? e.target.files[0] : null)}
                    style={{ width: '100%', marginBottom: '12px', color: '#e0e0e0', fontSize: '12px' }}
                />

                <button onClick={handlePublishMission} disabled={!targetImageFile || isAdminUploading} style={{ width: '100%', padding: '10px', background: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: targetImageFile ? 'pointer' : 'not-allowed', fontWeight: 'bold', textTransform: 'uppercase', opacity: targetImageFile ? 1 : 0.5 }}>
                  {isAdminUploading ? 'Bezig...' : '✅ Publiceer Missie'}
                </button>
              </div>

              <button onClick={() => setDraftMission(null)} style={{ padding: '8px', background: '#333', color: '#aaa', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Annuleren</button>
            </div>
        )}
        {isAdmin && editingMission && (
            <div style={{ position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)', background: '#161616', border: '2px solid #d4af37', padding: '15px', borderRadius: '8px', zIndex: 2000, display: 'flex', flexDirection: 'column', gap: '10px', boxShadow: '0 10px 25px rgba(0,0,0,0.9)', minWidth: '280px' }}>
              <div style={{ color: '#ffd700', fontSize: '13px', fontWeight: 'bold', textAlign: 'center' }}>
                🛠️ Zoekcentrum & Foto Bewerken<br/>
                <span style={{ color: '#aaa', fontSize: '11px', fontWeight: 'normal' }}>Sleep de oranje marker of upload een nieuwe foto.</span>
              </div>

              {editingMission.image_url && (
                  <div style={{ textAlign: 'center' }}>
                    <img src={editingMission.image_url} alt="Huidig doel" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #d4af37' }} />
                  </div>
              )}

              <div>
                <label style={{ fontSize: '11px', color: '#aaa', display: 'block', marginBottom: '4px' }}>Nieuwe Foto (Optioneel)</label>
                <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setEditingMissionImageFile(e.target.files ? e.target.files[0] : null)}
                    style={{ width: '100%', color: '#e0e0e0', fontSize: '11px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                <button onClick={async () => {
                  setIsAdminUploading(true);
                  let publicUrl = editingMission.image_url;

                  if (editingMissionImageFile) {
                    const compressedFile = await compressImage(editingMissionImageFile, { maxSizeMB: 0.2, maxWidthOrHeight: 1200 });
                    const fileName = `target_${Math.random()}.${compressedFile.name.split('.').pop()}`;
                    const { error } = await supabase.storage.from('proofs').upload(fileName, compressedFile);
                    if (!error) {
                      publicUrl = supabase.storage.from('proofs').getPublicUrl(fileName).data.publicUrl;
                    }
                  }

                  await supabase.from('missions').update({
                    display_lat: editingMission.display_lat,
                    display_lng: editingMission.display_lng,
                    image_url: publicUrl
                  }).eq('id', editingMission.id);

                  setEditingMission(null);
                  setEditingMissionImageFile(null);
                  setIsAdminUploading(false);
                  fetchAllData();
                }} disabled={isAdminUploading} style={{ flex: 1, padding: '8px', background: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {isAdminUploading ? 'Bezig...' : '✅ Opslaan'}
                </button>
                <button onClick={() => { setEditingMission(null); setEditingMissionImageFile(null); }} style={{ flex: 1, padding: '8px', background: '#8b0000', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                  ❌ Annuleren
                </button>
              </div>
            </div>
        )}
        {isAdmin && draftDestination && (
            <div style={{ position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)', background: '#161616', border: '2px solid #d4af37', padding: '15px', borderRadius: '8px', zIndex: 2000, display: 'flex', flexDirection: 'column', gap: '10px', boxShadow: '0 10px 25px rgba(0,0,0,0.9)', minWidth: '280px' }}>
              <div style={{ color: '#ffd700', fontSize: '13px', fontWeight: 'bold', textAlign: 'center' }}>
                🛠️ Checkpoint Conceptmodus
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#aaa', display: 'block', marginBottom: '4px' }}>Bestemming Foto (Optioneel)</label>
                <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setDestinationImageFile(e.target.files ? e.target.files[0] : null)}
                    style={{ width: '100%', color: '#e0e0e0', fontSize: '11px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                <button onClick={handlePublishDestination} disabled={isAdminUploading} style={{ flex: 1, padding: '8px', background: '#28a745', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {isAdminUploading ? 'Bezig...' : '✅ Publiceer'}
                </button>
                <button onClick={() => setDraftDestination(null)} style={{ flex: 1, padding: '8px', background: '#8b0000', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}>
                  ❌ Annuleren
                </button>
              </div>
            </div>
        )}

        {captureMission && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.92)', zIndex: 2000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
              <h2 style={{ color: '#d4af37', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '5px' }}>
                Locatie Bereikt
              </h2>
              <p style={{ color: '#aaa', fontStyle: 'italic', marginBottom: '20px', textAlign: 'center' }}>Maak een groepsfoto op deze locatie als bewijs voor de Don...</p>
              <input type="file" accept="image/*" capture="user" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProofFile(e.target.files ? e.target.files[0] : null)} style={{ margin: '15px 0', color: 'white' }} />
              <div style={{ display: 'flex', gap: '15px' }}>
                <button onClick={handlePlayerCapture} disabled={isPlayerUploading || !proofFile} style={{ padding: '12px 24px', background: '#28a745', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', textTransform: 'uppercase', cursor: 'pointer' }}>
                  {isPlayerUploading ? 'Bewijs Versturen...' : 'Bevestig Reddingsbewijs'}
                </button>
                <button onClick={() => { setCaptureMission(null); setProofFile(null); }} style={{ padding: '12px 24px', background: '#8b0000', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Annuleren</button>
              </div>
            </div>
        )}

        {showUnlockModal && (
            <div
                onClick={handleDismissUnlockModal}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(5, 2, 2, 0.95)',
                  zIndex: 9999,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '20px',
                  cursor: 'pointer',
                  animation: 'fadeIn 0.4s ease-out'
                }}
            >
              <style>{`
              @keyframes pulseGlow {
                0% { transform: scale(0.95); text-shadow: 0 0 10px rgba(255,0,0,0.8), 0 0 30px rgba(139,0,0,0.9); }
                50% { transform: scale(1.05); text-shadow: 0 0 25px rgba(255,0,0,1), 0 0 50px rgba(255,26,26,1); }
                100% { transform: scale(0.95); text-shadow: 0 0 10px rgba(255,0,0,0.8), 0 0 30px rgba(139,0,0,0.9); }
              }
            `}</style>

              <div style={{
                border: '2px solid #8b0000',
                background: 'linear-gradient(180deg, #160000 0%, #0a0a0a 100%)',
                borderRadius: '12px',
                padding: '30px 24px',
                maxWidth: '400px',
                width: '100%',
                textAlign: 'center',
                boxShadow: '0 10px 40px rgba(139,0,0,0.8)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '16px'
              }}>
              <span style={{ fontSize: '12px', color: '#ffd700', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 'bold' }}>
                🇮🇹 Bericht van de Don
              </span>
                <h2 style={{ margin: 0, color: '#ff4d4d', fontSize: '22px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Code Bemachtigd!
                </h2>
                <p style={{ fontSize: '12px', color: '#aaa', margin: 0, fontStyle: 'italic' }}>
                  Cari Maffiosi di Arsellini,<br/>
                  De Don heeft jullie bewijs goedgekeurd.
                </p>

                <div style={{
                  fontSize: '38px',
                  fontWeight: '900',
                  color: '#ff1a1a',
                  letterSpacing: '10px',
                  fontFamily: 'Courier New, monospace',
                  margin: '15px 0',
                  animation: 'pulseGlow 2s infinite ease-in-out'
                }}>
                  {unlockedModalDigits}
                </div>

                <button
                    onClick={handleDismissUnlockModal}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: '#8b0000',
                      color: 'white',
                      border: '1px solid #ff4d4d',
                      borderRadius: '6px',
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                >
                  Tik om door te gaan ➔
                </button>
              </div>
            </div>
        )}

        <MapContainer center={mapCenter} zoom={14} style={{ height: '100%', width: '100%', zIndex: 1 }}>
          <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
              attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ"
              maxZoom={16}
          />
          <AdminMapEvents />

          <DestinationEdgePointer destination={destination} draftDestination={draftDestination} isAdmin={isAdmin} hasUnlockedDestination={hasUnlockedDestination} />
          {isAdmin && editingMission && (
              <>
                <Marker position={[editingMission.lat, editingMission.lng]} icon={createDestinationIcon()} zIndexOffset={500} opacity={0.7} />
                <Marker
                    draggable={true}
                    eventHandlers={{
                      drag: (e) => setEditingMission({ ...editingMission, display_lat: e.target.getLatLng().lat, display_lng: e.target.getLatLng().lng })
                    }}
                    position={[editingMission.display_lat, editingMission.display_lng]}
                    zIndexOffset={600}
                >
                  <Popup>
                    <div style={{ textAlign: 'center', minWidth: '120px' }}>
                      <strong style={{ color: '#111', display: 'block' }}>🎯 Nieuw Nepcentrum</strong>
                      <span style={{ fontSize: '11px', color: '#666' }}>Sleep om te verplaatsen</span>
                    </div>
                  </Popup>
                </Marker>
                <SmoothCircle
                    center={[editingMission.display_lat, editingMission.display_lng]}
                    radius={MISSION_MAX_RADIUS_METERS}
                    pathOptions={{ fillColor: 'rgba(255, 165, 0, 0.2)', color: 'orange', weight: 2, dashArray: '5, 5' }}
                />
              </>
          )}
          {destination && !draftDestination && (
              <>
                {isAdmin || hasUnlockedDestination ? (
                    !isAdmin ? (
                        (() => {
                          const destRealLat = destination.real_lat ?? destination.lat;
                          const destRealLng = destination.real_lng ?? destination.lng;
                          const destFakeLat = destination.display_lat ?? destRealLat;
                          const destFakeLng = destination.display_lng ?? destRealLng;
                          const maxDestRadius = destination.radius_meters || MISSION_MAX_RADIUS_METERS;

                          const { center, radius, distanceToReal } = getShrinkingCircleParams(
                              destRealLat,
                              destRealLng,
                              destFakeLat,
                              destFakeLng,
                              maxDestRadius,
                              playerLat,
                              playerLng
                          );

                          if (distanceToReal <= MISSION_REVEAL_THRESHOLD_METERS && !destination.is_revealed) {
                            supabase.from('destinations').update({ is_revealed: true }).eq('id', 'active').then(() => {
                              fetchAllData();
                            });
                          }

                          if (destination.is_revealed || distanceToReal <= MISSION_REVEAL_THRESHOLD_METERS) {
                            return (
                                <Marker position={[destRealLat, destRealLng]} icon={createDestinationIcon(destination.image_url)} zIndexOffset={500}>
                                  <Popup>
                                    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '150px' }}>
                                      <img
                                          src={destination.image_url || '/destination.png'}
                                          alt="Bestemming"
                                          onClick={() => setExpandedImage(destination.image_url || '/destination.png')}
                                          style={{ width: '100px', height: '100px', objectFit: 'cover', border: '2px solid #28a745', borderRadius: '8px', cursor: 'zoom-in', marginBottom: '8px' }}
                                      />
                                      <strong style={{ color: '#28a745', fontSize: '15px' }}>🏁 BESTEMMING</strong>
                                      <p style={{ fontSize: '11px', color: '#aaa', margin: '4px 0 8px' }}>Rijd naar deze exacte locatie!</p>
                                    </div>
                                  </Popup>
                                </Marker>
                            );
                          }

                          return (
                              <SmoothCircle
                                  center={center}
                                  radius={radius}
                                  pathOptions={{ fillColor: 'rgba(0, 255, 255, 0.15)', color: '#28a745', weight: 2 }}
                              >
                                <Popup>
                                  <div style={{ textAlign: 'center' }}>
                                    <strong style={{ color: '#28a745' }}>🏁 Bestemming Zoekgebied</strong>
                                    <p style={{ fontSize: '11px', color: '#aaa' }}>Kom dichterbij ({Math.round(distanceToReal)}m) om de zone te vernauwen.</p>
                                  </div>
                                </Popup>
                              </SmoothCircle>
                          );
                        })()
                    ) : (
                        <>
                          <Marker position={[destination.real_lat, destination.real_lng]} icon={createDestinationIcon()} zIndexOffset={500}>
                            <Popup>
                              <div style={{ textAlign: 'center', minWidth: '150px' }}>
                                <strong style={{ color: '#28a745', fontSize: '15px' }}>🏁 ECHTE CHECKPOINT</strong>
                                <button onClick={handleClearDestination} style={{ width: '100%', marginTop: '4px', padding: '6px', background: '#8b0000', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                                  🗑️ Wis Bestemming
                                </button>
                              </div>
                            </Popup>
                          </Marker>

                          {!destination.is_revealed && (
                              <>
                                <Marker position={[destination.display_lat, destination.display_lng]} zIndexOffset={400}>
                                  <Popup>
                                    <div style={{ textAlign: 'center', minWidth: '140px' }}>
                                      <strong style={{ color: '#111', display: 'block', marginBottom: '8px' }}>⚙️ Huidige Zoekzone</strong>
                                      <button onClick={handleEditDestination} style={{ width: '100%', padding: '6px', background: '#d4af37', color: 'black', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                                        ✏️ Bewerk Zone
                                      </button>
                                      <span style={{ fontSize: '11px', color: '#666', fontWeight: 'bold', display: 'block', marginTop: '6px' }}>Straal: {Math.round(destination.radius_meters)}m</span>
                                    </div>
                                  </Popup>
                                </Marker>
                                <SmoothCircle center={[destination.display_lat, destination.display_lng]} radius={destination.radius_meters || 500} pathOptions={{ fillColor: 'rgba(0, 255, 255, 0.1)', color: '#28a745', weight: 2, dashArray: '5, 5' }} />
                              </>
                          )}
                        </>
                    )
                ) : null}
              </>
          )}
          {isAdmin && draftMission && (
              <>
                <Marker position={[draftMission.real_lat, draftMission.real_lng]} icon={createDestinationIcon()} zIndexOffset={500} opacity={0.7} />
                <Marker
                    draggable={true}
                    eventHandlers={{
                      drag: (e) => setDraftMission({ ...draftMission, display_lat: e.target.getLatLng().lat, display_lng: e.target.getLatLng().lng })
                    }}
                    position={[draftMission.display_lat, draftMission.display_lng]}
                    zIndexOffset={600}
                >
                  <Popup>
                    <div style={{ textAlign: 'center', minWidth: '130px' }}>
                      <strong style={{ color: '#111', display: 'block' }}>🎯 Nep Zoekcentrum</strong>
                      <span style={{ fontSize: '11px', color: '#666' }}>Sleep hier om te verplaatsen waar spelers het zoeken</span>
                    </div>
                  </Popup>
                </Marker>
                <SmoothCircle
                    center={[draftMission.display_lat, draftMission.display_lng]}
                    radius={MISSION_MAX_RADIUS_METERS}
                    pathOptions={{ fillColor: 'rgba(255, 165, 0, 0.2)', color: 'orange', weight: 2, dashArray: '5, 5' }}
                />
              </>
          )}
          {isAdmin && draftDestination && (
              <>
                <Marker position={[draftDestination.real_lat, draftDestination.real_lng]} icon={createDestinationIcon()} zIndexOffset={500} opacity={0.6} />

                <Marker
                    draggable={true}
                    eventHandlers={{
                      drag: (e) => setDraftDestination({ ...draftDestination, display_lat: e.target.getLatLng().lat, display_lng: e.target.getLatLng().lng })
                    }}
                    position={[draftDestination.display_lat, draftDestination.display_lng]}
                    zIndexOffset={400}
                >
                  <Popup>
                    <div style={{ textAlign: 'center', minWidth: '120px' }}>
                      <strong style={{ color: '#111', display: 'block' }}>🛠️ Midden</strong>
                      <span style={{ fontSize: '11px', color: '#666' }}>Sleep om te verplaatsen</span>
                    </div>
                  </Popup>
                </Marker>

                <Marker
                    draggable={true}
                    eventHandlers={{
                      drag: (e) => {
                        const centerLatLng = L.latLng(draftDestination.display_lat, draftDestination.display_lng);
                        const newRadius = centerLatLng.distanceTo(e.target.getLatLng());
                        setDraftDestination({ ...draftDestination, radius_meters: Math.max(50, newRadius) });
                      }
                    }}
                    position={calculateEdgePosition(draftDestination.display_lat, draftDestination.display_lng, draftDestination.radius_meters)}
                    zIndexOffset={401}
                >
                  <Popup>
                    <div style={{ textAlign: 'center', minWidth: '120px' }}>
                      <strong style={{ color: '#111', display: 'block' }}>📏 Grootte</strong>
                      <span style={{ fontSize: '11px', color: '#666' }}>Sleep om te schalen<br/>({Math.round(draftDestination.radius_meters)}m)</span>
                    </div>
                  </Popup>
                </Marker>

                <SmoothCircle
                    center={[draftDestination.display_lat, draftDestination.display_lng]}
                    radius={draftDestination.radius_meters}
                    pathOptions={{ fillColor: 'rgba(255, 165, 0, 0.2)', color: 'orange', weight: 2, dashArray: '5, 5' }}
                />
              </>
          )}

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

                    const uploader = users.find(u => u.id === log.user_id);
                    const uploaderName = uploader ? uploader.name : 'Macchina';

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
                              <span style={{ color: '#d4af37', fontWeight: 'bold' }}>👤 {uploaderName}</span><br />
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

          {teams.filter(t => t.lat && t.lng).map(team => (
              <SmoothTeamMarker
                  key={team.id}
                  team={team}
                  currentTeamId={currentTeam?.id}
                  users={users}
              />
          ))}

          {missions.filter(m => !m.team_id).map((baseMission) => {
            const completions = missions.filter(m => m.team_id && m.lat === baseMission.lat && m.lng === baseMission.lng);
            const myTeamCompletion = currentTeam ? completions.find(c => c.team_id === currentTeam.id) : null;
            const reactKey = `mission-${baseMission.id}`;

            if (isAdmin) {
              const hasPendingReviews = completions.some(c => c.status === 'pending');
              const markerColor = hasPendingReviews ? '#ffd700' : '#8b0000';
              return (
                  <Marker key={reactKey} position={[baseMission.lat, baseMission.lng]} icon={createPortraitIcon(baseMission.image_url, markerColor)}>
                    <Popup>
                      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '220px' }}>
                        {baseMission.image_url && (
                            <img src={baseMission.image_url} alt="Locatie" onClick={() => setExpandedImage(baseMission.image_url)} style={{ width: '80px', height: '80px', objectFit: 'cover', border: `2px solid ${markerColor}`, borderRadius: '8px', cursor: 'zoom-in', marginBottom: '8px' }} />
                        )}
                        <strong style={{ fontSize: '15px', color: markerColor }}>{baseMission.title} {hasPendingReviews ? '(Actie Vereist)' : '(Admin)'}</strong>
                        <div style={{ width: '100%', marginTop: '10px', background: '#1a1a1a', padding: '8px', borderRadius: '6px', border: '1px solid #333' }}>
                          <strong style={{ fontSize: '12px', color: '#d4af37' }}>Team Inzendingen ({completions.length})</strong>
                          {completions.map(c => {
                            const team = teams.find(t => t.id === c.team_id);
                            return (
                                <div key={c.id} style={{ borderTop: '1px solid #333', marginTop: '6px', paddingTop: '6px', textAlign: 'left' }}>
                                  <span style={{ fontSize: '12px', color: team?.color || '#fff', fontWeight: 'bold' }}>Capo {team?.driver_name}</span>
                                  <span style={{ fontSize: '11px', color: '#aaa', marginLeft: '6px' }}>({c.status})</span>
                                  {c.proof_url && <img src={c.proof_url} alt="Bewijs" onClick={() => setExpandedImage(c.proof_url)} style={{ width: '100%', marginTop: '4px', borderRadius: '4px', cursor: 'zoom-in', border: `1px solid ${c.status === 'captured' ? '#28a745' : '#ffd700'}` }} />}
                                  {c.status === 'pending' && (
                                      <div style={{ display: 'flex', gap: '5px', marginTop: '6px' }}>
                                        <button onClick={() => handleApproveCapture(c.id)} style={{ flex: 1, background: '#28a745', color: 'white', border: 'none', padding: '4px', cursor: 'pointer', borderRadius: '3px', fontSize: '11px' }}>✅ Goedkeuren</button>
                                        <button onClick={() => handleRejectCapture(c.id)} style={{ flex: 1, background: '#8b0000', color: 'white', border: 'none', padding: '4px', cursor: 'pointer', borderRadius: '3px', fontSize: '11px' }}>❌ Afkeuren</button>
                                      </div>
                                  )}
                                </div>
                            );
                          })}
                        </div>
                        <button
                            onClick={() => setEditingMission({
                              ...baseMission,
                              display_lat: baseMission.display_lat ?? baseMission.lat,
                              display_lng: baseMission.display_lng ?? baseMission.lng
                            })}
                            style={{ width: '100%', marginTop: '8px', background: '#d4af37', color: 'black', border: 'none', padding: '6px', cursor: 'pointer', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold' }}
                        >
                          ✏️ Bewerk Nep Zoekcentrum
                        </button>
                        <button onClick={() => handleDeleteMission(baseMission.id, baseMission.lat, baseMission.lng)} style={{ width: '100%', marginTop: '10px', background: '#8b0000', color: 'white', border: 'none', padding: '6px', cursor: 'pointer', borderRadius: '4px', fontSize: '12px' }}>🗑️ Wis Missie Voor Iedereen</button>
                      </div>
                    </Popup>
                  </Marker>
              );
            }

            const realLat = baseMission.lat;
            const realLng = baseMission.lng;
            const fakeLat = baseMission.display_lat ?? realLat;
            const fakeLng = baseMission.display_lng ?? realLng;

            const { center, radius, distanceToReal } = getShrinkingCircleParams(
                realLat,
                realLng,
                fakeLat,
                fakeLng,
                MISSION_MAX_RADIUS_METERS,
                playerLat,
                playerLng
            );

            if (myTeamCompletion && myTeamCompletion.status === 'captured') {
              return (
                  <Marker key={reactKey} position={[realLat, realLng]} icon={createCapturedCheckIcon(baseMission.image_url, currentTeam?.color || '#28a745')}>
                    <Popup>
                      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <strong style={{ color: '#28a745' }}>Missie Voltooid!</strong>
                        <span style={{ fontSize: '11px', color: '#aaa', marginBottom: '8px' }}>Jouw crew heeft deze locatie bereikt.</span>
                      </div>
                    </Popup>
                  </Marker>
              );
            }

            if (myTeamCompletion && myTeamCompletion.status === 'pending') {
              return (
                  <Marker key={reactKey} position={[realLat, realLng]} icon={createPortraitIcon(baseMission.image_url, '#ffd700')}>
                    <Popup>
                      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <strong style={{ color: '#ffd700' }}>Bewijs Verifiëren</strong>
                        <p style={{ marginTop: '10px', fontStyle: 'italic', color: '#aaa', fontSize: '12px' }}>Jouw bewijs is geüpload. Wachten op de Don...</p>
                      </div>
                    </Popup>
                  </Marker>
              );
            }

            if (distanceToReal <= MISSION_REVEAL_THRESHOLD_METERS) {
              return (
                  <Marker key={reactKey} position={[realLat, realLng]} icon={createPortraitIcon(baseMission.image_url, '#8b0000')}>
                    <Popup>
                      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        {baseMission.image_url && (
                            <img src={baseMission.image_url} alt="Locatie" onClick={() => setExpandedImage(baseMission.image_url)} style={{ width: '100px', height: '100px', objectFit: 'cover', border: '2px solid #8b0000', borderRadius: '8px', cursor: 'zoom-in', marginBottom: '8px' }} />
                        )}
                        <strong style={{ fontSize: '16px', color: '#ff4d4d' }}>{baseMission.title}</strong>
                        <span style={{ fontSize: '11px', color: '#aaa', fontStyle: 'italic' }}>Tik op de foto om te vergroten</span>

                        {currentTeam ? (
                            <button onClick={() => setCaptureMission(baseMission)} style={{ width: '100%', marginTop: '10px', background: '#8b0000', color: 'white', border: '1px solid #ff4d4d', padding: '8px', cursor: 'pointer', fontWeight: 'bold', borderRadius: '4px', textTransform: 'uppercase' }}>Bewijs Uploaden</button>
                        ) : (
                            <span style={{ fontSize: '11px', color: '#888', fontStyle: 'italic', display: 'block', marginTop: '5px' }}>Sluit je aan bij een crew</span>
                        )}
                      </div>
                    </Popup>
                  </Marker>
              );
            }

            return (
                <SmoothCircle
                    key={reactKey}
                    center={center}
                    radius={radius}
                    pathOptions={{ fillColor: 'rgba(255, 0, 0, 0.2)', color: '#ff4d4d', weight: 2 }}
                >
                  <Popup>
                    <div style={{ textAlign: 'center' }}>
                      <strong style={{ color: '#ff4d4d' }}>❓ Zoekgebied</strong>
                      <p style={{ fontSize: '11px', color: '#aaa' }}>Kom dichterbij ({Math.round(distanceToReal)}m) om de locatie te ontdekken.</p>
                    </div>
                  </Popup>
                </SmoothCircle>
            );
          })}
        </MapContainer>

        {isAdmin && teams && teams.length > 0 && (
            <div style={{
              position: 'absolute',
              bottom: '30px',
              left: '12px',
              zIndex: 1000,
              background: '#1a1a1a',
              padding: '15px',
              borderRadius: '8px',
              border: '1px solid #333',
              color: 'white',
              boxShadow: '0 4px 12px rgba(0,0,0,0.8)'
            }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#d4af37' }}>Locatie Tracking</h4>

              {teams.map((team) => (
                  <div key={team.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '15px' }}>
                  <span style={{ color: team.color || '#fff', fontWeight: 'bold' }}>
                    Capo {team.driver_name}
                  </span>

                    <button
                        onClick={() => handleToggleTracking(team.id, team.is_tracking_active)}
                        style={{
                          background: team.is_tracking_active ? '#28a745' : '#444',
                          color: 'white',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}
                    >
                      {team.is_tracking_active ? '📍 AAN' : 'UIT'}
                    </button>
                  </div>
              ))}
            </div>
        )}

        {showCodeGuessModal && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(5, 2, 2, 0.95)',
              zIndex: 9999,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px'
            }}>
              <div style={{
                border: guessError ? '2px solid #ff1a1a' : '2px solid #8b0000',
                background: 'linear-gradient(180deg, #160000 0%, #0a0a0a 100%)',
                borderRadius: '12px',
                padding: '30px 24px',
                maxWidth: '380px',
                width: '100%',
                textAlign: 'center',
                boxShadow: '0 10px 40px rgba(139,0,0,0.8)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '16px',
                animation: guessError ? 'shake 0.4s ease-in-out' : 'none'
              }}>
                <style>{`
              @keyframes shake {
                0%, 100% { transform: translateX(0); }
                20%, 60% { transform: translateX(-8px); }
                40%, 80% { transform: translateX(8px); }
              }
            `}</style>
                <span style={{ fontSize: '12px', color: '#ffd700', letterSpacing: '2px', textTransform: 'uppercase', fontWeight: 'bold' }}>
                🇮🇹 Laatste Test van de Don
              </span>
                <h3 style={{ margin: 0, color: '#ff4d4d', fontSize: '18px', textTransform: 'uppercase' }}>
                  Vorm de 4-cijferige Code
                </h3>
                <p style={{ fontSize: '11px', color: '#aaa', margin: 0, fontStyle: 'italic' }}>
                  Tik op de cijfers hieronder om ze in de juiste volgorde op de onderste rij te plaatsen.
                </p>

                <div style={{ display: 'flex', gap: '8px', margin: '5px 0' }}>
                  {sourceDigits.map((digit, index) => {
                    const isUsed = selectedIndices.includes(index);
                    return (
                        <button
                            key={index}
                            onClick={() => handleSelectDigit(index)}
                            disabled={isUsed}
                            style={{
                              width: '48px',
                              height: '56px',
                              fontSize: '24px',
                              background: isUsed ? '#1a1a1a' : '#111',
                              border: `2px solid ${isUsed ? '#444' : '#d4af37'}`,
                              borderRadius: '6px',
                              color: isUsed ? '#555' : '#ffd700',
                              fontWeight: 'bold',
                              fontFamily: 'Courier New, monospace',
                              cursor: isUsed ? 'not-allowed' : 'pointer',
                              opacity: isUsed ? 0.4 : 1,
                              transition: 'all 0.2s ease'
                            }}
                        >
                          {digit}
                        </button>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: '8px', margin: '10px 0' }}>
                  {[0, 1, 2, 3].map((slotIndex) => {
                    const sourceIndex = selectedIndices[slotIndex];
                    const digit = sourceIndex !== undefined ? sourceDigits[sourceIndex] : '';
                    return (
                        <div
                            key={slotIndex}
                            onClick={() => {
                              if (sourceIndex !== undefined) handleRemoveDigit(slotIndex);
                            }}
                            style={{
                              width: '48px',
                              height: '56px',
                              fontSize: '24px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: '#0a0a0a',
                              border: `2px solid ${digit ? '#ff1a1a' : '#444'}`,
                              borderRadius: '6px',
                              color: '#ff1a1a',
                              fontWeight: 'bold',
                              fontFamily: 'Courier New, monospace',
                              cursor: digit ? 'pointer' : 'default',
                              boxShadow: digit ? '0 0 8px rgba(255,0,0,0.3)' : 'none'
                            }}
                            title={digit ? 'Klik om terug te zetten' : ''}
                        >
                          {digit || '_'}
                        </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: '5px' }}>
                  <button
                      onClick={handleVerifyCode}
                      disabled={selectedIndices.length < 4}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: selectedIndices.length === 4 ? '#28a745' : '#444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        cursor: selectedIndices.length === 4 ? 'pointer' : 'not-allowed',
                        opacity: selectedIndices.length === 4 ? 1 : 0.6
                      }}
                  >
                    Bevestig Code
                  </button>
                  <button
                      onClick={() => {
                        setShowCodeGuessModal(false);
                        setSelectedIndices([]);
                      }}
                      style={{
                        padding: '12px 16px',
                        background: '#8b0000',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                  >
                    Sluiten
                  </button>
                </div>
              </div>
            </div>
        )}

        {expandedImage && (
            <div
                onClick={() => setExpandedImage(null)}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.92)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', cursor: 'zoom-out' }}
            >
              <img
                  src={expandedImage}
                  alt="Vergroot"
                  style={{ maxWidth: '100%', maxHeight: '100%', border: '2px solid #d4af37', borderRadius: '8px', objectFit: 'contain' }}
              />
            </div>
        )}
      </div>
  );
}
import React, { useState, useEffect, useRef } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { io, Socket } from 'socket.io-client';
import type { User, Message } from './types';

const GOOGLE_CLIENT_ID = '150022750196-93l8mvoc3q8spoj9n9vlb53v65vno6vs.apps.googleusercontent.com';
const BACKEND_URL = 'http://localhost:5000';
const LOGIN_SLIDES = [
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80',
];
const INTEREST_OPTIONS = [
  'casual chat',
  'flirting and dating',
  'speaking',
  'story telling',
  'cultural exchanges',
  'hobbies',
  'diy',
  'tech',
  'learning new languages',
  'trivia',
  'games',
];
const COUNTRY_OPTIONS = [
  'United States', 'United Kingdom', 'Canada', 'Australia', 'India', 'Nepal', 'Germany', 'France', 'Brazil', 'Japan', 'China', 'Mexico', 'Italy', 'Spain', 'Netherlands', 'Sweden', 'Norway', 'Denmark', 'Finland', 'South Korea', 'South Africa', 'New Zealand', 'Singapore', 'Thailand', 'Philippines', 'Vietnam', 'Malaysia', 'Indonesia', 'Argentina', 'Chile', 'Colombia', 'Peru', 'Russia', 'Turkey', 'Egypt', 'Morocco', 'Kenya', 'Israel', 'Saudi Arabia', 'United Arab Emirates', 'Switzerland', 'Austria', 'Belgium', 'Portugal', 'Poland', 'Greece', 'Czech Republic', 'Ireland', 'Hungary', 'Romania', 'Ukraine', 'Indonesia',
];

type GoogleCredentialResponse = {
  credential?: string;
};

export default function App() {
  const [userProfile, setUserProfile] = useState<{
    id: string;
    name: string;
    email: string;
    picture?: string;
  } | null>(null);

  const [matches, setMatches] = useState<User[]>([]);
  const [activeChat, setActiveChat] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [profileCompleted, setProfileCompleted] = useState(false);
  const [profileData, setProfileData] = useState<{ name: string; age?: string; dob?: string; interests?: string[]; country?: string; photo?: string }>({ name: '', interests: [], country: '' });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [messagePreview, setMessagePreview] = useState<Record<string, string>>({});
  const [sentFriends, setSentFriends] = useState<Record<string, boolean>>({});
  const [loginSlideIndex, setLoginSlideIndex] = useState(0);

  const [isCalling, setIsCalling] = useState(false);
  const [receivingCall, setReceivingCall] = useState(false);
  const [callerSignal, setCallerSignal] = useState<RTCSessionDescriptionInit | null>(null);
  const [callerSocketId, setCallerSocketId] = useState<string>('');

  const socketRef = useRef<Socket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const remoteSocketIdRef = useRef<string | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const activeChatRef = useRef<User | null>(null);

  const handleGoogleSuccess = async (credentialResponse: GoogleCredentialResponse) => {
    try {
      const token = credentialResponse?.credential;
      if (!token) return;

      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        window
          .atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      const googleUser = JSON.parse(jsonPayload);

      setUserProfile({
        id: googleUser.sub,
        name: googleUser.name,
        email: googleUser.email,
        picture: googleUser.picture,
      });
      // prefill profile form with Google name
      setProfileData((p) => ({ ...p, name: googleUser.name || '' }));
    } catch (error) {
      console.error('Google login parsing failed', error);
    }
  };

  // initialize sockets and fetch matches only after profile setup is completed
  useEffect(() => {
    if (!userProfile || !profileCompleted) return;

    const fetchNearbyMatches = async (latitude: number, longitude: number) => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/nearby`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: userProfile.id,
            name: userProfile.name,
            lat: latitude,
            lng: longitude,
            radiusKm: 100,
            country: profileData.country,
          }),
        });

        const data = await response.json();
        if (data.success) {
          setMatches(data.matches || []);
        } else {
          console.error('Nearby API returned error', data);
        }
      } catch (error) {
        console.error('Failed fetching nearby matches', error);
      }
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        fetchNearbyMatches(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        console.error('Location access denied', error);
      }
    );

    const socket = io(BACKEND_URL, { query: { userId: userProfile.id } });
    socketRef.current = socket;

    socket.on('receive-message', (message: Message) => {
      setMessages((prev) => [...prev, message]);
      if (activeChatRef.current?.id !== message.fromUserId) {
        setUnreadCounts((prev) => ({
          ...prev,
          [message.fromUserId]: (prev[message.fromUserId] || 0) + 1,
        }));
        setMessagePreview((prev) => ({
          ...prev,
          [message.fromUserId]: message.text.slice(0, 18),
        }));
      }
    });

    socket.on('receive-file', ({ fromUserId, file, timestamp }: any) => {
      setMessages((prev) => [...prev, { fromUserId, text: `${file.name}`, timestamp, file }]);
      if (activeChatRef.current?.id !== fromUserId) {
        setUnreadCounts((prev) => ({
          ...prev,
          [fromUserId]: (prev[fromUserId] || 0) + 1,
        }));
        setMessagePreview((prev) => ({
          ...prev,
          [fromUserId]: file.name,
        }));
      }
    });

    socket.on('incoming-call', ({ fromSocketId, offer }: { fromSocketId: string; offer: RTCSessionDescriptionInit }) => {
      setReceivingCall(true);
      setCallerSignal(offer);
      setCallerSocketId(fromSocketId);
      remoteSocketIdRef.current = fromSocketId;
    });

    socket.on('call-ended', ({ fromSocketId }: any) => {
      if (peerRef.current) {
        peerRef.current.getSenders().forEach(s => s.track?.stop());
        peerRef.current.close();
        peerRef.current = null;
      }
      setIsCalling(false);
      setReceivingCall(false);
    });

    socket.on('friend-added', ({ fromUserId }: any) => {
      console.log('Friend added by', fromUserId);
    });

    socket.on('ice-candidate', ({ candidate }: { candidate: any }) => {
      if (peerRef.current && candidate) {
        peerRef.current.addIceCandidate(new RTCIceCandidate(candidate)).catch((e) => console.error(e));
      }
    });

    return () => {
      socket.off('receive-message');
      socket.off('incoming-call');
      socket.off('ice-candidate');
      socket.disconnect();
      socketRef.current = null;
      peerRef.current = null;
      remoteSocketIdRef.current = null;
    };
  }, [userProfile, profileCompleted]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLoginSlideIndex((current) => (current + 1) % LOGIN_SLIDES.length);
    }, 3600);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    activeChatRef.current = activeChat;
    if (activeChat) {
      setUnreadCounts((prev) => ({ ...prev, [activeChat.id]: 0 }));
      setMessagePreview((prev) => ({ ...prev, [activeChat.id]: '' }));
    }
  }, [activeChat]);

  const sendMessage = () => {
    if (!inputText.trim() || !activeChat || !socketRef.current || !userProfile) return;

    const message: Message = {
      fromUserId: userProfile.id,
      text: inputText.trim(),
      timestamp: Date.now(),
    };

    socketRef.current.emit('send-message', {
      toUserId: activeChat.id,
      text: message.text,
    });

    setMessages((prev) => [...prev, message]);
    setInputText('');
  };

  const sendFile = (file: File | null) => {
    if (!file || !activeChat || !socketRef.current || !userProfile) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result as string;
      const fileObj = { name: file.name, mime: file.type, data };
      socketRef.current?.emit('send-file', { toUserId: activeChat.id, file: fileObj });
      setMessages((prev) => [...prev, { fromUserId: userProfile.id, text: `[file] ${file.name}`, timestamp: Date.now(), file: fileObj }]);
    };
    reader.readAsDataURL(file);
  };

  const hangUp = () => {
    const toSocket = remoteSocketIdRef.current || callerSocketId;
    if (socketRef.current && toSocket) socketRef.current.emit('hangup', { toSocketId: toSocket });
    if (peerRef.current) {
      peerRef.current.getSenders().forEach(s => s.track?.stop());
      peerRef.current.close();
      peerRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    setIsCalling(false);
  };

  const signOut = () => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setUserProfile(null);
    setProfileCompleted(false);
    setProfileData({ name: '', interests: [], country: '' });
    setMatches([]);
    setActiveChat(null);
    setSentFriends({});
    setUnreadCounts({});
    setMessagePreview({});
  };

  const handleAvatarChange = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result as string;
      setAvatarPreview(data);
      setProfileData(p => ({ ...p, photo: data }));
    };
    reader.readAsDataURL(file);
  };

  const uploadProfilePhoto = async () => {
    if (!userProfile || !profileData.photo) return;
    try {
      setIsUploading(true);
      await fetch(`${BACKEND_URL}/api/upload-photo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: userProfile.id, photo: profileData.photo }) });
    } catch (e) {
      console.error('Upload failed', e);
    } finally { setIsUploading(false); }
  };

  const addFriend = (targetUserId: string) => {
    if (!socketRef.current) return;
    socketRef.current.emit('add-friend', { targetUserId });
    setSentFriends((prev) => ({ ...prev, [targetUserId]: true }));
  };

  const aiSuggest = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/ai-suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: inputText || '' }) });
      const data = await res.json();
      if (data.success && data.suggestions?.length) setInputText(data.suggestions[0]);
    } catch (e) { console.error(e); }
  };

  const setupWebRTC = async (remoteSocketId?: string) => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStreamRef.current = stream;

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    peer.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    peer.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        const toSocket = remoteSocketId || callerSocketId || remoteSocketIdRef.current;
        if (toSocket) {
          socketRef.current?.emit('ice-candidate', {
            toSocketId: toSocket,
            candidate: event.candidate,
          });
        }
      }
    };

    peerRef.current = peer;
    return peer;
  };

  const startCall = async (targetUser: User) => {
    if (!targetUser.socketId) {
      alert('This user is currently offline or unavailable for a call.');
      return;
    }

    setIsCalling(true);
    const peer = await setupWebRTC(targetUser.socketId);

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    // send target user id (and include socket id as fallback)
    socketRef.current?.emit('call-user', {
      targetUserId: targetUser.id,
      targetSocketId: targetUser.socketId,
      offer,
    });

    socketRef.current?.once('call-answered', async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
      if (answer) {
        await peer.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });
  };

  const acceptCall = async () => {
    if (!callerSignal || !callerSocketId) return;

    setReceivingCall(false);
    setIsCalling(true);
    const peer = await setupWebRTC(callerSocketId);

    await peer.setRemoteDescription(new RTCSessionDescription(callerSignal));
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);

    socketRef.current?.emit('answer-call', {
      toSocketId: callerSocketId,
      answer,
    });
  };

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      {!userProfile ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#f0f2f5',
          fontFamily: 'Inter, sans-serif',
        }}>
          <div style={{
            background: '#fff',
            padding: '40px',
            borderRadius: '16px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.08)',
            textAlign: 'center',
            width: '100%',
            maxWidth: '420px',
          }}>
            <h1 style={{ color: '#fd3b73', marginBottom: '18px', letterSpacing: '0.05em' }}>Soulmap</h1>
            <div style={{ marginBottom: '18px', height: 380, position: 'relative', overflow: 'hidden', borderRadius: 18, boxShadow: '0 18px 40px rgba(0,0,0,0.12)' }}>
              <img src={LOGIN_SLIDES[loginSlideIndex]} alt="Soulmap slide" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.4))' }} />
              <div style={{ position: 'absolute', bottom: 16, left: 90, color: '#fff', fontWeight: 700, textShadow: '0 2px 10px rgba(0,0,0,0.4)' }}>connect and chat instantly</div>
            </div>
            <div style={{ height: 1, background: '#eee', margin: '16px 0' }} />
            <p style={{ color: '#555', marginBottom: '20px' }}>
              Log in with Google to begin. After login, complete your profile to continue.
            </p>
            <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => console.error('Google login failed')} />
          </div>
        </div>
      ) : !profileCompleted ? (
        // show lightweight profile setup before entering the main app
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#f7fafc' }}>
          <div style={{ background: '#fff', padding: 28, borderRadius: 12, width: 420, boxShadow: '0 10px 30px rgba(0,0,0,0.06)' }}>
            <h2 style={{ marginTop: 0 }}>Complete your profile</h2>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
              <div style={{ width: 80, height: 80, borderRadius: 12, overflow: 'hidden', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {avatarPreview ? (
                  <img src={avatarPreview} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ color: '#9ca3af' }}>Upload</div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <input value={profileData.name} onChange={(e)=>setProfileData({...profileData, name: e.target.value})} placeholder="Name" style={{ width: '100%', padding: 10, marginBottom: 8, borderRadius: 8, border: '1px solid #e5e7eb' }} />

                <div style={{ display: 'flex', gap: 8 }}>
                  <input placeholder="Age" value={profileData.age || ''} onChange={(e)=>setProfileData({...profileData, age: e.target.value})} style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  <input placeholder="Date of birth" value={profileData.dob || ''} onChange={(e)=>setProfileData({...profileData, dob: e.target.value})} style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                </div>

                <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="file" accept="image/*" onChange={(e)=>handleAvatarChange(e.target.files?.[0])} />
                </div>
              </div>
            </div>

            <label style={{ display: 'block', marginBottom: 8 }}>Interests</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {INTEREST_OPTIONS.map((option) => {
                const selected = profileData.interests?.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      const next = selected
                        ? (profileData.interests || []).filter((interest) => interest !== option)
                        : [...(profileData.interests || []), option];
                      setProfileData({ ...profileData, interests: next });
                    }}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 999,
                      border: selected ? '1px solid #fd3b73' : '1px solid #d1d5db',
                      background: selected ? '#ffeef2' : '#f3f4f6',
                      color: selected ? '#b91c51' : '#111',
                      cursor: 'pointer',
                    }}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {(profileData.interests || []).map((t, i) => (
                <div key={i} style={{ background: '#f3f4f6', padding: '6px 10px', borderRadius: 999, fontSize: 13 }}>{t}</div>
              ))}
            </div>

            <label style={{ display: 'block', marginBottom: 8 }}>Country</label>
            <select value={profileData.country || ''} onChange={(e)=>setProfileData({...profileData, country: e.target.value})} style={{ width: '100%', padding: 10, marginBottom: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}>
              <option value="">Select country (optional)</option>
              {COUNTRY_OPTIONS.map((country) => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={async ()=>{
                // finalize profile: update userProfile name and upload photo then continue
                if (userProfile) {
                  setUserProfile({...userProfile, name: profileData.name || userProfile.name, picture: profileData.photo || userProfile.picture});
                }
                if (profileData.photo && userProfile) {
                  try { await fetch(`${BACKEND_URL}/api/upload-photo`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ userId: userProfile?.id, photo: profileData.photo }) }); } catch(e){console.error(e)}

                }
                setProfileCompleted(true);
                try {
                  const pos = await new Promise<GeolocationPosition>((resolve, reject)=>navigator.geolocation.getCurrentPosition(resolve, reject));
                  await fetch(`${BACKEND_URL}/api/nearby`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ userId: userProfile?.id, name: profileData.name, lat: pos.coords.latitude, lng: pos.coords.longitude, radiusKm: 100 }) });
                } catch (e) {
                  // ignore; main effect will also attempt to fetch
                }
              }} style={{ flex: 1, background: '#fd3b73', color: '#fff', border: 'none', padding: 12, borderRadius: 8 }}>Continue</button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
          <aside style={{ width: '32%', borderRight: '1px solid #eee', background: '#fcfcfc', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
              {userProfile.picture && (
                <img src={userProfile.picture} alt="Profile" style={{ width: 50, height: 50, borderRadius: '50%' }} />
              )}
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>{userProfile.name}</p>
                <p style={{ margin: '6px 0 0', color: '#2d8f5f', fontSize: '13px' }}>● Active online</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowEditProfile(true)} style={{ padding: '8px 10px', borderRadius: 8, background: '#fff', border: '1px solid #e5e7eb' }}>Edit</button>
                <button onClick={signOut} style={{ padding: '8px 10px', borderRadius: 8, background: '#fff', border: '1px solid #e5e7eb' }}>Sign Out</button>
              </div>
            </div>

            <div>
              <h3 style={{ margin: '0 0 18px', fontSize: '18px', color: '#333' }}>Nearby Discoveries</h3>
              <div style={{ display: 'grid', gap: '12px' }}>
                {matches.length === 0 ? (
                  <div style={{ color: '#888', padding: '22px', borderRadius: '14px', background: '#fff', textAlign: 'center' }}>
                    Finding local profiles near you...
                  </div>
                ) : (
                  matches.map((match) => (
                    <div key={match.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderRadius: '14px', border: activeChat?.id === match.id ? '2px solid #fd3b73' : '1px solid #e5e7eb', background: activeChat?.id === match.id ? '#fff0f4' : '#fff', cursor: 'pointer' }}>
                      <div onClick={() => { setActiveChat(match); setUnreadCounts(prev => ({ ...prev, [match.id]: 0 })); setMessagePreview(prev => ({ ...prev, [match.id]: '' })); }} style={{ flex: 1, textAlign: 'left' }}>
                        <p style={{ margin: 0, fontWeight: 700, color: '#222' }}>👤 {match.name}</p>
                        <p style={{ margin: '8px 0 0', color: '#666', fontSize: '13px' }}>📍 Nearby match</p>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {unreadCounts[match.id] > 0 && (
                          <div style={{ background: '#fd3b73', color: '#fff', borderRadius: 999, padding: '4px 8px', fontSize: 12, whiteSpace: 'nowrap' }}>
                            {messagePreview[match.id] ? `${messagePreview[match.id]}${messagePreview[match.id].length > 14 ? '...' : ''}` : unreadCounts[match.id]}
                          </div>
                        )}
                        <button type="button" onClick={(e)=>{ e.stopPropagation(); addFriend(match.id); }} style={{ padding: '8px 10px', borderRadius: 10, background: sentFriends[match.id] ? '#d1fae5' : '#eef2ff', border: '1px solid #e0e7ff' }}>
                          {sentFriends[match.id] ? 'Friend added' : 'Add Friend'}
                        </button>
                        {match.country && <span style={{ fontSize: 12, color: '#6b7280' }}>🌍 {match.country}</span>}
                        {match.socketId && <span style={{ color: '#10b981', fontSize: 12 }}>●</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>

          <main style={{ width: '68%', padding: '24px', display: 'flex', flexDirection: 'column' }}>
            {activeChat ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 60, height: 60, borderRadius: 18, overflow: 'hidden', cursor: 'pointer', border: '1px solid #e5e7eb' }} onClick={() => avatarInputRef.current?.click()}>
                      <img
                        src={avatarPreview || userProfile?.picture || 'https://via.placeholder.com/150?text=Profile'}
                        alt="Your profile"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <div>
                      <h2 style={{ margin: 0 }}>{activeChat.name}</h2>
                      <p style={{ margin: '8px 0 0', color: '#666' }}>Start a private chat or launch a quick video call.</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => startCall(activeChat)}
                      style={{
                        background: '#fd3b73',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '999px',
                        padding: '12px 20px',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      🎥 Video Call
                    </button>
                    {isCalling && (
                      <button
                        type="button"
                        onClick={hangUp}
                        style={{
                          background: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '999px',
                          padding: '12px 20px',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        Hang Up
                      </button>
                    )}
                  </div>
                </div>
                <input ref={(el) => { avatarInputRef.current = el; }} id="profile-avatar-upload" type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleAvatarChange(e.target.files?.[0])} />

                {isCalling && (
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '22px' }}>
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      style={{ width: '50%', borderRadius: '16px', background: '#000' }}
                    />
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      style={{ width: '50%', borderRadius: '16px', background: '#000' }}
                    />
                  </div>
                )}

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '18px', borderRadius: '18px', background: '#fbfbfb', border: '1px solid #eee' }}>
                    {messages.filter((message) => message.fromUserId === activeChat.id || message.fromUserId === userProfile.id).map((message, index) => {
                      const isSentByMe = message.fromUserId === userProfile.id;
                      return (
                        <div key={index} style={{ display: 'flex', justifyContent: isSentByMe ? 'flex-end' : 'flex-start', marginBottom: '12px' }}>
                          <div style={{
                            background: isSentByMe ? '#fd3b73' : '#e5e7eb',
                            color: isSentByMe ? '#fff' : '#111',
                            padding: '12px 16px',
                            borderRadius: '18px',
                            maxWidth: '70%',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}>
                            {message.file ? (
                              message.file.mime?.startsWith('image/') ? (
                                <img src={message.file.data} alt={message.file.name} style={{ maxWidth: '100%', borderRadius: 8 }} />
                              ) : (
                                <a href={message.file.data} download={message.file.name} style={{ color: isSentByMe ? '#fff' : '#111' }}>{message.file.name}</a>
                              )
                            ) : (
                              message.text
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => setInputText(t => t + ' 😊')} style={{ padding: 8, borderRadius: 8 }}>😊</button>
                      <button type="button" onClick={() => setInputText(t => t + ' 😂')} style={{ padding: 8, borderRadius: 8 }}>😂</button>
                      <button type="button" onClick={() => setInputText(t => t + ' ❤️')} style={{ padding: 8, borderRadius: 8 }}>❤️</button>
                    </div>

                    <input id="chat-file" type="file" style={{ display: 'none' }} onChange={(e) => sendFile(e.target.files?.[0] ?? null)} />
                    <label htmlFor="chat-file" style={{ cursor: 'pointer', padding: 8, borderRadius: 8, background: '#f3f4f6', border: '1px solid #e5e7eb' }}>📎</label>

                    <input
                      type="text"
                      value={inputText}
                      onChange={(event) => setInputText(event.target.value)}
                      onKeyDown={(event) => event.key === 'Enter' && sendMessage()}
                      placeholder={`Type a message to ${activeChat.name}...`}
                      style={{
                        flex: 1,
                        borderRadius: '999px',
                        border: '1px solid #d1d5db',
                        padding: '14px 18px',
                        fontSize: '14px',
                      }}
                    />

                    <button type="button" onClick={aiSuggest} style={{ padding: '10px 12px', borderRadius: 10, background: '#eef2ff', border: '1px solid #e0e7ff' }}>AI</button>

                    <button
                      type="button"
                      onClick={sendMessage}
                      style={{
                        borderRadius: '999px',
                        background: '#fd3b73',
                        color: '#fff',
                        border: 'none',
                        padding: '14px 22px',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Send
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: '#777' }}>
                <p style={{ fontSize: '48px', margin: 0 }}>💬</p>
                <h2 style={{ margin: '12px 0 6px' }}>Select a match to start chatting</h2>
                <p style={{ maxWidth: '420px', textAlign: 'center', lineHeight: 1.6 }}>
                  Choose a nearby profile from the left panel and send the first message. Video calls are available when the user is online.
                </p>
              </div>
            )}
          </main>

          {showEditProfile && (
            <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200 }}>
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }} onClick={()=>setShowEditProfile(false)} />
              <div style={{ background: '#fff', padding: 20, borderRadius: 12, width: 520, zIndex: 1300 }}>
                <h3 style={{ marginTop: 0 }}>Edit profile</h3>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ width: 100, height: 100, borderRadius: 12, overflow: 'hidden', background: '#f3f4f6' }}>
                    {avatarPreview ? <img src={avatarPreview} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (userProfile?.picture ? <img src={userProfile.picture} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{padding:10,color:'#9ca3af'}}>No photo</div>)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <input placeholder="Name" value={profileData.name} onChange={(e)=>setProfileData({...profileData, name: e.target.value})} style={{ width: '100%', padding: 8, marginBottom: 8, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input placeholder="Age" value={profileData.age || ''} onChange={(e)=>setProfileData({...profileData, age: e.target.value})} style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                      <input placeholder="Date of birth" value={profileData.dob || ''} onChange={(e)=>setProfileData({...profileData, dob: e.target.value})} style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <input type="file" accept="image/*" onChange={(e)=>handleAvatarChange(e.target.files?.[0])} />
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                  <button onClick={async ()=>{ if (userProfile) setUserProfile({...userProfile, name: profileData.name || userProfile.name, picture: profileData.photo || userProfile.picture}); if (profileData.photo && userProfile) await fetch(`${BACKEND_URL}/api/upload-photo`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ userId: userProfile?.id, photo: profileData.photo }) }); setShowEditProfile(false); }} style={{ padding: '8px 12px', borderRadius: 8, background: '#10b981', color: '#fff', border: 'none' }}>Save</button>
                  <button onClick={()=>setShowEditProfile(false)} style={{ padding: '8px 12px', borderRadius: 8, background: '#e5e7eb', border: 'none' }}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {receivingCall && (
            <div style={{ position: 'fixed', top: 20, right: 20, width: 320, background: '#fff', borderRadius: 18, boxShadow: '0 24px 64px rgba(0,0,0,0.16)', padding: '24px', zIndex: 1000 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '16px' }}>Incoming video call</p>
              <p style={{ margin: '12px 0 20px', color: '#555' }}>Someone wants to connect with you now.</p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={acceptCall}
                  style={{ flex: 1, background: '#28a745', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 0', cursor: 'pointer', fontWeight: 700 }}
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => setReceivingCall(false)}
                  style={{ flex: 1, background: '#e5e7eb', color: '#111', border: 'none', borderRadius: 12, padding: '12px 0', cursor: 'pointer', fontWeight: 700 }}
                >
                  Decline
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </GoogleOAuthProvider>
  );
}
